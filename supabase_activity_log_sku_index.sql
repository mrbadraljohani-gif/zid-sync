-- ============================================================================
-- ٣-ب: فهرس على activity_log.zid_sku — لتسريع «حركة الصنف» (getBySku)
-- ⚠️ لم يُنفَّذ بعد — أُرسل للمراجعة (البند ٨). نفّذه يدوياً مرّة في Supabase → SQL.
--
-- السبب: البحث الثالث «حركة الصنف» و db.activity.getBySku يُرشّحان بـ .eq("zid_sku", …)،
--   والجدول مفهرس على created_at و event_type فقط (supabase_activity_log.sql سطر 20-21).
--   بلا هذا الفهرس يُمسح الجدول كاملاً لكلّ استعلام صنف — يتفاقم مع نموّ السجل.
-- 🚫 لا عمود جديد ولا تغيير بنية — إضافة فهرس فقط (append-only، idempotent).
-- الأثر: صفر على الكتابة الحاليّة؛ تسريع القراءة المُرشَّحة بالـsku حصراً.
-- ============================================================================

create index if not exists activity_log_zid_sku_idx on public.activity_log (zid_sku);

-- للتحقّق بعد التنفيذ:
--   explain analyze select * from public.activity_log where zid_sku = '<sku>' order by created_at desc;
--   (يجب أن يستعمل activity_log_zid_sku_idx بدل Seq Scan)
