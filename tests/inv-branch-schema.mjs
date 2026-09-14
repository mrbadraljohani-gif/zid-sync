// ============================================================================
// G5 (دفعة ١أ) — قفل ضمانات مخطّط الفروع (ساكن، بلا متصفّح): لا صفوف يتيمة.
//   FK on delete cascade ⇒ حذف فرع يمسح صفوفه (لا يتامى) · المفتاح المركّب (branch_id, code)
//   ⇒ نفس الكود في عدّة فروع · branch_id not null ⇒ لا صفّ بلا فرع.
//   ＋ الكود (db.branches.remove) يحذف بالمعرّف فيُفعّل الـcascade.
// --broken: يزيل بند on delete cascade من نسخة الفحص ⇒ يرسب (الضمان مفقود).
// ============================================================================
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BROKEN = process.argv.includes("--broken");
let sql = readFileSync(join(root, "supabase_branches.sql"), "utf8").replace(/\r\n/g, "\n");
const html = readFileSync(join(root, "index.html"), "utf8").replace(/\r\n/g, "\n");
if (BROKEN) sql = sql.replace(/on delete cascade/g, "");

const norm = s => s.replace(/\s+/g, " ");
const S = norm(sql);
const fails = [];
const need = (ok, what) => { if (!ok) fails.push(what); };

need(/foreign key \(branch_id\) references public\.branches\(id\) on delete cascade/i.test(S), "FK (branch_id → branches.id) on delete cascade مفقود — قد تتيتّم الصفوف عند حذف فرع");
need(/unique \(branch_id, code\)/i.test(S), "المفتاح الفريد المركّب unique(branch_id, code) مفقود — نفس الكود لن يتواجد في عدّة فروع");
need(/alter table public\.branch_items alter column branch_id set not null/i.test(S), "branch_id set not null مفقود — قد يوجد صفّ بلا فرع");
need(/drop constraint if exists branch_items_code_key/i.test(S), "إسقاط المفتاح الوحيد القديم (code) مفقود — سيتعارض مع المركّب");
need(/create table if not exists public\.branches/i.test(S), "إنشاء جدول branches مفقود");
need(/^begin;/m.test(sql) && /commit;/.test(sql), "الهجرة ليست في معاملة واحدة (begin/commit) — قد تُترك جزئية");
// الكود يحذف الفرع بالمعرّف (يُفعّل الـcascade)، لا بحذف صفوف branch_items يدوياً
need(/remove\(id\)\s*{\s*const \{ error \} = await sb\.from\("branches"\)\.delete\(\)\.eq\("id", id\)/.test(html), "db.branches.remove لا يحذف الفرع بالمعرّف (مسار الـcascade)");

if (BROKEN) {
  if (fails.length) { console.log("✅ (--broken) G5 مسك فقدان الضمان: " + fails[0]); process.exit(0); }
  console.error("✗ (--broken) لم يرسب بعد إزالة on delete cascade — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ G5 ضمانات المخطّط:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G5: FK cascade · مفتاح مركّب (branch_id, code) · not null · معاملة واحدة · حذف الفرع بالمعرّف — لا صفوف يتيمة.");
