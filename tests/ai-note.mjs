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
const SRC = join(root, "supabase", "functions", "ai-assistant", "index.ts");
let src = readFileSync(SRC, "utf8").replace(/\r\n/g, "\n");
const BROKEN = process.argv.includes("--broken");
if (BROKEN) {
  const A = "const structured = { lead, metrics: metrics.slice(0, 12), warning, note: answerNote, scope_label, period_label, analytical: true };";
  if (!src.includes(A)) { console.error("✗ (--broken) لم أجد structured النهائيّ"); process.exit(2); }
  src = src.replace(A, "const structured = { lead, metrics: metrics.slice(0, 12), warning, note: (parsed && parsed.note) || answerNote, scope_label, period_label, analytical: true };");
}
const fails = [];
if (!/const answerNote = /.test(src)) fails.push("لا يوجد answerNote (مصدر واحد للنوت)");
if (!/note: answerNote\b/.test(src)) fails.push("structured التحليليّ لا يستعمل note: answerNote");
if (/note: parsed\.note|note = parsed\.note|note: \(parsed/.test(src)) fails.push("النوت مشتقّ من النموذج/المسار (parsed.note) — يجب أن يكون من النطاق");
if (BROKEN) {
  if (fails.length) { console.log("✅ (--broken) G-AI-NOTE مسك العطل: النوت صار path-dependent (parsed.note)"); process.exit(0); }
  console.error("✗ (--broken) لم يُرصد الاختلاف — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ G-AI-NOTE:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-AI-NOTE: نوت واحد (answerNote) من النطاق للناجح والمتدهور — 🚫 لا parsed.note ولا نصّ تدهور خاصّ.");
