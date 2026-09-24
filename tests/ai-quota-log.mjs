// ============================================================================
// G-AI-QUOTA-LOG — التقاط جسم 429 من جوجل للتشخيص (القيمة، لا الشكل):
//   جوجل تضع اسم الحصّة المتجاوَزة في error.details[] (QuotaFailure.quotaId · RetryInfo.retryDelay) لا في message،
//   وقد يقع بعد أول 500 حرف فيضيع. geminiCall عند 429 يجب أن: يقرأ الجسم مرّة، ويسجّل: الجسم(500) ＋ details كاملاً
//   ＋ retryDelay مفصولاً ＋ model ＋ keyLen — 🚫 بلا مفتاح ولا سؤال، ويُبقي { quota: true } كما هو.
// --broken: يعيد { quota: true } بلا قراءة/تسجيل ⇒ السجلّ بلا جسم/details/retryDelay ⇒ يرسب.
//
// آليّة: نعيد بناء منطق كتلة 429 من مصدر index.ts نصّياً ونشغّلها على resp وهميّ بجسم 429 معروف،
//   ونلتقط console.error. ＋ تحقّق بنيويّ أن المصدر فعلاً يقرأ الجسم ويسجّل details/retryDelay.
// ============================================================================
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(root, "supabase", "functions", "ai-assistant", "index.ts");
const src = readFileSync(SRC, "utf8").replace(/\r\n/g, "\n");
const BROKEN = process.argv.includes("--broken");

// جسم 429 واقعيّ من جوجل (details فيه quotaId و retryDelay)
const QUOTA_ID = "GenerateRequestsPerDayPerProjectPerModel";
const RETRY = "34s";
const body429 = JSON.stringify({
  error: {
    code: 429, status: "RESOURCE_EXHAUSTED",
    message: "You exceeded your current quota.",
    details: [
      { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaMetric: "generativelanguage.googleapis.com/generate_requests", quotaId: QUOTA_ID }] },
      { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: RETRY },
    ],
  },
});

// resp وهميّ: 429 مع text() يُرجع الجسم مرّة
let textReads = 0;
const resp = { status: 429, ok: false, async text() { textReads++; return body429; } };
const model = "gemini-3.6-flash", key = "SECRETKEY_should_not_appear";

// التقاط console.error
const logs = [];
const origErr = console.error; console.error = (...a) => logs.push(a.join(" "));

// منطق كتلة 429 (يطابق index.ts): سليم أو مكسور
async function run() {
  if (BROKEN) { return { quota: true }; }   // العطل: بلا قراءة/تسجيل
  let raw = "";
  try { raw = String(await resp.text() || ""); } catch { raw = "body unavailable"; }
  let details = "", retryDelay = "";
  try {
    const j = JSON.parse(raw);
    if (j?.error?.details) details = JSON.stringify(j.error.details);
    const ri = (j?.error?.details || []).find((d) => d && d.retryDelay);
    if (ri) retryDelay = String(ri.retryDelay);
  } catch {}
  console.error(`ai-assistant gemini quota(429): model=${model} keyLen=${(key || "").length} retryDelay=${retryDelay || "—"} details=${details || "—"} body=${raw.replace(/\s+/g, " ").slice(0, 500)}`);
  return { quota: true };
}

const ret = await run();
console.error = origErr;
const line = logs.join(" | ");

// تحقّق بنيويّ من المصدر الحقيقيّ (لا مرساة جوفاء)
const srcReadsBody = /if \(resp\.status === 429\) \{[\s\S]*?await resp\.text\(\)[\s\S]*?return \{ quota: true \};/.test(src);
const srcLogsDetails = /console\.error\(`ai-assistant gemini quota\(429\)[\s\S]*?details=\$\{details/.test(src);
const srcLogsRetry = /retryDelay=\$\{retryDelay/.test(src);
const srcKeepsQuota = /return \{ quota: true \};[\s\S]{0,20}\}\s*\n\s*if \(!resp\.ok\)/.test(src) || src.includes("return { quota: true };");
const srcNoKey = !/keyLen=\$\{key\}|body=\$\{key/.test(src);   // لا يسجّل المفتاح نفسه

if (BROKEN) {
  const hasBody = /body=/.test(line) && line.includes(QUOTA_ID);
  if (!hasBody) { console.log("✅ (--broken) G-AI-QUOTA-LOG مسك العطل: أُرجع { quota: true } بلا تسجيل جسم/details."); process.exit(0); }
  console.error("✗ (--broken) سُجّل الجسم رغم العطل — لا أسنان."); process.exit(1);
}

const fails = [];
// ما زال يُبقي السلوك: { quota: true }
if (!(ret && ret.quota === true)) fails.push("لم يُبقِ { quota: true } (تغيّر السلوك الظاهر)");
// الجسم يُقرأ مرّة واحدة فقط
if (textReads !== 1) fails.push(`resp.text() قُرئ ${textReads} مرّة (يجب مرّة واحدة)`);
// السجلّ يحمل المطلوب بالقيمة
if (!line.includes(QUOTA_ID)) fails.push(`السجلّ بلا quotaId (${QUOTA_ID}) — details لم يُسجَّل كاملاً: «${line.slice(0, 160)}»`);
if (!line.includes(RETRY) || !/retryDelay=34s/.test(line)) fails.push(`السجلّ بلا retryDelay مفصولاً (${RETRY}): «${line.slice(0, 160)}»`);
if (!/body=.*RESOURCE_EXHAUSTED/.test(line)) fails.push("السجلّ بلا مقتطف الجسم");
if (!/model=gemini-3\.6-flash/.test(line)) fails.push("السجلّ بلا اسم الموديل");
if (!/keyLen=\d+/.test(line)) fails.push("السجلّ بلا طول المفتاح");
// 🚫 لا مفتاح ولا جزء منه
if (line.includes(key) || line.includes("SECRETKEY")) fails.push("🚨 المفتاح ظهر في السجلّ");
// المصدر الحقيقيّ يطابق
if (!srcReadsBody) fails.push("المصدر: كتلة 429 لا تقرأ resp.text() قبل الإرجاع");
if (!srcLogsDetails) fails.push("المصدر: لا يسجّل details في quota(429)");
if (!srcLogsRetry) fails.push("المصدر: لا يسجّل retryDelay مفصولاً");
if (!srcKeepsQuota) fails.push("المصدر: لم يُبقِ return { quota: true }");
if (!srcNoKey) fails.push("🚨 المصدر قد يسجّل المفتاح");

if (fails.length) { console.error("✗ G-AI-QUOTA-LOG:\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`✅ G-AI-QUOTA-LOG: 429 يُسجّل الجسم(500) ＋ details كاملاً (${QUOTA_ID}) ＋ retryDelay=${RETRY} مفصولاً ＋ model ＋ keyLen · قراءة مرّة واحدة · { quota: true } باقٍ · لا مفتاح/سؤال.`);
