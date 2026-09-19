-- ============================================================================
-- ASJ / zid-sync — جدول «زيادات أسعار المتغيّرات» (price_offsets) — المصدر الوحيد لـpriceOffsets (H2)
--   sku = skuN المطبَّع (normCode) · value = الزيادة بالريال (عدد صحيح). يحلّ محلّ price-offsets.json + OFF_KEY.
--   بعده يزول آخر رمز كاتب (GitHub token) وزرّ «الحفظ في الريبو» — لا حاجة لكتابة الريبو بعد اليوم.
--
-- ⚠ نفّذه **بعد** supabase_user_roles.sql (يعتمد get_my_role())، مرّة واحدة، في Supabase → SQL Editor.
-- ⚠ آمن لإعادة التنفيذ (idempotent). نمط جدول matched_history/aliases حرفياً.
-- ============================================================================
begin;

-- 1) الجدول (sku = skuN المطبَّع؛ unique يمنع التكرار · value عدد صحيح موجب أو سالب)
create table if not exists public.price_offsets (
  id          bigint generated always as identity primary key,
  sku         text not null unique,
  value       integer not null,
  created_by  uuid references auth.users(id) default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 2) updated_at تلقائياً (تعيد استخدام set_updated_at من الملفات السابقة)
drop trigger if exists price_offsets_set_updated_at on public.price_offsets;
create trigger price_offsets_set_updated_at
  before update on public.price_offsets
  for each row execute function public.set_updated_at();

-- 3) RLS: قراءة لكل موثّق · كتابة owner+admin (نمط matched_history/aliases)
alter table public.price_offsets enable row level security;
drop policy if exists price_offsets_select_auth on public.price_offsets;
drop policy if exists price_offsets_insert_auth on public.price_offsets;
drop policy if exists price_offsets_update_auth on public.price_offsets;
drop policy if exists price_offsets_delete_auth on public.price_offsets;
create policy price_offsets_select_auth on public.price_offsets
  for select to authenticated using (true);
create policy price_offsets_insert_auth on public.price_offsets
  for insert to authenticated with check (public.get_my_role() in ('owner','admin'));
create policy price_offsets_update_auth on public.price_offsets
  for update to authenticated using (public.get_my_role() in ('owner','admin')) with check (public.get_my_role() in ('owner','admin'));
create policy price_offsets_delete_auth on public.price_offsets
  for delete to authenticated using (public.get_my_role() in ('owner','admin'));

-- 4) grants
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.price_offsets to authenticated;
grant usage, select on sequence public.price_offsets_id_seq to authenticated;

commit;

-- ============================================================================
-- استعلامات التحقّق (بعد التنفيذ):
--   select count(*) from public.price_offsets;                          -- == 0 (فارغ — الأداة ترحّل الـ3 قيم بعد نشر كود H2)
--   select tablename from pg_tables where tablename = 'price_offsets';  -- موجود
--   -- بعد أوّل فتح للأداة بكود H2 (الترحيل التلقائيّ): تظهر الثلاث:
--   select sku, value from public.price_offsets order by sku;           -- 80151.2=180 · 80158.2=180 · 80158.4=180
-- ============================================================================
