// ============================================================================
// G-AI-NUMBERS — تحقّق الأرقام بنيوياً (القيمة، لا الشكل):
//   كل رقم في جواب النموذج له أصل حرفيّ في نتيجة الاستعلام؛ رقم بلا أصل ⇒ يُرفض الجواب كلّه.
//   يحوّل «لا تخترع رقماً» من تعليمة تُكسر إلى فحص لا يُكسر.
// --broken: يجعل verifyAnswerNumbers تُرجع ok:true دائماً ⇒ رقم مُلفَّق يمرّ ⇒ يرسب (= السلوك بلا تحقّق).
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
  const A = "  return { ok: offending.length === 0, offending };";
  if (!s.includes(A)) { console.error("✗ (--broken) لم أجد مخرج verifyAnswerNumbers"); process.exit(2); }
  s = s.replace(A, "  return { ok: true, offending: [] };   // (--broken) بلا تحقّق");
  tmp = join(dirname(SRC), "_broken_numbers.mjs"); writeFileSync(tmp, s); url = pathToFileURL(tmp).href;
}
const { verifyAnswerNumbers, collectSourceNumbers } = await import(url);

const source = { display: { sales: "36,588 ر.س شامل", units: "656 قطعة" }, lines: ["مقلاة: 300 ر.س شامل · 2 قطعة"] };
const src = collectSourceNumbers(source);
const legit = verifyAnswerNumbers({ lead: "بلغت المبيعات 36,588 وبيعت 656 قطعة", metrics: [{ label: "مقلاة", value: "300 ر.س", unit: "" }] }, src);
const fake = verifyAnswerNumbers({ lead: "بلغت المبيعات 41,000 ريال" }, src);   // 41000 لا أصل له
if (tmp) unlinkSync(tmp);

if (BROKEN) {
  if (fake.ok) { console.log("✅ (--broken) G-AI-NUMBERS مسك العطل: رقم مُلفَّق (41000) مرّ بلا تحقّق."); process.exit(0); }
  console.error("✗ (--broken) الرقم المُلفَّق لم يمرّ — لا أسنان."); process.exit(1);
}
const fails = [];
if (!legit.ok) fails.push("رُفض جواب أرقامه كلّها من المصدر: " + legit.offending.join(","));
if (fake.ok) fails.push("قُبل جواب فيه رقم مُلفَّق (41000) بلا أصل — يجب رفضه");
if (!fake.offending.includes("41000")) fails.push("لم يُرصد الرقم المُلفَّق 41000 في offending");
if (fails.length) { console.error("✗ G-AI-NUMBERS:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-AI-NUMBERS: الجواب المطابق يُقبل · المُلفَّق (41000) يُرفض ويُرصد.");
