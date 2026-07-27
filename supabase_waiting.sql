-- ============================================================================
-- ASJ / zid-sync — جدول «قائمة الانتظار» (waiting_items) — أصناف ⏳ «غير متوفر حالياً»
-- تُصدَّر بكمية 0 باستمرار حتى يظهر كودها في ملف المخزن فتُسحب تلقائياً.
-- نفّذ هذا كاملاً في Supabase → SQL Editor (مرة واحدة). آمن لإعادة التنفيذ.
-- (نفس نمط جدول mappings في supabase_phase1.sql)
-- ============================================================================

-- 1) الجدول
create table if not exists public.waiting_items (
  id          bigint generated always as identity primary key,
  zid_sku     text not null unique,
  name        text,
  marked_at   timestamptz not null default now(),
  created_by  uuid references auth.users(id) default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 2) تحديث updated_at تلقائياً عند كل UPDATE (تعيد استخدام الدالة إن وُجدت من phase1)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists waiting_items_set_updated_at on public.waiting_items;
create trigger waiting_items_set_updated_at
  before update on public.waiting_items
  for each row execute function public.set_updated_at();

-- 3) تفعيل RLS
alter table public.waiting_items enable row level security;

-- 4) السياسات: كل العمليات للدور authenticated فقط، لا شيء لـ anon
drop policy if exists waiting_select_auth on public.waiting_items;
drop policy if exists waiting_insert_auth on public.waiting_items;
drop policy if exists waiting_update_auth on public.waiting_items;
drop policy if exists waiting_delete_auth on public.waiting_items;

create policy waiting_select_auth on public.waiting_items
  for select to authenticated using (true);
create policy waiting_insert_auth on public.waiting_items
  for insert to authenticated with check (true);
create policy waiting_update_auth on public.waiting_items
  for update to authenticated using (true) with check (true);
create policy waiting_delete_auth on public.waiting_items
  for delete to authenticated using (true);

-- 5) grants صريحة — لا شيء لـ anon
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.waiting_items to authenticated;
grant usage, select on sequence public.waiting_items_id_seq to authenticated;

-- تحقق سريع (اختياري): select * from public.waiting_items;
