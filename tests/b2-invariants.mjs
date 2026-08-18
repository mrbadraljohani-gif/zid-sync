// ============================================================================
// حراس الدفعة (ب-٢) الثابتة — القائمة الموحّدة «بدون ربط».
// (الحارسان الديناميكيان: overflow-guard.mjs [تجاوز أفقي + لاصق معتم] و
//  progressive-search.mjs [الرسم التدريجي لا يكسر البحث] — كلاهما puppeteer.)
// هنا: حارس «إيموجي» (مؤشّرات الثقة SVG لا إيموجي ملوّنة) + «لا أرقام قبل المطابقة» + التوصيل.
// ============================================================================
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "index.html"), "utf8");
const script = html.slice(html.lastIndexOf("\n<script>\n"), html.lastIndexOf("\n</script>"));
const fails = [], ok = [];
const check = (c, m) => (c ? ok : fails).push(m);
function fnSrc(name) {
  const re = new RegExp("(?:async\\s+)?function\\s+" + name + "\\s*\\([^)]*\\)\\s*\\{");
  const m = re.exec(script); if (!m) return "";
  let i = m.index + m[0].length, d = 1;
  for (; i < script.length && d > 0; i++) { if (script[i] === "{") d++; else if (script[i] === "}") d--; }
  return script.slice(m.index, i);
}

// (1) التوصيل: القائمة الموحّدة هي مسار «بدون ربط»
check(/renderUnifiedList\(bindBtn, title, wrap\)/.test(script), "renderDetailBody يستدعي renderUnifiedList لفلتر «بدون ربط»");
check(/function renderUnifiedList\b/.test(script), "renderUnifiedList معرّفة");
check(/batchData = null;\s*\/\/ بيانات «بدون ربط»/.test(script), "refreshUnmatchedUI يبطل batchData (إعادة تحليل الثقة)");

// (2) حارس «إيموجي»: مؤشّرات الثقة في الشريط الموحّد SVG (DOT_*) لا إيموجي ملوّنة 🟢🟡🔴
const bar = fnSrc("unifiedBar");
check(bar.includes("DOT_OK") && bar.includes("DOT_MID") && bar.includes("DOT_BAD"), "unifiedBar يستعمل نقاط SVG (DOT_*) للثقة");
check(!bar.includes("🟢") && !bar.includes("🟡") && !bar.includes("🔴"), "unifiedBar بلا إيموجي ثقة ملوّنة (🟢/🟡/🔴)");

// (3) الرسم تدريجي + البحث عبر flush
const uni = fnSrc("renderUnifiedList");
check(uni.includes("UNI_CHUNK") && uni.includes("scheduleUnifiedChunk"), "renderUnifiedList رسم تدريجي (UNI_CHUNK + scheduleUnifiedChunk)");
check(fnSrc("filterUnmatched").includes("flushUnified"), "filterUnmatched يستدعي flushUnified (بحث فوق الكل)");

// (4) الصفّ الخفيف تفاعلي (تراجع مباشر بلا تحويله لبطاقة كاملة)
const light = fnSrc("unifiedLightRow");
check(light.includes("undoWaitDecision") && light.includes("undoIgnoreDecision"), "الصفّ الخفيف فيه تراجع مباشر (undo*)");

// (5) حارس «لا أرقام قبل المطابقة»: العدّادات تبدأ 0 والكتلة مخفيّة حتى المطابقة
check(/id="sUn">0</.test(html), "عدّاد «بدون ربط» يبدأ 0 في الترميز");
check(/id="sUpd"[^>]*>0</.test(html) || /id="sUpd">0</.test(html), "عدّاد «تم تحديثه» يبدأ 0");
check(/id="unBlock"[^>]*style="display:none"/.test(html), "كتلة القائمة (#unBlock) مخفيّة حتى المطابقة");

// النتيجة
console.log(`✓ ${ok.length} تحقّق ناجح`);
if (fails.length) { console.error(`\n✗ ${fails.length} فشل:\n` + fails.map(f => "  ✗ " + f).join("\n")); process.exit(1); }
console.log("✅ حراس ب-٢ الثابتة سليمة.");
