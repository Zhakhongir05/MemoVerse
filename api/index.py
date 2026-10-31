"""Same-origin FastAPI entrypoint for Vercel; secrets remain server-side."""
from backend.main import app
from backend.agent import ScenePipeline, Settings

# Vercel may dispatch requests without running the ASGI lifespan first.
if not hasattr(app.state, 'pipeline'):
    app.state.pipeline = ScenePipeline(Settings.from_env())

@app.get('/api/health')
def api_health():
    return {'status': 'ok'}
