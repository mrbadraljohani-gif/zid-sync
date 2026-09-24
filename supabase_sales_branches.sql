-- ============================================================================
-- ASJ / zid-sync — فرعا شاشة المبيعات المقدّرة فقط: sales_branch_items ＋ توسيع العرض sales_stock
--
-- الغرض: فرعان إضافيّان («الحراج مفروشات» · «الحراج رحلات») يظهران في **شاشة المبيعات المقدّرة وحدها**،
--   لمطابقة نقص موقع بزيادة آخر (تمييز التحويل عن البيع). 🚨 لا علاقة لهما بمزامنة زد الآن.
--
-- 🚨 العزل التامّ عن زد (القيود العليا ١ و٢):
--   • هذا الجدول مستقلّ — 🚫 لا صف منه في branch_items/warehouse_items/zid_products.
--   • رمزا الموقع سلسلتان ثابتتان (haraj_maf/haraj_reh) — ليستا uuid فلا تطابقان branches.id أبداً (حارس بذاته).
--   • الفرعان **خارج جدول branches** ⇒ خارج invBranches ⇒ خارج loadInventoryFromDB/mergeBranches/mergeInventory/run
--     ⇒ لا يمسّان ملفَّي الكميات/الأسعار المولَّدَين لزد إطلاقاً. المخزون يصل شاشة المبيعات عبر العرض sales_stock فقط.
--
-- ⚠ نفّذ **بعد** supabase_marketing_role.sql (يعتمد get_my_role() والعرض sales_stock القائم). نفّذه مرّة واحدة. idempotent.
-- 🚫 لا تُعِد تشغيل أي ملف SQL سابق لـ user_roles (يستعيد سياسات كتابة مفتوحة).
-- ============================================================================
begin;

-- 1) الجدول — نفس أعمدة branch_items ＋ zid_scope (خامل) ＋ فارق مقصود موثّق:
--    branch_id هنا **text** (يحمل الرمز الثابت) لا uuid، **وبلا FK** إلى branches (الفرعان ليسا فيها عمداً).
--    CHECK يقصره على الرمزين ⇒ لا يتسرّب رمز غريب. المفتاح المركّب (branch_id, code) كنظيره في branch_items الحيّ.
create table if not exists public.sales_branch_items (
  id          bigint generated always as identity primary key,
  branch_id   text not null check (branch_id in ('haraj_maf','haraj_reh')),
  code        text not null,
  name        text,
  barcode     text,
  qty         numeric,
  price_incl  numeric,
  price_excl  numeric,
  row_order   integer,
  zid_scope   boolean not null default false,   -- خامل الآن؛ يسهّل الإدراج المستقبلي في زد بلا إعادة بناء
  imported_at timestamptz not null default now(),
  created_by  uuid references auth.users(id) default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (branch_id, code)
);
create index if not exists sales_branch_items_barcode_idx   on public.sales_branch_items (barcode);
create index if not exists sales_branch_items_branch_id_idx on public.sales_branch_items (branch_id);

-- 2) updated_at (تعيد استخدام set_updated_at من supabase_inventory.sql)
drop trigger if exists sales_branch_items_set_updated_at on public.sales_branch_items;
create trigger sales_branch_items_set_updated_at before update on public.sales_branch_items
  for each row execute function public.set_updated_at();

-- 3) RLS — القراءة لكل موثّق · 🚨 الكتابة لـ owner + admin (مطابقة branch_items: admin/محمد يرفع يومياً)
alter table public.sales_branch_items enable row level security;
drop policy if exists sales_branch_items_select_auth on public.sales_branch_items;
drop policy if exists sales_branch_items_insert_ow   on public.sales_branch_items;   -- أُسقطت السياسات القديمة owner-only (_ow)
drop policy if exists sales_branch_items_update_ow   on public.sales_branch_items;
drop policy if exists sales_branch_items_delete_ow   on public.sales_branch_items;
drop policy if exists sales_branch_items_insert_wr   on public.sales_branch_items;
drop policy if exists sales_branch_items_update_wr   on public.sales_branch_items;
drop policy if exists sales_branch_items_delete_wr   on public.sales_branch_items;
create policy sales_branch_items_select_auth on public.sales_branch_items for select to authenticated using (true);
create policy sales_branch_items_insert_wr   on public.sales_branch_items for insert to authenticated with check (public.get_my_role() in ('owner','admin'));
create policy sales_branch_items_update_wr   on public.sales_branch_items for update to authenticated using (public.get_my_role() in ('owner','admin')) with check (public.get_my_role() in ('owner','admin'));
create policy sales_branch_items_delete_wr   on public.sales_branch_items for delete to authenticated using (public.get_my_role() in ('owner','admin'));

-- 3ب) عزل marketing عن الجدول مباشرةً (كنظيره branch_items): يقرأ المبيعات عبر العرض sales_stock فقط، لا الجدول.
--     سياسة restrictive تُدمَج AND: تمنع marketing وحده وتُبقي البقية.
drop policy if exists sales_branch_items_nomkt_sel on public.sales_branch_items;
create policy sales_branch_items_nomkt_sel on public.sales_branch_items
  as restrictive for select to authenticated using (public.get_my_role() is distinct from 'marketing');

-- 3ج) sales_uploads: إضافة admin إلى القراءة — admin يكتب الرفعات ويحتاج قراءة آخر رفعة (اشتقاق period_days للفترة).
--     بدونها period_days تفسد بصمت عند رفع الأدمن. (كان owner+marketing في supabase_marketing_role.sql؛ نوسّعه هنا idempotent.)
drop policy if exists sales_uploads_select_ro on public.sales_uploads;
create policy sales_uploads_select_ro on public.sales_uploads for select to authenticated using (public.get_my_role() in ('owner','marketing','admin'));

-- 4) grants صريحة — لا شيء لـ anon
revoke all on table public.sales_branch_items from anon;
grant select, insert, update, delete on public.sales_branch_items to authenticated;
grant usage, select on sequence public.sales_branch_items_id_seq to authenticated;

-- 5) 🚨 توسيع العرض sales_stock ليضمّ الفرعين — create or replace (لا drop):
--    drop يمحو بصمت صلاحية SELECT للدور backup_ro. create or replace يُبقي الصلاحيات والاعتماديّات.
--    ⚠ يجب أن تطابق الأعمدة (الأسماء/الترتيب/الأنواع) تعريف العرض الحيّ تماماً (location, sku, name, qty, price_incl, price_excl, barcode)
--      وإلّا رفض create or replace. تحقّق قبل التنفيذ: select pg_get_viewdef('public.sales_stock', true);
--    الشرط get_my_role() in ('owner','marketing') و security_invoker=false محفوظان حرفياً (admin يرى 0 صفّ).
create or replace view public.sales_stock
with (security_invoker = false) as
  select s.location, s.sku, s.name, s.qty, s.price_incl, s.price_excl, s.barcode from (
    select 'wh'::text as location, code as sku, name, qty, price_incl, price_excl, barcode from public.warehouse_items
    union all
    select branch_id::text as location, code as sku, name, qty, price_incl, price_excl, barcode from public.branch_items
    union all
    select branch_id::text as location, code as sku, name, qty, price_incl, price_excl, barcode from public.sales_branch_items
  ) s
  where public.get_my_role() in ('owner','marketing','admin');   -- +admin (دفعة هـ): محمد يرفع الإكسل يوميّاً فيقرأ نفس محتوى branch_items؛ الحجب كان أماناً شكليّاً يخلق فشلاً صامتاً
grant select on public.sales_stock to authenticated;   -- إضافيّ idempotent؛ 🚫 لا نلمس صلاحية backup_ro
revoke all on public.sales_stock from anon;             -- لا شيء لـ anon (مواءمة للقاعدة الحيّة — نفس نهج ai_usage)

commit;

-- ============================================================================
-- تحقّق (بعد التنفيذ):
--   select count(*) from public.sales_branch_items;                          -- 0 (قبل أي رفع)
--   select count(*) from public.branch_items;                                -- لم يتغيّر (عزل)
--   -- الأعمدة السبعة للعرض ثابتة:
--   select pg_get_viewdef('public.sales_stock', true);
--   -- إدراج رمز غريب يُرفض بالـCHECK:
--   insert into public.sales_branch_items(branch_id, code) values ('xxx','1');   -- يُرفض
--   -- بحساب marketing: sales_branch_items مباشرةً = 0 صفّ (restrictive) · sales_stock >0 (عبر العرض)
--   -- بحساب admin: sales_stock = 0 صفّ (الشرط) · الكتابة في sales_branch_items تُرفض (insert owner فقط)
-- ============================================================================
