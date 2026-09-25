-- ============================================================================
-- ٣-ب: فهرس على activity_log لـ«حركة الصنف» (getBySku) — ✅ مُنفَّذ في القاعدة
-- (نسخة محسّنة راجعها المستخدم ونفّذها؛ هذا الملف مواءمةٌ لِما في القاعدة.)
--
-- السبب: البحث الثالث «حركة الصنف» و db.activity.getBySku يستعلمان
--   where zid_sku = ? order by created_at desc — فالفهرس **المركّب**
--   (zid_sku, created_at desc) يخدم الترشيح والترتيب معاً **بلا خطوة فرز**،
--   والشرط الجزئيّ where zid_sku is not null يستبعد صفوف العمليات الدفعيّة
--   القديمة (zid_sku IS NULL) فلا تُثقِل الفهرس.
-- 🚫 لا عمود جديد ولا تغيير بنية — فهرس فقط (append-only، idempotent).
-- الأثر: صفر على الكتابة الحاليّة؛ تسريع القراءة المُرشَّحة بالـsku حصراً.
-- ============================================================================

create index if not exists activity_log_zid_sku_created_idx
  on public.activity_log (zid_sku, created_at desc)
  where zid_sku is not null;

-- للتحقّق:
--   explain analyze select * from public.activity_log where zid_sku = '<sku>' order by created_at desc;
--   (يجب أن يستعمل activity_log_zid_sku_created_idx بلا Sort)
