"""python -m backend.world_worker (durable host; never submits new paid jobs)."""
import asyncio
from . import main  # Loads the existing backend .env without printing it.
from .world_accounts import SupabaseWorlds
from .worlds import get_job

async def tick(accounts):
    queue = await accounts.rpc('mv_journal_world_queue', {})
    for job in queue['jobs']:
        try:
            await get_job(job['job_id'], job['user_id'], accounts, journal=True)
        except Exception:
            # Do not log private metadata/provider URLs or exception bodies.
            print('World status/asset transfer deferred; existing job retained.')

async def run():
    accounts = SupabaseWorlds()
    while True:
        try: await tick(accounts)
        except Exception: print('World worker temporarily unavailable; retrying existing queue.')
        await asyncio.sleep(10)

if __name__ == '__main__': asyncio.run(run())
