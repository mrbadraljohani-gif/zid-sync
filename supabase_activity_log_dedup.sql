-- ============================================================================
-- ٣-ب / البند أ: منع تكرار تسجيل تحوّلات run() في activity_log
-- ⚠️ لم يُنفَّذ بعد — أُرسل للمراجعة. نفّذه يدوياً مرّة في Supabase → SQL.
--
-- المشكلة: كل تشغيلة run() كاملة تعيد رصد نفس التحوّل (before←after من مرآة زد
--   التي لا تتغيّر حتى تُعاد المزامنة) فتسجّله من جديد ⇒ نفس القرار ٣ مرّات/27ث.
-- الحلّ: مفتاح تفرّد حتميّ dedup_key = zid_sku|event_type|before|after|reason|mirror_ts
--   (mirror_ts = طابع مزامنة المرآة zid_sync_meta.synced_at). التحوّل نفسه على
--   المرآة نفسها ⇒ مفتاح واحد ⇒ صفّ واحد. تتغيّر المرآة ⇒ mirror_ts جديد ⇒ ذاتيّ الشفاء.
--   الكتابة عبر upsert(onConflict:"dedup_key", ignoreDuplicates:true) = INSERT … ON CONFLICT DO NOTHING.
-- ============================================================================

-- 1) عمود dedup_key — nullable (الصفوف الـ74 القديمة تبقى NULL بلا كسر). idempotent.
alter table public.activity_log add column if not exists dedup_key text;

-- 2) فهرس فريد على dedup_key.
--    🔸 غير جزئيّ عمداً: القيَم NULL في الفهرس الفريد **متمايزة افتراضياً** في Postgres
--       (كل NULL ≠ الآخر) فالصفوف الـ74 بلا مفتاح لا تتعارض ولا يفشل الإنشاء —
--       نفس أمان الفهرس الجزئيّ الذي طلبتَه، بلا الحاجة إلى شرط WHERE.
--    🔸 لماذا لا جزئيّ (where dedup_key is not null): PostgREST/‏supabase-js في
--       upsert(ignoreDuplicates) يولّد ON CONFLICT (dedup_key) بلا شرط WHERE،
--       والفهرس الجزئيّ لا يُستدلّ عليه إلا بذكر شرطه في ON CONFLICT — فلا يعمل
--       منع التكرار على مستوى القاعدة معه عبر PostgREST. الفهرس الكامل يعمل تماماً.
--    (لو فضّلت الجزئيّ رغم ذلك: يبقى درع الجلسة runLogSentKeys يمنع تكرار الجلسة،
--     ويسقط منع التكرار عبر الجلسات فقط — أخبرني وأبدّل الكتابة إلى insert مع تجاهل 23505.)
create unique index if not exists activity_log_dedup_key_uidx
  on public.activity_log (dedup_key);

-- للتحقّق بعد التنفيذ:
--   -- إدراج نفس التحوّل مرّتين ⇒ صفّ واحد:
--   insert into public.activity_log (event_type, zid_sku, details, dedup_key)
--     values ('qty_zeroed','TEST',' {}'::jsonb,'TEST|qty_zeroed|10|0|absent|X')
--     on conflict (dedup_key) do nothing;   -- كرّرها ⇒ لا صفّ ثانٍ
--   select count(*) from public.activity_log where dedup_key = 'TEST|qty_zeroed|10|0|absent|X';  -- = 1
--   delete from public.activity_log where zid_sku = 'TEST';   -- تنظيف
