// ============================================================================
// حارس CRLF: الحراس الساكنة يجب أن تمرّ على نسخة نهايات أسطرها CRLF (ويندوز).
// الفخّ: html.lastIndexOf("\\n<script>\\n") يعطي -1 على CRLF ⇒ السكربت المقطوع فارغ
// ⇒ **رسوب زائف** لا علاقة له بالكود. يمرّ في CI (checkout بـLF) فيضيع وقت المطوّر
// على ويندوز في مطاردة عطل غير موجود — وقع فعلاً في دفعة تبسيط التدفّق ١.
// العلاج: كل قراءة لـindex.html تُطبَّع فور القراءة.
//
// تشغيل:  node tests/crlf-safe.mjs
//         node tests/crlf-safe.mjs --broken   (تحقّق ذاتي: يزيل التطبيع ⇒ يجب أن يرسب)
// ============================================================================
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BROKEN = process.argv.includes("--broken");
const CRLF = /\r\n/g, LF = /\n/g;
const NORM_RE = /\.replace\(\/\\r\\n\/g, *\"\\n\"\)/g;

// الحراس الساكنة فقط (بلا متصفّح) — هي التي تقطع السكربت نصّياً
const GUARDS = ["batch-a-invariants.mjs", "b2-invariants.mjs", "b2-analyze-counts.mjs", "b2-missed-rounds.mjs", "b3-run-regression.mjs", "stat-active.mjs", "token-defs.mjs", "glass-rows.mjs"];

const tmp = mkdtempSync(join(tmpdir(), "crlf-"));
mkdirSync(join(tmp, "tests"), { recursive: true });

// index.html بنهايات CRLF مصطنعة (يحاكي checkout ويندوز)
const html = readFileSync(join(root, "index.html"), "utf8").replace(CRLF, "\n");
writeFileSync(join(tmp, "index.html"), html.replace(LF, "\r\n"));

for (const g of GUARDS) {
  let src = readFileSync(join(root, "tests", g), "utf8").replace(CRLF, "\n");
  if (BROKEN) src = src.replace(NORM_RE, "");   // --broken: أزِل التطبيع ⇒ يعود الفخّ
  writeFileSync(join(tmp, "tests", g), src);
}

const fails = [];
for (const g of GUARDS) {
  const r = spawnSync(process.execPath, [join(tmp, "tests", g)], { encoding: "utf8" });
  if (r.status !== 0) fails.push(g);
}

if (BROKEN) {
  if (!fails.length) { console.error("✗ التحقّق الذاتي: بلا تطبيع لم يرسب أي حارس — الفحص بلا أسنان."); process.exit(1); }
  console.log("✅ تحقّق ذاتي: بلا التطبيع رسب " + fails.length + "/" + GUARDS.length + " حارساً — الفخّ حقيقي وللفحص أسنان.");
  console.log("   الراسبون: " + fails.join(" · "));
  process.exit(0);
}
if (fails.length) {
  console.error("✗ " + fails.length + " حارساً يرسب على نسخة CRLF (فخّ نهايات الأسطر عاد):");
  for (const f of fails) console.error("  ✗ " + f);
  console.error("  العلاج: طبّع فور readFileSync لـindex.html.");
  process.exit(1);
}
console.log("✅ الحراس الساكنة الـ" + GUARDS.length + " تمرّ على نسخة CRLF — لا رسوب زائف على ويندوز.");
