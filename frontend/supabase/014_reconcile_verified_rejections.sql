-- One-time owner reconciliation. Vercel recorded HTTP 422 at
-- 2026-11-01 00:24:49.30 and 00:29:51.17 Asia/Seoul; provider history
-- contains neither job and neither row has an operation/world identifier.
-- Run AFTER the submission hotfix is live. Preserve every audit row.
begin;
select public.mv_world_finish(j.user_id,j.id,null,
 jsonb_build_object('status','failed','rejected',true,'diagnostics',
 jsonb_build_object('http_status',422,'source','verified-vercel-runtime-log','reconciliation','owner-confirmed-no-provider-job')))
from public.world_generation_jobs j
where j.id in ('08d4a557-1ead-4608-98a0-0a991ef77394','17793d74-6ae3-4582-a013-93f9504394c8')
 and j.status='unknown' and j.operation_id is null and j.world_id is null
 and j.model='marble-1.0-draft'
 and j.created_at between '2026-10-31T15:24:48Z' and '2026-10-31T15:29:52Z';
select id,status,allowance_released from public.world_generation_jobs
where id in ('08d4a557-1ead-4608-98a0-0a991ef77394','17793d74-6ae3-4582-a013-93f9504394c8');
select reserved_credits,max_in_flight from public.world_generation_demo;
commit;
