-- ============================================================================
-- تصحيح أثريّ لأسعار الحركات القديمة (price_source='none') — 🚫 للمراجعة فقط، لا تنفّذه إلا بعد الموافقة.
--
-- الخلفية: قبل «سلّم الأسعار» كان unit_price للحركة الحاضرة يُقرأ من صفّ الملف المرفوع وحده،
--   فملفٌ بلا أعمدة سعر ⇒ price_source='none' و value_est=null ⇒ مبيعات مُقدَّرة بأقلّ من الحقيقة.
--   هذا السكربت يملأ السعر أثريّاً من **سعر المخزون الحاليّ** بنفس سلّم الكود:
--     ٢) جدول الموقع نفسه (wh⇒warehouse_items · فرع زد⇒branch_items · حراج⇒sales_branch_items)
--     ٣) المستودع/فروع زد (warehouse_items ∪ branch_items) — 🚫 لا الحراج في المستوى ٣.
--   أولويّة ٢ على ٣ (سعر الصنف في موقعه أدقّ). المستوى ١ (سعر لحظيّ) غير متاح أثريّاً بحكم التعريف.
--
-- 🚨 قيود صارمة (مُطبَّقة في هذا السكربت):
--   • price_source للصفوف المعدَّلة = 'backfill_stock' حصراً — يبقى مميَّزاً للأبد أنه تقدير أثريّ لا رصد لحظيّ.
--   • WHERE price_source='none' AND value_est IS NULL — 🚫 لا يمسّ صفّاً صحيحاً أبداً.
--   • idempotent: إعادة التشغيل لا تغيّر شيئاً (الصفوف صارت 'backfill_stock' فتخرج من WHERE).
--   • يُحدَّث فقط ما وُجد له سعر (incl أو excl)؛ ما لا سعر له في أي مصدر يبقى 'none'.
--   • 🚫 لا يمسّ RLS ولا أي view ولا أي عمود آخر · 🚫 لا DROP · 🚫 لا CHECK جديد (price_source نصّ حرّ).
--   • الوحدة الأثريّة تُعرَض في الواجهة بوسم «تقديريّ» (بند ٦، مبنيّ مسبقاً) — 🚫 لا تُعرض كرقم مرصود.
--
-- التنفيذ: (١) شغّل خطوة المعاينة وحدها وراجع الحجم · (٢) عند الموافقة شغّل خطوة التحديث · (٣) خطوة التحقّق.
-- ============================================================================

-- ── خطوة ١: معاينة (SELECT فقط) — كم صفّاً سيُمَسّ وتوزيعه بالموقع، قبل أي تعديل ──
select m.location,
       count(*)                                               as rows_none,
       count(*) filter (where op.price_incl is not null
                           or op.price_excl is not null
                           or wp.price_incl is not null
                           or wp.price_excl is not null)       as fixable,   -- له سعر في مصدر ما
       count(*) filter (where op.price_incl is null and op.price_excl is null
                          and wp.price_incl is null and wp.price_excl is null) as still_none   -- لا سعر ⇒ يبقى none
from public.sales_movements m
left join (
  select 'wh'::text as location, code, price_incl, price_excl from public.warehouse_items
  union all select branch_id::text, code, price_incl, price_excl from public.branch_items
  union all select branch_id::text, code, price_incl, price_excl from public.sales_branch_items   -- المستوى ٢ لموقع الحراج = جدوله نفسه (لا يدخل زد)
) op on op.location = m.location and op.code = m.sku
left join (
  select code,
         max(price_incl) filter (where price_incl is not null) as price_incl,
         max(price_excl) filter (where price_excl is not null) as price_excl
  from ( select code, price_incl, price_excl from public.warehouse_items
         union all select code, price_incl, price_excl from public.branch_items ) z   -- المستوى ٣: المستودع ＋ فروع زد فقط (🚫 لا الحراج)
  group by code
) wp on wp.code = m.sku
where m.price_source = 'none' and m.value_est is null
  and m.kind in ('estimated_sale','disappeared')   -- الأنواع الحاملة للقيمة (المبيعات ＋ المختفي)
group by m.location
order by rows_none desc;


-- ── خطوة ٢: التحديث (شغّله بعد مراجعة خطوة ١ والموافقة) ──
with own_price as (   -- سعر الصنف في جدول الموقع نفسه (فريد لكل (location,code))
  select 'wh'::text as location, code, price_incl, price_excl from public.warehouse_items
  union all select branch_id::text, code, price_incl, price_excl from public.branch_items
  union all select branch_id::text, code, price_incl, price_excl from public.sales_branch_items
),
wh_price as (   -- المستوى ٣: المستودع ＋ فروع زد بالكود (🚫 لا الحراج)
  select code,
         max(price_incl) filter (where price_incl is not null) as price_incl,
         max(price_excl) filter (where price_excl is not null) as price_excl
  from ( select code, price_incl, price_excl from public.warehouse_items
         union all select code, price_incl, price_excl from public.branch_items ) z
  group by code
),
resolved as (   -- اختيار مستوى كامل (٢ ثمّ ٣): إن كان لجدول الموقع أيّ سعر أُخذ منه incl＋excl معاً، وإلّا من المستودع/زد
  select m.id, m.kind, m.delta,
    case when (op.price_incl is not null or op.price_excl is not null) then op.price_incl
         when (wp.price_incl is not null or wp.price_excl is not null) then wp.price_incl
         else null end as incl,
    case when (op.price_incl is not null or op.price_excl is not null) then op.price_excl
         when (wp.price_incl is not null or wp.price_excl is not null) then wp.price_excl
         else null end as excl
  from public.sales_movements m
  left join own_price op on op.location = m.location and op.code = m.sku
  left join wh_price  wp on wp.code = m.sku
  where m.price_source = 'none' and m.value_est is null
    and m.kind in ('estimated_sale','disappeared')
)
update public.sales_movements m
set unit_price_incl = r.incl,
    unit_price_excl = r.excl,
    value_est       = abs(m.delta) * coalesce(r.incl, r.excl),   -- |delta| × (شامل إن وُجد وإلّا صافٍ) — يطابق computeMovements
    price_source    = 'backfill_stock'
from resolved r
where m.id = r.id
  and (r.incl is not null or r.excl is not null);   -- 🚫 ما لا سعر له يبقى 'none'


-- ── خطوة ٣: التحقّق (SELECT فقط) — التوزيع بعد التحديث ──
select price_source, count(*) as rows, count(value_est) as with_value
from public.sales_movements
where kind in ('estimated_sale','disappeared')
group by price_source
order by rows desc;
