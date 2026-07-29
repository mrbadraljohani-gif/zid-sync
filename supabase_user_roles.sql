-- ============================================================================
-- ASJ / zid-sync — نظام أدوار المستخدمين (user_roles) + قصر الكتابة حسب الدور
-- الأدوار: owner (المالك، واحد) · admin (مشرف) · viewer (قراءة فقط).
-- الأمان الحقيقي في RLS (لا الواجهة): كتابة الروابط لـowner فقط، وبقية الكتابة لـowner+admin.
--
-- نفّذ هذا **بعد** الملفات السابقة (phase1/waiting/zid_products/activity_log)، مرة واحدة.
-- ⚠ لا تُعِد تشغيل الملفات القديمة بعد هذا الملف وإلا استعادت سياسات الكتابة المفتوحة.
-- آمن لإعادة التنفيذ (drop/create + on conflict do nothing).
-- ============================================================================

-- 1) جدول الأدوار
create table if not exists public.user_roles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  role        text not null check (role in ('owner','admin','viewer')),
  created_at  timestamptz not null default now()
);

-- 2) دالة الدور الحالي (security definer) — تقرأ user_roles متجاوزةً RLS فتمنع الـrecursion
create or replace function public.get_my_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.user_roles where user_id = auth.uid();
$$;

grant execute on function public.get_my_role() to authenticated;

-- 3) RLS على user_roles: القراءة لكل موثّق · الكتابة (إدارة الأدوار) لـowner فقط
alter table public.user_roles enable row level security;

drop policy if exists user_roles_select_auth  on public.user_roles;
drop policy if exists user_roles_insert_owner on public.user_roles;
drop policy if exists user_roles_update_owner on public.user_roles;
drop policy if exists user_roles_delete_owner on public.user_roles;

create policy user_roles_select_auth on public.user_roles
  for select to authenticated using (true);
create policy user_roles_insert_owner on public.user_roles
  for insert to authenticated with check (public.get_my_role() = 'owner');
create policy user_roles_update_owner on public.user_roles
  for update to authenticated using (public.get_my_role() = 'owner') with check (public.get_my_role() = 'owner');
create policy user_roles_delete_owner on public.user_roles
  for delete to authenticated using (public.get_my_role() = 'owner');

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.user_roles to authenticated;

-- 4) إدراج المالك يدوياً (يُنفَّذ بصلاحية محرّر SQL/postgres فيتجاوز RLS رغم سياسة insert المشروطة بـowner)
--    آمن لإعادة التنفيذ: on conflict do nothing (لا يمسّ صفاً موجوداً).
insert into public.user_roles (user_id, role)
select id, 'owner' from auth.users where email = 'mr.badraljohani@gmail.com'
on conflict (user_id) do nothing;

-- ============================================================================
-- 5) إعادة ضبط سياسات الكتابة على الجداول القائمة حسب الدور (القراءة تبقى مفتوحة للموثّقين)
-- ============================================================================

-- mappings: الكتابة لـowner حصراً
drop policy if exists mappings_insert_auth on public.mappings;
drop policy if exists mappings_update_auth on public.mappings;
drop policy if exists mappings_delete_auth on public.mappings;
create policy mappings_insert_auth on public.mappings
  for insert to authenticated with check (public.get_my_role() = 'owner');
create policy mappings_update_auth on public.mappings
  for update to authenticated using (public.get_my_role() = 'owner') with check (public.get_my_role() = 'owner');
create policy mappings_delete_auth on public.mappings
  for delete to authenticated using (public.get_my_role() = 'owner');

-- waiting_items: الكتابة لـowner + admin
drop policy if exists waiting_insert_auth on public.waiting_items;
drop policy if exists waiting_update_auth on public.waiting_items;
drop policy if exists waiting_delete_auth on public.waiting_items;
create policy waiting_insert_auth on public.waiting_items
  for insert to authenticated with check (public.get_my_role() in ('owner','admin'));
create policy waiting_update_auth on public.waiting_items
  for update to authenticated using (public.get_my_role() in ('owner','admin')) with check (public.get_my_role() in ('owner','admin'));
create policy waiting_delete_auth on public.waiting_items
  for delete to authenticated using (public.get_my_role() in ('owner','admin'));

-- zid_products: الكتابة لـowner + admin
drop policy if exists zid_products_insert_auth on public.zid_products;
drop policy if exists zid_products_update_auth on public.zid_products;
drop policy if exists zid_products_delete_auth on public.zid_products;
create policy zid_products_insert_auth on public.zid_products
  for insert to authenticated with check (public.get_my_role() in ('owner','admin'));
create policy zid_products_update_auth on public.zid_products
  for update to authenticated using (public.get_my_role() in ('owner','admin')) with check (public.get_my_role() in ('owner','admin'));
create policy zid_products_delete_auth on public.zid_products
  for delete to authenticated using (public.get_my_role() in ('owner','admin'));

-- zid_sync_meta: الكتابة لـowner + admin
drop policy if exists zid_meta_insert_auth on public.zid_sync_meta;
drop policy if exists zid_meta_update_auth on public.zid_sync_meta;
drop policy if exists zid_meta_delete_auth on public.zid_sync_meta;
create policy zid_meta_insert_auth on public.zid_sync_meta
  for insert to authenticated with check (public.get_my_role() in ('owner','admin'));
create policy zid_meta_update_auth on public.zid_sync_meta
  for update to authenticated using (public.get_my_role() in ('owner','admin')) with check (public.get_my_role() in ('owner','admin'));
create policy zid_meta_delete_auth on public.zid_sync_meta
  for delete to authenticated using (public.get_my_role() in ('owner','admin'));

-- activity_log: الكتابة لـowner + admin (viewer لا يكتب)
drop policy if exists activity_insert_auth on public.activity_log;
drop policy if exists activity_update_auth on public.activity_log;
drop policy if exists activity_delete_auth on public.activity_log;
create policy activity_insert_auth on public.activity_log
  for insert to authenticated with check (public.get_my_role() in ('owner','admin'));
create policy activity_update_auth on public.activity_log
  for update to authenticated using (public.get_my_role() in ('owner','admin')) with check (public.get_my_role() in ('owner','admin'));
create policy activity_delete_auth on public.activity_log
  for delete to authenticated using (public.get_my_role() in ('owner','admin'));

-- تحقق سريع (اختياري):
--   select u.email, r.role from public.user_roles r join auth.users u on u.id = r.user_id;
--   select public.get_my_role();
