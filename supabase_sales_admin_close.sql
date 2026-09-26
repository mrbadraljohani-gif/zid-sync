-- ============================================================================
-- دفعة ٣: إغلاق «شاشة عرض المبيعات» على admin نهائياً (قراءة بيانات المبيعات owner+marketing فقط)
-- ⚠️ لم يُنفَّذ بعد — أُرسل للمراجعة. نفّذه يدوياً مرّة **بعد** supabase_cost_price.sql (يعتمد على عمود cost_price).
--
-- 🚨 قرار نهائيّ: admin لا يرى شاشة المبيعات ولا صفّ بيانات مبيعات واحداً.
--    الإخفاء في الواجهة ليس أماناً — هذا السكربت هو الحاجز الفعليّ (RLS + شرط العرض).
-- 🚨 يُبقى لـadmin **ما يثبت الكود أنه ضروريّ للرفع وحده**:
--    • INSERT على sales_movements و sales_uploads (recordMovements يكتبهما عند كل رفعة) — لا يُمَسّ (owner+admin).
--    • SELECT على sales_uploads فقط (الرفع يقرأ آخر رفعة للموقع: db.salesBranches.lastUploadAt / prevSyncedAt؛
--      وكتلة «آخر رفعة» في صفحة المخزون). sales_uploads = سجلّ رفعات (طوابع)، ليس بيانات مبيعات.
--    • 🚫 يفقد SELECT على sales_movements و sales_stock (بيانات المبيعات والمخزون) ⇒ صفر صفّ مبيعات لـadmin.
--      (كتلتا «المفقود»/«بلا رفعة» المشتقّتان من الحركات تصيران فارغتين لـadmin — تحليل مبيعات لا «حالة رفع»؛ آخر رفعة تبقى.)
-- 🚫 لا drop على أي view · idempotent · alter policy / create or replace view حصراً · 🚫 لا يُعاد أي ملف SQL قديم.
-- ============================================================================
begin;

-- (1) sales_movements: القراءة owner+marketing فقط (إزالة admin) — الكتابة (INSERT owner+admin) لا تُمَسّ
alter policy sales_movements_select_ro on public.sales_movements
  using (public.get_my_role() in ('owner','marketing'));

-- (2) sales_uploads: تبقى القراءة owner+marketing+admin (الرفع نفسه يقرؤها: prevSyncedAt/آخر رفعة) — إعادة تأكيد idempotent
alter policy sales_uploads_select_ro on public.sales_uploads
  using (public.get_my_role() in ('owner','marketing','admin'));

-- (3) العرض sales_stock: الشرط owner+marketing فقط (إزالة admin) — cost_price مُبقىً (من دفعة ٢) وإلّا فشل create or replace بحذف عمود.
--     🚫 لا drop (يحفظ صلاحية backup_ro). security_invoker=false محفوظ. cost_price يبقى مقصوراً owner+marketing بالـcase.
create or replace view public.sales_stock
with (security_invoker = false) as
  select s.location, s.sku, s.name, s.qty, s.price_incl, s.price_excl, s.barcode,
         case when public.get_my_role() in ('owner','marketing') then s.cost_price else null end as cost_price
  from (
    select 'wh'::text        as location, code as sku, name, qty, price_incl, price_excl, barcode, cost_price       from public.warehouse_items
    union all
    select branch_id::text   as location, code as sku, name, qty, price_incl, price_excl, barcode, cost_price       from public.branch_items
    union all
    select branch_id::text   as location, code as sku, name, qty, price_incl, price_excl, barcode, null::numeric    from public.sales_branch_items
  ) s
  where public.get_my_role() in ('owner','marketing');
grant select on public.sales_stock to authenticated;   -- idempotent؛ 🚫 لا نلمس صلاحية backup_ro

commit;

-- تحقّق يدويّ (الاختبار الحقيقيّ الوحيد — بحساب admin):
--   select count(*) from public.sales_movements;   -- = 0
--   select count(*) from public.sales_stock;        -- = 0
--   select count(*) from public.sales_uploads;      -- > 0 (آخر رفعة تبقى — للرفع وحالته)
--   -- ثمّ ارفع ملف مستودع/فرع/حراج بحساب admin: يجب أن ينجح (INSERT سليم) وتظهر «آخر رفعة».
-- بحساب owner/marketing: sales_movements و sales_stock > 0 (بلا تغيير).
