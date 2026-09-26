// ============================================================================
// G-AI-METRIC-UNITS — لا تكرار وحدة في المقياس (القيمة، لا الشكل):
//   كل مقياس {label, value, unit}: value رقم بفواصله وحده (بلا حروف/وحدة)، unit منفصلة — الواجهة ترسم label·value·unit.
//   يمنع «26,816 ر.س شامل | ر.س» (الوحدة ثلاث مرّات).
// --broken: يدمج الوحدة في value (السلوك القديم) ⇒ value يحوي حروفاً ⇒ يرسب.
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
  const A = 'const mM  = (label, n) => ({ label, value: NF(n),  unit: "ر.س بسعر البيع شامل الضريبة" });';
  if (!s.includes(A)) { console.error("✗ (--broken) لم أجد mM"); process.exit(2); }
  s = s.replace(A, 'const mM  = (label, n) => ({ label, value: NF(n) + " ر.س",  unit: "ر.س" });   // (--broken) دمج قديم');
  tmp = join(dirname(SRC), "_broken_metric.mjs"); writeFileSync(tmp, s); url = pathToFileURL(tmp).href;
}
const { runIntent } = await import(url);

const now = Date.parse("2026-09-24T06:00:00Z");
const branches = [{ id: "az", name: "العزيزية" }];
const cap = "2026-09-23T06:00:00Z";
const uploads = [{ id: "U", location: "az", captured_at: cap, suspect: false }];
const movements = [{ upload_id: "U", location: "az", sku: "A", sku_name: "مفرش", kind: "estimated_sale", delta: -5, period_days: 5, captured_at: cap, value_est: 26816, unit_price_excl: 4664 }];
const stock = [{ location: "az", sku: "A", name: "مفرش", qty: 10, price_incl: 100, price_excl: 87 }];
const data = { movements, uploads, stock, branches };
const res = runIntent("sales_summary", { params: { period: "all", location: "all" }, data, nowMs: now, observedDays: 5 });
if (tmp) unlinkSync(tmp);

const metrics = res.metrics || [];
// value رقم بفواصله فقط: أرقام/فواصل/نقطة/إشارة — بلا أي حرف
const valueOk = (v) => /^[\d,]+(?:\.\d+)?$|^[+\-]\d+$/.test(String(v));
const bad = metrics.filter(m => !valueOk(m.value));

if (BROKEN) {
  if (bad.length) { console.log(`✅ (--broken) G-AI-METRIC-UNITS مسك الدمج: value يحوي وحدة «${bad[0].value}».`); process.exit(0); }
  console.error("✗ (--broken) value بقي رقماً نظيفاً — لا أسنان."); process.exit(1);
}
const fails = [];
if (!metrics.length) fails.push("لا مقاييس في sales_summary");
for (const m of metrics) {
  if (!valueOk(m.value)) fails.push(`value ليس رقماً وحده: «${m.value}» (الوحدة يجب أن تكون منفصلة)`);
  if (!m.unit || /^[\d,.\s]*$/.test(m.unit)) fails.push(`unit فارغة/رقمية في «${m.label}»`);
  if (m.unit && String(m.value).includes(m.unit)) fails.push(`الوحدة مكرّرة داخل value في «${m.label}»`);
}
if (fails.length) { console.error("✗ G-AI-METRIC-UNITS:\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`✅ G-AI-METRIC-UNITS: ${metrics.length} مقاييس · value رقم وحده · unit منفصلة (مثال: «${metrics[0].value}» + «${metrics[0].unit}»).`);
