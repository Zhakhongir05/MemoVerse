"""Local backend-only browser fixture. No paid providers or production keys."""
import os
os.environ.update({'OPENAI_API_KEY':'','DEEPSEEK_API_KEY':'','DEMO_MODE':'true','MEMORYCAST_LIVE_ENABLED':'true','WORLD_GENERATION_ENABLED':'false','SUPABASE_URL':'https://existing.supabase.test','SUPABASE_SERVICE_ROLE_KEY':'test-service-role'})
from fastapi.responses import HTMLResponse
from backend.main import app
from backend.memorycast import get_tour_provider
from backend.memorycast_store import TourStore,get_tour_store
from backend.world_accounts import get_accounts
from backend.tests.test_memorycast import Provider
store=TourStore();store.url='http://127.0.0.1:8038'
provider=Provider()
app.dependency_overrides.update({get_accounts:lambda:store,get_tour_store:lambda:store,get_tour_provider:lambda:provider})
@app.get('/__test/page',response_class=HTMLResponse)
def page():return '<!doctype html><html><body><h1>Backend audio contract fixture</h1><button id="play">Play test narration</button><audio id="audio" controls></audio><script>document.getElementById("play").onclick=()=>document.getElementById("audio").play();</script></body></html>'
@app.get('/__test/stats')
def stats():return {'calls':provider.calls}
