import io
import warnings
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, File, Form, UploadFile, Depends, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from PIL import Image, UnidentifiedImageError
from starlette.concurrency import run_in_threadpool

try:
    from .agent import Settings, ScenePipeline, PipelineFailure
    from .schemas import GenerateResponse, Scene
except ImportError:
    from agent import Settings, ScenePipeline, PipelineFailure
    from schemas import GenerateResponse, Scene

# Explicit path: never search upward for a potentially tracked root .env.
load_dotenv(Path(__file__).with_name('.env'), override=False)
MAX_PHOTO_BYTES = 5 * 1024 * 1024

@asynccontextmanager
async def lifespan(app):
    app.state.pipeline = ScenePipeline(Settings.from_env())
    yield
    await app.state.pipeline.close()

app = FastAPI(title='MemoVerse Backend', lifespan=lifespan)


# Bound the full request before multipart parsing, including chunked bodies.
# Buffers at most 5 MB plus 64 KB of allowed multipart overhead per request.
class BodyLimitMiddleware:
    def __init__(self, app):
        self.app = app
    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http' or scope.get('path') != '/api/generate-scene':
            return await self.app(scope, receive, send)
        limit = MAX_PHOTO_BYTES + 64 * 1024
        body = bytearray()
        while True:
            message = await receive()
            if message['type'] == 'http.disconnect':
                return
            body.extend(message.get('body', b''))
            if len(body) > limit:
                response = JSONResponse(status_code=413, content={'detail': [{'loc': ['body', 'photo'], 'type': 'file_too_large', 'msg': 'Photo must be at most 5 MB; multipart overhead is limited.'}]})
                await response(scope, receive, send)
                return
            if not message.get('more_body', False):
                break
        delivered = False
        async def replay():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {'type': 'http.request', 'body': bytes(body), 'more_body': False}
            return await receive()
        await self.app(scope, replay, send)
app.add_middleware(BodyLimitMiddleware)
app.add_middleware(CORSMiddleware, allow_origins=[
    'http://localhost:5173', 'http://127.0.0.1:5173',
    'http://localhost:3000', 'http://127.0.0.1:3000',
], allow_credentials=False, allow_methods=['GET', 'POST'], allow_headers=['Content-Type'])

@app.exception_handler(RequestValidationError)
async def validation_error(_request, error):
    # Never echo Pydantic's input value: it may contain a private story.
    return JSONResponse(status_code=422, content={'detail': [
        {'loc': list(item['loc']), 'type': item['type'], 'msg': item['msg']} for item in error.errors()
    ]})

class InputError(Exception):
    def __init__(self, field, message, code='invalid_input', status=422):
        self.field, self.message, self.code, self.status = field, message, code, status

@app.exception_handler(InputError)
async def input_error(_request, error):
    return JSONResponse(status_code=error.status, content={'detail': [
        {'loc': ['body', error.field], 'type': error.code, 'msg': error.message}
    ]})

@app.exception_handler(PipelineFailure)
async def pipeline_error(_request, error):
    return JSONResponse(status_code=504 if error.code == 'provider_timeout' else 503 if error.code == 'missing_credentials' else 502,
                        content={'detail': [{'loc': ['provider'], 'type': error.code, 'msg': 'Scene generation unavailable. Retry or enable demo mode.'}]})

@app.middleware('http')
async def private_responses(request, call_next):
    response = await call_next(request)
    response.headers['Cache-Control'] = 'no-store'
    return response

@app.get('/')
def root():
    return {'project': 'MemoVerse', 'status': 'ok'}

@app.get('/health')
def health():
    return {'status': 'ok'}

@app.get('/api/scene-schema')
def scene_schema():
    return {'status': 'proposal_pending_renderer_confirmation', 'schema': Scene.model_json_schema()}

def get_pipeline(request: Request):
    return request.app.state.pipeline

def validate_photo(data, declared_mime):
    actual = None
    if data.startswith(b'\xff\xd8\xff'):
        actual = 'image/jpeg'
    elif data.startswith(b'\x89PNG\r\n\x1a\n'):
        actual = 'image/png'
    elif len(data) >= 12 and data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        actual = 'image/webp'
    if actual is None or declared_mime != actual:
        raise InputError('photo', 'Upload a JPEG, PNG or WebP with matching content type and signature.', 'invalid_image')
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as image:
                if image.format not in ('JPEG', 'PNG', 'WEBP') or image.width * image.height > 20_000_000 or getattr(image, 'n_frames', 1) != 1:
                    raise ValueError('unsupported dimensions or animation')
                image.verify()
            with Image.open(io.BytesIO(data)) as image:
                image.load()
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombWarning, Image.DecompressionBombError):
        raise InputError('photo', 'Image is corrupt, animated, or exceeds 20 megapixels.', 'invalid_image') from None
    return actual

@app.post('/api/generate-scene', response_model=GenerateResponse)
async def generate_scene(story: str = Form(...), photo: UploadFile = File(...), pipeline=Depends(get_pipeline)):
    try:
        story = story.strip()
        if not story or len(story) > 2000:
            raise InputError('story', 'Story must contain 1–2000 characters after trimming.', 'invalid_story')
        data = await photo.read(MAX_PHOTO_BYTES + 1)
        if len(data) > MAX_PHOTO_BYTES:
            raise InputError('photo', 'Photo must be at most 5 MB.', 'file_too_large', 413)
        mime = await run_in_threadpool(validate_photo, data, photo.content_type)
        return await pipeline.generate(story, data, mime)
    finally:
        await photo.close()
