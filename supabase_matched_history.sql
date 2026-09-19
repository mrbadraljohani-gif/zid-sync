-- ============================================================================
-- ASJ / zid-sync — جدول «تاريخ المطابقة» (matched_history) — المصدر الوحيد لـmatchedHistory
--   كل skuN طوبق بالكود سابقاً. يميّز «غائب عن المخزن» (له تاريخ) عن «يحتاج ربط» (جديد).
--   يحلّ محلّ matched-history.json (الريبو) ＋ HIST_KEY (localStorage) — لا اتحاد بعد اليوم.
--
-- ⚠ نفّذه **بعد** supabase_user_roles.sql (يعتمد get_my_role())، مرّة واحدة، في Supabase → SQL Editor.
-- ⚠ آمن لإعادة التنفيذ (idempotent). نمط جدول aliases في supabase_decisions.sql حرفياً.
-- ============================================================================
begin;

-- 1) الجدول (zid_sku = skuN المطبَّع؛ unique يمنع التكرار)
create table if not exists public.matched_history (
  id          bigint generated always as identity primary key,
  zid_sku     text not null unique,
  created_by  uuid references auth.users(id) default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 2) updated_at تلقائياً (تعيد استخدام set_updated_at من الملفات السابقة)
drop trigger if exists matched_history_set_updated_at on public.matched_history;
create trigger matched_history_set_updated_at
  before update on public.matched_history
  for each row execute function public.set_updated_at();

-- 3) RLS: قراءة لكل موثّق · كتابة owner+admin (نمط aliases/ignored في supabase_decisions.sql)
alter table public.matched_history enable row level security;
drop policy if exists matched_history_select_auth on public.matched_history;
drop policy if exists matched_history_insert_auth on public.matched_history;
drop policy if exists matched_history_update_auth on public.matched_history;
drop policy if exists matched_history_delete_auth on public.matched_history;
create policy matched_history_select_auth on public.matched_history
  for select to authenticated using (true);
create policy matched_history_insert_auth on public.matched_history
  for insert to authenticated with check (public.get_my_role() in ('owner','admin'));
create policy matched_history_update_auth on public.matched_history
  for update to authenticated using (public.get_my_role() in ('owner','admin')) with check (public.get_my_role() in ('owner','admin'));
create policy matched_history_delete_auth on public.matched_history
  for delete to authenticated using (public.get_my_role() in ('owner','admin'));

-- 4) grants
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.matched_history to authenticated;
grant usage, select on sequence public.matched_history_id_seq to authenticated;

commit;

-- ============================================================================
-- استعلامات التحقّق (بعد التنفيذ):
--   select count(*) from public.matched_history;                       -- == 0 (بداية نظيفة — لا ترحيل)
--   select tablename from pg_tables where tablename = 'matched_history';  -- موجود
--   -- بعد أوّل «طابق وأنشئ» من الأداة: يمتلئ تلقائياً بالمطابَق بالكود (المرحلة ١)
--   select count(*) from public.matched_history;                       -- ≈ عدد المطابَق بالكود (1121)
-- ============================================================================
