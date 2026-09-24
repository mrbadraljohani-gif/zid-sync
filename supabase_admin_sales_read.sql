-- ============================================================================
-- ASJ / zid-sync — دفعة هـ: منح admin قراءة sales_movements و sales_stock
-- ============================================================================
-- 🚨 السبب: صفحة الرفع (owner+admin) تعرض كتلتَي «بلا رفعة» و«المفقود» (شغل تشغيليّ
--    لمن يرفع = محمد/admin). مصدرهما sales_movements و sales_stock، وكانا محجوبين عن admin
--    (owner+marketing فقط) ⇒ فارغان لـadmin = فشل صامت. محمد يرفع الإكسل يوميّاً فكل الكميات
--    والأسعار تمرّ عليه، و sales_stock هو نفسه محتوى branch_items الذي يقرأه/يكتبه. الحجب أمان
--    شكليّ لا حقيقيّ. الكتابة تبقى كما هي (owner+admin للحركات، owner للتحديث/الحذف) — 🚫 بلا توسيع.
--
-- ⚠ نفّذه مرّة واحدة في Supabase → SQL Editor. idempotent (ALTER POLICY + create or replace view).
-- ⚠ 🚫 لا drop للعرض — create or replace يحفظ صلاحية backup_ro (الدرس الموثَّق: drop يمحوها بصمت).
-- ⚠ التغطية (معدّل الريال/يوم) تبقى محجوبة عن admin في الواجهة (لا في القاعدة) — قرار عرض لا صلاحية.
-- ============================================================================
begin;

-- (1) sales_movements: القراءة owner+marketing+admin (ALTER لا drop — يحفظ السياسة القائمة)
alter policy sales_movements_select_ro on public.sales_movements
  using (public.get_my_role() in ('owner','marketing','admin'));

-- (2) sales_uploads: تأكيد admin في القراءة (كان مضبوطاً حيّاً في supabase_sales_branches.sql — إعادة تأكيد idempotent)
alter policy sales_uploads_select_ro on public.sales_uploads
  using (public.get_my_role() in ('owner','marketing','admin'));

-- (3) العرض sales_stock: إضافة admin إلى شرط الدور — create or replace (🚫 لا drop، يحفظ backup_ro)
--     الأعمدة تطابق العرض الحيّ حرفياً (location, sku, name, qty, price_incl, price_excl, barcode).
create or replace view public.sales_stock
with (security_invoker = false) as
  select s.location, s.sku, s.name, s.qty, s.price_incl, s.price_excl, s.barcode from (
    select 'wh'::text as location, code as sku, name, qty, price_incl, price_excl, barcode from public.warehouse_items
    union all
    select branch_id::text as location, code as sku, name, qty, price_incl, price_excl, barcode from public.branch_items
    union all
    select branch_id::text as location, code as sku, name, qty, price_incl, price_excl, barcode from public.sales_branch_items
  ) s
  where public.get_my_role() in ('owner','marketing','admin');
grant select on public.sales_stock to authenticated;   -- idempotent؛ 🚫 لا نلمس صلاحية backup_ro
revoke all on public.sales_stock from anon;

commit;

-- تحقّق يدويّ (بحساب admin): يجب أن يعيد صفوفاً لا صفراً:
--   select count(*) from public.sales_stock;
--   select count(*) from public.sales_movements;
