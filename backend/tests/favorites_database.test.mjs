import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { database, A, B, M } from './memorycast_database_fixture.mjs'
const sql = await readFile(new URL('../../frontend/supabase/017_memory_favorites.sql', import.meta.url), 'utf8')
test('favorites persist, migration repeats safely, and RLS blocks foreign/deleted memories', async () => {
  const { db } = await database()
  try {
    await db.exec(sql)
    await db.exec(`set role authenticated;select set_config('test.account_id','${A}',false);insert into public.memory_favorites(user_id,memory_id) values('${A}','${M}');reset role;`)
    await db.exec(sql)
    assert.equal((await db.query('select count(*)::int as n from public.memory_favorites')).rows[0].n, 1)
    await db.exec(`set role authenticated;select set_config('test.account_id','${B}',false);`)
    assert.equal((await db.query('select * from public.memory_favorites')).rows.length, 0)
    await assert.rejects(db.exec(`insert into public.memory_favorites(user_id,memory_id) values('${B}','${M}')`), /row-level security/)
    await db.exec(`reset role;update public.journal_entries set deleted_at=now() where id='${M}';set role authenticated;select set_config('test.account_id','${A}',false);`)
    assert.equal((await db.query('select * from public.memory_favorites')).rows.length, 0)
    await db.exec('reset role;set role anon;')
    await assert.rejects(db.query('select * from public.memory_favorites'), /permission denied/)
  } finally { await db.close() }
})
