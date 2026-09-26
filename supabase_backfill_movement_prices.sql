-- ============================================================================
-- تصحيح أثريّ لأسعار الحركات القديمة (price_source='none') — 🚫 للمراجعة فقط، لا تنفّذه إلا بعد الموافقة.
--
-- الخلفية: قبل «سلّم الأسعار» كان unit_price للحركة الحاضرة يُقرأ من صفّ الملف المرفوع وحده،
--   فملفٌ بلا أعمدة سعر ⇒ price_source='none' و value_est=null ⇒ مبيعات مُقدَّرة بأقلّ من الحقيقة.
--   هذا السكربت يملأ السعر أثريّاً من **سعر المخزون الحاليّ** بنفس سلّم الكود:
--     ٢) جدول الموقع نفسه (wh⇒warehouse_items · فرع زد⇒branch_items · حراج⇒sales_branch_items)
--     ٣) المستودع/فروع زد — **المستودع أولاً، فإن غاب فأوّل فرع زد بترتيب branch_id ثابت** (🚫 لا max/avg — لا انحياز للأعلى).
--   أولويّة ٢ على ٣ (سعر الصنف في موقعه أدقّ). المستوى ١ (سعر لحظيّ) غير متاح أثريّاً بحكم التعريف.
--
-- 🚨 قيود صارمة (مُطبَّقة في هذا السكربت):
--   • price_source للصفوف المعدَّلة يميّز الضريبة كالسلّم الحيّ: **'backfill_stock'** حين استُعمل incl · **'backfill_stock_excl'** حين استُعمل excl فقط.
--     (فلا يضيع تمييز شامل/صافٍ في رقم واحد.) يبقى مميَّزاً للأبد أنه تقدير أثريّ لا رصد لحظيّ.
--   • النطاق مقصور صراحةً على **location='haraj_reh'** — الموقع الوحيد الذي أثبتت المعاينة أن صفوفه none من اليوم نفسه (07:31→16:10)،
--     فالأسعار لم تتغيّر. 🚫 لا شبكة واسعة: صفّ 'none' لموقع آخر (تاريخ أقدم) قد تكون أسعاره تغيّرت ⇒ تقديرٌ كاذب.
--   • WHERE price_source='none' AND value_est IS NULL — 🚫 لا يمسّ صفّاً صحيحاً أبداً.
--   • kind IN ('estimated_sale','disappeared') — **بالضبط الأنواع التي يمنحها المسار الحيّ value_est** (estimated_sale: index.html:6051 · disappeared: index.html:6062؛ purchase/new = null دائماً). فلا قاعدتان لمفهوم واحد.
--   • idempotent: إعادة التشغيل لا تغيّر شيئاً (الصفوف صارت 'backfill_stock%' فتخرج من WHERE price_source='none').
--   • يُحدَّث فقط ما وُجد له سعر (incl أو excl)؛ ما لا سعر له في أي مصدر يبقى 'none'.
--   • own_price/wh_price مضمونتا التفرّد بـ DISTINCT ON (لا جوين مكرَّر ⇒ اختيار حتميّ).
--   • 🚫 لا يمسّ RLS ولا أي view ولا أي عمود آخر · 🚫 لا DROP · 🚫 لا CHECK جديد (price_source نصّ حرّ بلا قيد).
--   • الوحدة الأثريّة تُعرَض في الواجهة بوسم «تقديريّ» (بند ٦، مبنيّ — salesAgg يلتقط backfill_stock%) — 🚫 لا تُعرض كرقم مرصود.
--
-- التنفيذ: (١) شغّل خطوة المعاينة وحدها وراجع الحجم · (٢) عند الموافقة شغّل خطوة التحديث · (٣) خطوة التحقّق.
-- ============================================================================

-- ── خطوة ١: معاينة (SELECT فقط) — كم صفّاً سيُمَسّ وتوزيعه بالموقع، قبل أي تعديل ──
-- (النطاق مقصور على haraj_reh؛ إن أردت رؤية بقيّة المواقع للاطّلاع فقط، احذف شرط location مؤقّتاً في المعاينة وحدها — 🚫 لا في التحديث.)
with own_price as (   -- المستوى ٢: سعر الصنف في جدول الموقع نفسه (صفّ واحد لكل (location,code))
  select distinct on (location, code) location, code, price_incl, price_excl
  from (
    select 'wh'::text as location, code, price_incl, price_excl from public.warehouse_items
    union all select branch_id::text, code, price_incl, price_excl from public.branch_items
    union all select branch_id::text, code, price_incl, price_excl from public.sales_branch_items   -- المستوى ٢ لموقع الحراج = جدوله نفسه (لا يدخل زد)
  ) u
  order by location, code, (price_incl is not null or price_excl is not null) desc
),
wh_price as (   -- المستوى ٣: المستودع أولاً ثمّ أوّل فرع زد بترتيب branch_id (🚫 لا max/avg · 🚫 لا الحراج)
  select distinct on (code) code, price_incl, price_excl
  from (
    select code, price_incl, price_excl, 0 as prio, ''::text as ord from public.warehouse_items
    union all select code, price_incl, price_excl, 1 as prio, branch_id::text as ord from public.branch_items
  ) z
  where price_incl is not null or price_excl is not null   -- تجاهل صفوف بلا سعر فلا تُختار كأولوية فارغة فوق فرع مسعّر
  order by code, (price_incl is not null) desc, prio, ord   -- توفّر الشامل أولاً (فلا نأخذ صافي المستودع فوق شامل الفرع)، ثمّ المستودع، ثمّ ترتيب الفرع
)
select m.location,
       count(*)                                                              as rows_none,
       count(*) filter (where (op.price_incl is not null or op.price_excl is not null)
                           or (wp.price_incl is not null or wp.price_excl is not null))       as fixable,     -- له سعر في مصدر ما (توفّر السعر لا مجرّد وجود صفّ الموقع)
       count(*) filter (where (op.price_incl is null and op.price_excl is null)
                          and (wp.price_incl is null and wp.price_excl is null))              as still_none    -- لا سعر في أي مصدر ⇒ يبقى none
from public.sales_movements m
left join own_price op on op.location = m.location and op.code = m.sku
left join wh_price  wp on wp.code = m.sku
where m.price_source = 'none' and m.value_est is null
  and m.kind in ('estimated_sale','disappeared')
  and m.location = 'haraj_reh'                                                                  -- 🚨 النطاق المقصور
group by m.location
order by rows_none desc;


-- ── خطوة ٢: التحديث (شغّله بعد مراجعة خطوة ١ والموافقة) ──
with own_price as (
  select distinct on (location, code) location, code, price_incl, price_excl
  from (
    select 'wh'::text as location, code, price_incl, price_excl from public.warehouse_items
    union all select branch_id::text, code, price_incl, price_excl from public.branch_items
    union all select branch_id::text, code, price_incl, price_excl from public.sales_branch_items
  ) u
  order by location, code, (price_incl is not null or price_excl is not null) desc
),
wh_price as (
  select distinct on (code) code, price_incl, price_excl
  from (
    select code, price_incl, price_excl, 0 as prio, ''::text as ord from public.warehouse_items
    union all select code, price_incl, price_excl, 1 as prio, branch_id::text as ord from public.branch_items
  ) z
  where price_incl is not null or price_excl is not null
  order by code, (price_incl is not null) desc, prio, ord   -- توفّر الشامل أولاً، ثمّ المستودع، ثمّ ترتيب الفرع (مطابق لخطوة المعاينة)
),
resolved as (   -- اختيار مستوى كامل (٢ ثمّ ٣): إن كان لجدول الموقع سعر أُخذ منه incl＋excl معاً، وإلّا من المستودع/زد (المستودع أولاً)
  select m.id, m.delta,
    case when (op.price_incl is not null or op.price_excl is not null) then op.price_incl else wp.price_incl end as incl,   -- صفّ موقعٍ بلا سعر لا يحجب المستوى ٣
    case when (op.price_incl is not null or op.price_excl is not null) then op.price_excl else wp.price_excl end as excl
  from public.sales_movements m
  left join own_price op on op.location = m.location and op.code = m.sku
  left join wh_price  wp on wp.code = m.sku
  where m.price_source = 'none' and m.value_est is null
    and m.kind in ('estimated_sale','disappeared')
    and m.location = 'haraj_reh'                                                                -- 🚨 النطاق المقصور
)
update public.sales_movements m
set unit_price_incl = r.incl,
    unit_price_excl = r.excl,
    value_est       = abs(m.delta) * coalesce(r.incl, r.excl),                                  -- |delta| × (شامل إن وُجد وإلّا صافٍ) — يطابق computeMovements
    price_source    = case when r.incl is not null then 'backfill_stock' else 'backfill_stock_excl' end   -- تمييز الضريبة كالحيّ
from resolved r
where m.id = r.id
  and (r.incl is not null or r.excl is not null);                                               -- 🚫 ما لا سعر له يبقى 'none'


-- ── خطوة ٣: التحقّق (SELECT فقط) — التوزيع بعد التحديث ──
select price_source, count(*) as rows, count(value_est) as with_value
from public.sales_movements
where kind in ('estimated_sale','disappeared')
  and location = 'haraj_reh'
group by price_source
order by rows desc;
