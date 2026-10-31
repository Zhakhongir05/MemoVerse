"""Vercel ASGI entrypoint; credentials remain runtime environment variables."""
from backend.main import app
from backend.agent import ScenePipeline, Settings

# Serverless adapters may dispatch before ASGI lifespan startup.
# Reuse one pipeline per warm instance; regular lifespan remains unchanged.
if not hasattr(app.state, 'pipeline'):
    app.state.pipeline = ScenePipeline(Settings.from_env())

@app.get('/api/health')
def hosted_health():
    return {'status': 'ok'}
