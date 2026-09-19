// نسخة احتياطية يومية لكل جداول public في Supabase.
// يسجّل دخول حساب «نسخ احتياطيّ» (viewer بلا دور في user_roles) فيقرأ عبر RLS (select مفتوح للموثّقين) ولا يكتب شيئاً،
// ثم يكتب كل جدول JSON مضغوطاً (gzip). فشلٌ صريح إن كان أيّ جدول أساسيّ فارغاً (لا نسخة فارغة صامتة).
//
// يعمل داخل ريبو **خاصّ** فقط (بيانات عمل حسّاسة) — لا في zid-sync العامّ.
// بيئة مطلوبة (GitHub Secrets): SUPABASE_URL · SUPABASE_PUBLISHABLE_KEY · BACKUP_EMAIL · BACKUP_PASSWORD
import { gzipSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const URL = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
const EMAIL = process.env.BACKUP_EMAIL, PASS = process.env.BACKUP_PASSWORD;
if (!URL || !KEY || !EMAIL || !PASS) { console.error("✗ مفاتيح ناقصة — تأكّد من Secrets: SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY/BACKUP_EMAIL/BACKUP_PASSWORD"); process.exit(1); }

const TABLES = ["mappings", "waiting_items", "matched_history", "aliases", "price_offsets", "zid_products", "zid_sync_meta", "warehouse_items", "branch_items", "branches", "inventory_sync_meta", "activity_log", "user_roles"];
const MUST_HAVE = ["zid_products", "mappings", "matched_history"];   // فارغة ⇒ فشل متعمّد (نسخة مشبوهة)

// 1) تسجيل الدخول (حساب viewer) للحصول على توكن authenticated — RLS تفتح القراءة للموثّقين لا anon
const auth = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
  method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASS }),
});
if (!auth.ok) { console.error("✗ فشل تسجيل دخول حساب النسخ:", auth.status, await auth.text()); process.exit(1); }
const token = (await auth.json()).access_token;
if (!token) { console.error("✗ لم أحصل على access_token"); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${token}` };

// 2) اسحب كل جدول مُصفَّحاً (Range) واكتبه مضغوطاً
const day = new Date().toISOString().slice(0, 10);
const dir = `backup-${day}`; mkdirSync(dir, { recursive: true });
const counts = {};
for (const t of TABLES) {
  const rows = []; let from = 0; const page = 1000;
  for (;;) {
    const r = await fetch(`${URL}/rest/v1/${t}?select=*`, { headers: { ...H, "Range-Unit": "items", Range: `${from}-${from + page - 1}` } });
    if (!r.ok) { console.error(`✗ فشل قراءة ${t}:`, r.status, await r.text()); process.exit(1); }
    const chunk = await r.json();
    rows.push(...chunk);
    if (chunk.length < page) break; from += page;
  }
  counts[t] = rows.length;
  writeFileSync(`${dir}/${t}.json.gz`, gzipSync(Buffer.from(JSON.stringify(rows), "utf8")));
  console.log(`  ${t}: ${rows.length} صفّاً`);
}
writeFileSync(`${dir}/_summary.json`, JSON.stringify({ day, counts, generated_at: new Date().toISOString() }, null, 2));

// 3) صمّام: نسخة فارغة مشبوهة ⇒ فشل صريح (GitHub يراسلك؛ لا فشل صامت)
const empty = MUST_HAVE.filter(t => !counts[t]);
if (empty.length) { console.error("🚨 نسخة مشبوهة — جداول أساسية فارغة:", empty.join(", "), "— أفشلتُ التشغيل عمداً."); process.exit(1); }
console.log("✅ نسخة", day, "اكتملت:", JSON.stringify(counts));
