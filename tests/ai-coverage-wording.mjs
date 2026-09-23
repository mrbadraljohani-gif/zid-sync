// ============================================================================
// G-AI-COVERAGE-WORDING — الفصل الدلاليّ (القيمة، لا الشكل):
//   إن كان المرصود < المطلوب ⇒ الجواب **يبدأ** بالنقص لا ينتهي به (enforceCoverageLead بنيويّاً).
//   يمنع جواباً صحيحاً رقمياً ومضلّلاً معنىً («لفترة 7 أيام…» ثم ينفيه).
// --broken: enforceCoverageLead تُعيد lead كما هو (بلا بادئة) ⇒ لا يبدأ بالنقص ⇒ يرسب (= السلوك الحاليّ).
// ============================================================================
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "..", "supabase", "functions", "ai-assistant", "intents.mjs");
const BROKEN = process.argv.includes("--broken");

let url = pathToFileURL(SRC).href, tmp = "";
if (BROKEN) {
  let s = readFileSync(SRC, "utf8");
  const A = "  return L.startsWith(coverageText) ? L : `${coverageText}. وخلال هذه المدة: ${L}`;";
  if (!s.includes(A)) { console.error("✗ (--broken) لم أجد جسم enforceCoverageLead"); process.exit(2); }
  s = s.replace(A, "  return L;   // (--broken) بلا بادئة نقص (السلوك القديم: الأرقام أوّلاً ثم النفي)");
  tmp = join(dirname(SRC), "_broken_cover.mjs"); writeFileSync(tmp, s); url = pathToFileURL(tmp).href;
}
const { enforceCoverageLead } = await import(url);

const cover = "البيانات تغطّي 2.7 يوم من 7 يوم المطلوبة";
const modelLead = "بلغت مبيعات الخضرة 26,816 ر.س شامل.";
const out = enforceCoverageLead(modelLead, cover);
// بلا نقص ⇒ لا تغيير
const out2 = enforceCoverageLead(modelLead, null);
if (tmp) unlinkSync(tmp);

if (BROKEN) {
  if (!out.startsWith(cover)) { console.log("✅ (--broken) G-AI-COVERAGE-WORDING مسك العطل: الجواب لا يبدأ بالنقص (بادئة مُعطّلة)."); process.exit(0); }
  console.error("✗ (--broken) بدأ بالنقص رغم التعطيل — لا أسنان."); process.exit(1);
}
const fails = [];
if (!out.startsWith(cover)) fails.push(`الجواب لا يبدأ بالنقص: «${out.slice(0, 40)}…»`);
if (!/وخلال هذه المدة/.test(out)) fails.push("لا يفصل «وخلال هذه المدة»");
if (out2 !== modelLead) fails.push("بلا نقص: عُدّل الجواب (يجب إبقاؤه كما هو)");
if (fails.length) { console.error("✗ G-AI-COVERAGE-WORDING:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-AI-COVERAGE-WORDING: يبدأ بالنقص ثم «وخلال هذه المدة» · بلا نقص لا يُعدَّل.");
