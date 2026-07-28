-- ============================================================================
-- ASJ / zid-sync — جدول «سجل النشاط» (activity_log) — الأساس المستقبلي للإشعارات
-- يسجّل كل عملية كتابة (ربط/انتظار/إلغاء نشر/مزامنة زد/توليد ملفات) كسطر واحد.
-- الكتابة fire-and-forget من الواجهة (فشلها لا يعطّل العملية).
-- لاحقاً: Edge Function تقرأ منه وترسل ملخص إشعارات (لا بريد في هذه المرحلة).
-- نفّذ هذا كاملاً في Supabase → SQL Editor (مرة واحدة). آمن لإعادة التنفيذ.
-- (نفس نمط الجداول السابقة: RLS authenticated + grants + فهارس)
-- ============================================================================

-- 1) الجدول
create table if not exists public.activity_log (
  id          bigint generated always as identity primary key,
  event_type  text not null,   -- link_added / link_removed / product_synced / sync_full / waiting_added / waiting_removed / unpublish_added / file_generated
  zid_sku     text,
  details     jsonb,           -- المرشح، الأعداد، المصدر... حسب نوع الحدث
  created_by  uuid references auth.users(id) default auth.uid(),
  created_at  timestamptz not null default now()
);

create index if not exists activity_log_created_at_idx on public.activity_log (created_at desc);
create index if not exists activity_log_event_type_idx on public.activity_log (event_type);

-- 2) تفعيل RLS
alter table public.activity_log enable row level security;

-- 3) السياسات: كل العمليات للدور authenticated فقط، لا شيء لـ anon
--    (سجل مشترك بين موظفي نفس الحساب — أي مستخدم مصادق يقرأ الكل ويكتب)
drop policy if exists activity_select_auth on public.activity_log;
drop policy if exists activity_insert_auth on public.activity_log;
drop policy if exists activity_update_auth on public.activity_log;
drop policy if exists activity_delete_auth on public.activity_log;

create policy activity_select_auth on public.activity_log
  for select to authenticated using (true);
create policy activity_insert_auth on public.activity_log
  for insert to authenticated with check (true);
create policy activity_update_auth on public.activity_log
  for update to authenticated using (true) with check (true);
create policy activity_delete_auth on public.activity_log
  for delete to authenticated using (true);

-- 4) grants صريحة — لا شيء لـ anon
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.activity_log to authenticated;
grant usage, select on sequence public.activity_log_id_seq to authenticated;

-- تحقق سريع (اختياري):
--   select event_type, zid_sku, details, created_at from public.activity_log order by created_at desc limit 50;
