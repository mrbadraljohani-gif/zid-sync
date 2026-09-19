# استعادة نسخة Supabase الاحتياطية

> نسخة لا تعرف استعادتها بلا قيمة. هذه الخطوات مختبَرة ومختصرة.

## ما في النسخة
مجلّد `backup-YYYY-MM-DD/` فيه ملفّ مضغوط لكل جدول (`<table>.json.gz`) ＋ `_summary.json` (التاريخ والأعداد).
الجداول: `mappings · waiting_items · matched_history · aliases · price_offsets · zid_products · zid_sync_meta · warehouse_items · branch_items · branches · inventory_sync_meta · activity_log · user_roles`.

## تنزيل النسخة
GitHub → الريبو الخاصّ → تبويب **Actions** → آخر تشغيل ناجح لـ«نسخة Supabase الاحتياطية» → قسم **Artifacts** → نزّل `supabase-backup-…` (zip). فُكّه، ثم لكل جدول: `gunzip <table>.json.gz` ⇒ `<table>.json` (مصفوفة صفوف JSON).

## الاستعادة إلى Supabase (اختر جدولاً واحداً أو الكلّ)
**الطريقة (أ) — REST بحساب مالك (owner) عبر توكن مؤقّت** (لجدول صغير/متوسط):
```bash
# 1) سجّل دخول المالك واحصل على توكن:
TOKEN=$(curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $PUBLISHABLE_KEY" -H "Content-Type: application/json" \
  -d '{"email":"OWNER_EMAIL","password":"OWNER_PASS"}' | jq -r .access_token)

# 2) ادفع الصفوف (upsert؛ يستبدل المتصادم بالمفتاح الفريد):
curl -s -X POST "$SUPABASE_URL/rest/v1/matched_history" \
  -H "apikey: $PUBLISHABLE_KEY" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -H "Prefer: resolution=merge-duplicates" \
  --data-binary @matched_history.json
```
كرّرها لكل جدول. **الترتيب مهمّ للـFK:** `branches` قبل `branch_items` · الجداول المرجعية قبل التابعة.

**الطريقة (ب) — SQL Editor** (لاستعادة كاملة/كبيرة): في Supabase → SQL Editor، لكل جدول:
```sql
-- مثال: أفرِغ ثم أدرِج (احذر: يمسح الحاليّ)
-- truncate public.matched_history;
insert into public.matched_history (zid_sku)
select value->>'zid_sku' from json_array_elements(:rows::json)
on conflict (zid_sku) do nothing;
```
(الصِق محتوى `<table>.json` مكان `:rows`، أو استعمل `COPY`/أداة استيراد.)

## تحقّق بعد الاستعادة
```sql
select count(*) from public.zid_products;      -- طابق _summary.json
select count(*) from public.mappings;
select count(*) from public.matched_history;
```
ثمّ افتح الأداة ⇒ «طابق وأنشئ» ⇒ يجب أن تعود الأرقام كما كانت يوم النسخة.

## ملاحظات
- `zid_products.raw` (jsonb) هو مصدر إعادة بناء `stData` — لا تُسقطه.
- `auth.users` (البُرد/كلمات المرور) **ليست** في النسخة (لا تُقرأ عبر REST) — تُدار من Supabase Auth مباشرةً.
- استعادة `user_roles` تعيد الأدوار؛ تأكّد أنّ صفّ المالك موجود بعدها.
