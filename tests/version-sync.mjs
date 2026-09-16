// ============================================================================
// version-sync (ساكن) — version.txt يطابق APP_VERSION المخبوز في index.html.
// شريط «نسخة جديدة» يقارن version.txt المجلوب بـAPP_VERSION المحمّل؛ لو انحرفا
// لأظهر الشريطُ نسخةً خاطئة (أو لم يظهر حين يجب). فالحارس يمنع الانحراف الصامت
// بدل كاتب آليّ من CI (أبسط وأوثق). أُحدِّث الملفّين معاً في كل commit.
//
// تشغيل:  node tests/version-sync.mjs
//         node tests/version-sync.mjs --broken   (تحقّق ذاتي: يبدّل version.txt ⇒ يجب أن يرسب)
// ============================================================================
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BROKEN = process.argv.includes("--broken");
const html = readFileSync(join(root, "index.html"), "utf8").replace(/\r\n/g, "\n");
let txt = readFileSync(join(root, "version.txt"), "utf8").trim().split(/\s+/)[0];
if (BROKEN) txt = txt + "X";   // اصنع انحرافاً مصطنعاً

const m = html.match(/const APP_VERSION = "([^"]+)"/);
const app = m ? m[1] : null;

const fails = [];
if (!app) fails.push("لم أجد APP_VERSION في index.html");
else if (!txt) fails.push("version.txt فارغ");
else if (app !== txt) fails.push(`انحراف: APP_VERSION=«${app}» ≠ version.txt=«${txt}» — حدّثهما معاً (الشريط سيعرض نسخة خاطئة)`);

if (BROKEN) {
  if (fails.length) { console.log("✅ (--broken) version-sync مسك الانحراف: " + fails[0]); process.exit(0); }
  console.error("✗ (--broken) لم يرسب بعد تبديل version.txt — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ version-sync:\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`✅ version-sync: version.txt == APP_VERSION == «${app}».`);
