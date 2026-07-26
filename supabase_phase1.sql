-- ============================================================================
-- ASJ / zid-sync — المرحلة 1 من ربط Supabase: جدول الروابط (mappings)
-- نفّذ هذا كاملاً في Supabase → SQL Editor (مرة واحدة). آمن لإعادة التنفيذ.
-- ============================================================================

-- 1) الجدول
create table if not exists public.mappings (
  id             bigint generated always as identity primary key,
  zid_sku        text not null unique,
  warehouse_code text not null,
  source         text not null default 'manual',   -- manual / auto-confirmed / auto-approved / imported
  note           text,
  created_by     uuid references auth.users(id) default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- 2) فهرس على كود المستودع
create index if not exists mappings_warehouse_code_idx on public.mappings (warehouse_code);

-- 3) تحديث updated_at تلقائياً عند كل UPDATE
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists mappings_set_updated_at on public.mappings;
create trigger mappings_set_updated_at
  before update on public.mappings
  for each row execute function public.set_updated_at();

-- 4) تفعيل RLS
alter table public.mappings enable row level security;

-- 5) السياسات: كل العمليات للدور authenticated فقط، لا شيء لـ anon
drop policy if exists mappings_select_auth on public.mappings;
drop policy if exists mappings_insert_auth on public.mappings;
drop policy if exists mappings_update_auth on public.mappings;
drop policy if exists mappings_delete_auth on public.mappings;

create policy mappings_select_auth on public.mappings
  for select to authenticated using (true);
create policy mappings_insert_auth on public.mappings
  for insert to authenticated with check (true);
create policy mappings_update_auth on public.mappings
  for update to authenticated using (true) with check (true);
create policy mappings_delete_auth on public.mappings
  for delete to authenticated using (true);

-- 6) grants صريحة (نظام مفاتيح Supabase الجديد قد يتطلبها) — لا شيء لـ anon
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.mappings to authenticated;
grant usage, select on sequence public.mappings_id_seq to authenticated;

-- تحقق سريع (اختياري): select * from public.mappings;
