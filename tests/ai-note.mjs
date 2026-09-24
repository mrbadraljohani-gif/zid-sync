// ============================================================================
// G-AI-NOTE — سطر التنويه مشتقّ من النطاق لا من مسار الردّ (القيمة، لا الشكل):
//   الجواب التحليليّ (ناجح أو متدهور) يستعمل نوتاً واحداً (answerNote) — 🚫 لا note من النموذج (parsed.note)
//   ولا نصّ ثابت خاصّ بالتدهور. فالنصّ نفسه لنفس النطاق في الحالتين.
// --broken: يجعل النوت path-dependent (parsed.note في النجاح) ⇒ يختلف عن التدهور ⇒ يرسب.
// ============================================================================
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const AIDIR = join(root, "supabase", "functions", "ai-assistant");
const SRC = join(AIDIR, "index.ts");
let src = readFileSync(SRC, "utf8").replace(/\r\n/g, "\n");
let intentsSrc = readFileSync(join(AIDIR, "intents.mjs"), "utf8").replace(/\r\n/g, "\n");
const BROKEN = process.argv.includes("--broken");
const BROKEN_DUP = process.argv.includes("--broken-dup");
if (BROKEN) {
  const A = "const structured = { lead, metrics: metrics.slice(0, 12), warning, note: answerNote, scope_label, period_label, analytical: true };";
  if (!src.includes(A)) { console.error("✗ (--broken) لم أجد structured النهائيّ"); process.exit(2); }
  src = src.replace(A, "const structured = { lead, metrics: metrics.slice(0, 12), warning, note: (parsed && parsed.note) || answerNote, scope_label, period_label, analytical: true };");
}
if (BROKEN_DUP) {
  // يعيد نوت المبيعات المكرّر في sales_summary (مصدر ثانٍ للتنويه ⇒ سطران متطابقان)
  const A = "    branches_missing_upload: r.missingLocs.map(d => d.name)";
  if (!intentsSrc.includes(A)) { console.error("✗ (--broken-dup) لم أجد نهاية sales_summary"); process.exit(2); }
  intentsSrc = intentsSrc.replace(A, A + ',\n    note: "المبيعات مقدّرة (من نقص الكمية) لا مؤكّدة · المستودع مستبعَد (مخزن لا نقطة بيع)"');
}
const fails = [];
if (!/const answerNote = /.test(src)) fails.push("لا يوجد answerNote (مصدر واحد للنوت)");
if (!/note: answerNote\b/.test(src)) fails.push("structured التحليليّ لا يستعمل note: answerNote");
if (/note: parsed\.note|note = parsed\.note|note: \(parsed/.test(src)) fails.push("النوت مشتقّ من النموذج/المسار (parsed.note) — يجب أن يكون من النطاق");
// 🚨 عدّ التنويه: مصدرٌ واحدٌ فقط لجملة «مقدّرة … مستبعَد» **كسلسلة مقتبسة** (note/answerNote) عبر الملفّين — التكرار سطران متطابقان.
//    نحصره في السلاسل ذات علامتَي الاقتباس المزدوجة (النوت الفعليّ) — التعليقات تستعمل «» فلا تُحسب (لا عدّ للتعليق).
const both = src + "\n" + intentsSrc;
const disclaimers = (both.match(/"[^"]*مقدّرة[^"]*مستبعَد[^"]*"|"[^"]*مستبعَد[^"]*مقدّرة[^"]*"/g) || []).length;
if (BROKEN_DUP) {
  if (disclaimers > 1) { console.log(`✅ (--broken-dup) G-AI-NOTE مسك التكرار: ${disclaimers} مصادر لجملة التنويه (يجب 1).`); process.exit(0); }
  console.error(`✗ (--broken-dup) لم يُرصد التكرار (عدد=${disclaimers}) — لا أسنان.`); process.exit(1);
}
if (disclaimers > 1) fails.push(`🚨 تنويه «مقدّرة…مستبعَد» متكرّر (${disclaimers} مصادر) — يجب مصدراً واحداً (answerNote) فلا سطران متطابقان`);
if (BROKEN) {
  if (fails.length) { console.log("✅ (--broken) G-AI-NOTE مسك العطل: النوت صار path-dependent (parsed.note)"); process.exit(0); }
  console.error("✗ (--broken) لم يُرصد الاختلاف — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ G-AI-NOTE:\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`✅ G-AI-NOTE: نوت واحد (answerNote) من نوع المقياس · تنويه «مقدّرة…مستبعَد» بمصدر واحد (عدد=${disclaimers}) · لا parsed.note.`);
