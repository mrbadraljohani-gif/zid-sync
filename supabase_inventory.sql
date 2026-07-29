-- ============================================================================
-- ASJ / zid-sync — المرحلة 4: المخزن في القاعدة بجدولين منفصلين (مستودع/فرع)
-- كل جدول يعكس ملفه كما هو (صف واحد لكل كود بعد جمع الكميات داخل الملف).
-- المطابقة توحّدهما في الذاكرة (نفس mergeInventory) فلا يتغيّر منطقها.
--
-- ⚠ نفّذ هذا **بعد** supabase_user_roles.sql (يعتمد على الدالة get_my_role()).
-- نفّذه مرة واحدة. آمن لإعادة التنفيذ.
-- (نفس نمط الجداول السابقة: RLS + grants + triggers + فهارس؛ الكتابة لـowner+admin، القراءة للموثّقين)
-- ============================================================================

-- 1) جدول المستودع الرئيسي
create table if not exists public.warehouse_items (
  id          bigint generated always as identity primary key,
  code        text not null unique,
  name        text,
  barcode     text,
  qty         numeric,
  price_incl  numeric,
  price_excl  numeric,
  row_order   integer,
  imported_at timestamptz not null default now(),
  created_by  uuid references auth.users(id) default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists warehouse_items_barcode_idx on public.warehouse_items (barcode);

-- 2) جدول الفرع (نفس البنية حرفياً)
create table if not exists public.branch_items (
  id          bigint generated always as identity primary key,
  code        text not null unique,
  name        text,
  barcode     text,
  qty         numeric,
  price_incl  numeric,
  price_excl  numeric,
  row_order   integer,
  imported_at timestamptz not null default now(),
  created_by  uuid references auth.users(id) default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists branch_items_barcode_idx on public.branch_items (barcode);

-- 3) ميتا المزامنة (صف واحد id=1) — مستقلة لكل جدول
create table if not exists public.inventory_sync_meta (
  id                integer primary key default 1 check (id = 1),
  wh_header         jsonb,
  wh_count          integer,
  wh_file_name      text,
  wh_synced_at      timestamptz,
  branch_header     jsonb,
  branch_count      integer,
  branch_file_name  text,
  branch_synced_at  timestamptz,
  updated_at        timestamptz not null default now()
);

-- 4) تحديث updated_at تلقائياً (تعيد استخدام الدالة إن وُجدت من الملفات السابقة)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists warehouse_items_set_updated_at on public.warehouse_items;
create trigger warehouse_items_set_updated_at before update on public.warehouse_items for each row execute function public.set_updated_at();
drop trigger if exists branch_items_set_updated_at on public.branch_items;
create trigger branch_items_set_updated_at before update on public.branch_items for each row execute function public.set_updated_at();
drop trigger if exists inventory_sync_meta_set_updated_at on public.inventory_sync_meta;
create trigger inventory_sync_meta_set_updated_at before update on public.inventory_sync_meta for each row execute function public.set_updated_at();

-- 5) RLS
alter table public.warehouse_items     enable row level security;
alter table public.branch_items        enable row level security;
alter table public.inventory_sync_meta enable row level security;

-- 6) السياسات: القراءة لكل موثّق · الكتابة لـowner + admin (get_my_role من ملف الأدوار)
do $$
declare t text;
begin
  foreach t in array array['warehouse_items','branch_items','inventory_sync_meta'] loop
    execute format('drop policy if exists %I_select_auth on public.%I', t, t);
    execute format('drop policy if exists %I_insert_wr  on public.%I', t, t);
    execute format('drop policy if exists %I_update_wr  on public.%I', t, t);
    execute format('drop policy if exists %I_delete_wr  on public.%I', t, t);
    execute format('create policy %I_select_auth on public.%I for select to authenticated using (true)', t, t);
    execute format('create policy %I_insert_wr on public.%I for insert to authenticated with check (public.get_my_role() in (''owner'',''admin''))', t, t);
    execute format('create policy %I_update_wr on public.%I for update to authenticated using (public.get_my_role() in (''owner'',''admin'')) with check (public.get_my_role() in (''owner'',''admin''))', t, t);
    execute format('create policy %I_delete_wr on public.%I for delete to authenticated using (public.get_my_role() in (''owner'',''admin''))', t, t);
  end loop;
end $$;

-- 7) grants صريحة — لا شيء لـ anon
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.warehouse_items     to authenticated;
grant select, insert, update, delete on public.branch_items        to authenticated;
grant select, insert, update, delete on public.inventory_sync_meta to authenticated;
grant usage, select on sequence public.warehouse_items_id_seq to authenticated;
grant usage, select on sequence public.branch_items_id_seq    to authenticated;

-- تحقق سريع (اختياري):
--   select (select count(*) from public.warehouse_items) as wh, (select count(*) from public.branch_items) as br;
--   select wh_count, wh_synced_at, branch_count, branch_synced_at from public.inventory_sync_meta where id = 1;
