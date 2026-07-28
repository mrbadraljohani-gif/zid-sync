-- ============================================================================
-- ASJ / zid-sync — المرحلة 3: منتجات زد في القاعدة (مرآة لتصدير زد)
-- بدل رفع تصدير زد كل دورة، تُخزَّن المنتجات هنا وتُحدَّث عند الحاجة (مزامنة كاملة).
-- المطابقة تقرأ من القاعدة، وملف المخزن يبقى المدخل المتكرر الوحيد.
-- نفّذ هذا كاملاً في Supabase → SQL Editor (مرة واحدة). آمن لإعادة التنفيذ.
-- (نفس نمط جداول mappings / waiting_items في الملفات السابقة)
-- ============================================================================

-- 1) جدول المنتجات (مرآة الصف الكامل من التصدير)
create table if not exists public.zid_products (
  id            bigint generated always as identity primary key,
  sku           text not null unique,
  barcode       text,
  name_ar       text,
  name_en       text,
  price         numeric,
  sale_price    numeric,
  quantity      numeric,
  published     text,
  has_variants  text,
  parent_sku    text,
  raw           jsonb,                                   -- الصف الكامل من التصدير (الأعمدة الـ76) — لإعادة بناء ملفات الرفع
  row_order     integer,                                 -- ترتيب الصف في الملف الأصلي — لإعادة البناء بترتيب مطابق تماماً
  imported_at   timestamptz not null default now(),
  created_by    uuid references auth.users(id) default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists zid_products_barcode_idx    on public.zid_products (barcode);
create index if not exists zid_products_parent_sku_idx on public.zid_products (parent_sku);

-- 2) جدول ميتا المزامنة (صف واحد id=1): رأس الأعمدة + آخر مزامنة + العدد
--    الرأس يُخزَّن هنا مرة واحدة (76 اسم عمود بالترتيب) لإعادة بناء الملف على أي جهاز.
create table if not exists public.zid_sync_meta (
  id            integer primary key default 1 check (id = 1),
  header        jsonb,
  product_count integer,
  synced_at     timestamptz not null default now(),
  created_by    uuid references auth.users(id) default auth.uid(),
  updated_at    timestamptz not null default now()
);

-- 3) تحديث updated_at تلقائياً (يعيد استخدام الدالة إن وُجدت من الجداول السابقة)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists zid_products_set_updated_at on public.zid_products;
create trigger zid_products_set_updated_at
  before update on public.zid_products
  for each row execute function public.set_updated_at();

drop trigger if exists zid_sync_meta_set_updated_at on public.zid_sync_meta;
create trigger zid_sync_meta_set_updated_at
  before update on public.zid_sync_meta
  for each row execute function public.set_updated_at();

-- 4) تفعيل RLS
alter table public.zid_products  enable row level security;
alter table public.zid_sync_meta enable row level security;

-- 5) السياسات: كل العمليات للدور authenticated فقط، لا شيء لـ anon
drop policy if exists zid_products_select_auth on public.zid_products;
drop policy if exists zid_products_insert_auth on public.zid_products;
drop policy if exists zid_products_update_auth on public.zid_products;
drop policy if exists zid_products_delete_auth on public.zid_products;

create policy zid_products_select_auth on public.zid_products
  for select to authenticated using (true);
create policy zid_products_insert_auth on public.zid_products
  for insert to authenticated with check (true);
create policy zid_products_update_auth on public.zid_products
  for update to authenticated using (true) with check (true);
create policy zid_products_delete_auth on public.zid_products
  for delete to authenticated using (true);

drop policy if exists zid_meta_select_auth on public.zid_sync_meta;
drop policy if exists zid_meta_insert_auth on public.zid_sync_meta;
drop policy if exists zid_meta_update_auth on public.zid_sync_meta;
drop policy if exists zid_meta_delete_auth on public.zid_sync_meta;

create policy zid_meta_select_auth on public.zid_sync_meta
  for select to authenticated using (true);
create policy zid_meta_insert_auth on public.zid_sync_meta
  for insert to authenticated with check (true);
create policy zid_meta_update_auth on public.zid_sync_meta
  for update to authenticated using (true) with check (true);
create policy zid_meta_delete_auth on public.zid_sync_meta
  for delete to authenticated using (true);

-- 6) grants صريحة — لا شيء لـ anon
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.zid_products  to authenticated;
grant select, insert, update, delete on public.zid_sync_meta to authenticated;
grant usage, select on sequence public.zid_products_id_seq to authenticated;

-- تحقق سريع (اختياري):
--   select count(*) from public.zid_products;
--   select product_count, synced_at from public.zid_sync_meta where id = 1;
