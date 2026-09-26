-- ============================================================================
-- دفعة ٢: سعر التكلفة (cost_price) — للمستودع والفروع فقط · شاشة عرض المبيعات حصراً
-- ⚠️ لم يُنفَّذ بعد — أُرسل للمراجعة. نفّذه يدوياً مرّة في Supabase → SQL.
--
-- 🚨 القاعدة الحاكمة: cost_price يُخزَّن **كما هو حرفياً بلا أي ضرب ولا ضريبة** (خليّة 100 ⇒ 100.00).
--    سعر البيع يبقى يُضرب في الضريبة عند الرفع كما هو (لا يتغيّر). التخزين الخام في الكود (buildInvDbRows: numOrNull بلا applyVat).
-- 🔒 الصلاحية: cost_price لـowner و marketing فقط — مقصور في العرض بـcase (admin/viewer/غيرهم يرون null، لا يصل متصفّحهم).
-- 🚫 لا zid_products · لا أي جدول آخر · لا drop على أي view · idempotent · لا يمسّ أي سياسة قائمة.
-- ============================================================================

-- 1) العمود — nullable (الملفات الحالية بلا العمود ترفع بنجاح وتُخزَّن null؛ بلا تصفير أي قيمة سابقة). idempotent.
alter table public.warehouse_items add column if not exists cost_price numeric;
alter table public.branch_items    add column if not exists cost_price numeric;
-- 🚫 sales_branch_items (فرعا الحراج) بلا cost_price — خارج نطاق التكلفة (الكود لا يرسله لها: buildInvDbRows withCost=false لـxbranch).

-- 2) توسيع العرض sales_stock بعمود cost_price — **create or replace فقط** (لا drop ⇒ صلاحية backup_ro محفوظة).
--    ⚠ يجب مطابقة الأعمدة القائمة (الأسماء/الترتيب/الأنواع) حرفياً ثمّ إضافة cost_price **في النهاية** (create or replace يسمح بإضافة عمود آخِراً لا بإعادة ترتيب/حذف).
--    الشرط get_my_role() in ('owner','marketing','admin') و security_invoker=false محفوظان حرفياً كما في التعريف الحيّ (supabase_sales_branches.sql).
--    🔒 cost_price نفسه مقصور owner+marketing بـcase — فادمِن (الذي يقرأ العرض حتى الدفعة ٣) يرى null.
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
  where public.get_my_role() in ('owner','marketing','admin');
grant select on public.sales_stock to authenticated;   -- إضافيّ idempotent؛ 🚫 لا نلمس صلاحية backup_ro

-- للتحقّق بعد التنفيذ:
--   -- خام بلا ضريبة: خليّة 100 ⇒ 100.00 (لا 115):
--   update public.warehouse_items set cost_price = 100 where code = '<كود>';
--   select code, cost_price from public.warehouse_items where code = '<كود>';   -- = 100.00
--   -- التكلفة تُقصَر على owner/marketing (بحساب admin):
--   select count(*) from public.sales_stock where cost_price is not null;       -- 0 لادمِن · >0 لـowner/marketing
