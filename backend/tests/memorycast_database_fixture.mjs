// Backend persistence tests only. Stub Supabase system schemas; use PostgreSQL SQL.
import {PGlite} from '../../frontend/node_modules/@electric-sql/pglite/dist/index.js';
import {readFile} from 'node:fs/promises';
export const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',M='33333333-3333-4333-8333-333333333333';
export const CONTEXT={version:1,memory_id:M,mood:'Nostalgic',language:'en',sources:{'journal:story':'Rain against the window.'},anchors:[],photos:[],world_id:null};
export async function database(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.account_id',true),'')::uuid$$;
 create table auth.users(id uuid primary key);insert into auth.users values('${A}'),('${B}');
 create table public.journal_entries(id uuid primary key,user_id uuid not null,deleted_at timestamptz,title text not null default 'A saved memory',story text not null default 'Rain against the window.',mood text not null default 'Nostalgic',photos jsonb not null default '[]',scene jsonb,world jsonb);insert into public.journal_entries(id,user_id) values('${M}','${A}');
 grant select on public.journal_entries to authenticated;grant usage on schema auth,storage to authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(bucket_id text,name text);alter table storage.objects enable row level security;grant select on storage.objects to authenticated;
 create function storage.foldername(text) returns text[] language sql immutable as $$select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]$$;`);
 await db.exec(await readFile(new URL('../../frontend/supabase/010_memorycast.sql',import.meta.url),'utf8'));
 const args={mc_read:['p_user','p_memory','p_tour'],mc_reserve:['p_user','p_memory','p_id','p_hash','p_context','p_regenerate'],mc_claim:['p_user','p_id','p_lease'],mc_finish:['p_user','p_id','p_lease','p_update']};
 return {db,async rpc(name,input){const values=args[name].map(k=>['p_context','p_update'].includes(k)?JSON.stringify(input[k]):input[k]);return (await db.query(`select public.${name}(${values.map((_,i)=>'$'+(i+1)).join(',')}) as result`,values)).rows[0].result;}};
}
