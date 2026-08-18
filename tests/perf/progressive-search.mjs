// ============================================================================
// اختبار صريح (ب-٢): الرسم التدريجي لا يكسر البحث — البحث يعمل فوق الـ300 كاملة
// لا المرسوم تدريجياً فقط. يستخرج الدوال **الحقيقية** من index.html
// (scheduleUnifiedChunk · flushUnified · filterUnmatched · UNI_CHUNK) ويشغّلها في
// صفحة حقيقية عبر puppeteer، ثم يبحث عن صفّ لم يُرسَم بعد ويؤكّد ظهوره.
//
// تشغيل:  node tests/perf/progressive-search.mjs
//         node tests/perf/progressive-search.mjs --broken  (تحقّق ذاتي: بلا flush يجب أن يفشل)
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const html = readFileSync(join(root, "index.html"), "utf8");
const script = html.slice(html.lastIndexOf("\n<script>\n"), html.lastIndexOf("\n</script>"));
const BROKEN = process.argv.includes("--broken");

// جسم دالّة (مطابِق للأقواس) — نفس نهج batch-a-invariants
function fnSrc(name) {
  const re = new RegExp("(?:async\\s+)?function\\s+" + name + "\\s*\\([^)]*\\)\\s*\\{");
  const m = re.exec(script); if (!m) throw new Error("لم تُوجد الدالّة " + name);
  let i = m.index + m[0].length, d = 1;
  for (; i < script.length && d > 0; i++) { if (script[i] === "{") d++; else if (script[i] === "}") d--; }
  return script.slice(m.index, i);
}
const constSrc = name => (script.match(new RegExp("const\\s+" + name + "\\s*=\\s*[^;]+;")) || [])[0] || "";

// الدوال الحقيقية المستخرجة (لا نسخة يدوية — نختبر الكود الفعلي)
const REAL = [
  constSrc("UNI_CHUNK"),
  fnSrc("normText"),
  fnSrc("scheduleUnifiedChunk"),
  fnSrc("flushUnified"),
  fnSrc("filterUnmatched"),
].join("\n");

// في وضع --broken: نُعطّل flush داخل filterUnmatched لنثبت أن الاختبار يرسب على الكود المعطوب
const REAL_INJECTED = BROKEN ? REAL.replace("if (currentFilter === \"unmatched\") flushUnified();", "/* flush معطّل عمداً */") : REAL;

const page = `<!doctype html><html dir="rtl"><head><meta charset="utf-8"></head><body>
<input id="unSearch"><div class="mcards" id="unBody"></div>
<script>
let unifiedPending = null, unifiedRAF = 0;
let currentFilter = "unmatched";
${REAL_INJECTED}
// محاكاة renderUnifiedList: 300 صفّ، data-search="item i" — رسم أول دفعة ثم تدريجي
const N = 300;
const rows = Array.from({length:N}, (_,i) => '<div class="mc" data-search="item '+i+'">صنف '+i+'</div>');
const host = document.getElementById("unBody");
host.innerHTML = rows.slice(0, UNI_CHUNK).join("");
window.__initialRendered = host.children.length;   // يجب أن يكون UNI_CHUNK (تدريجي فعّال)
if (rows.length > UNI_CHUNK) { unifiedPending = { rows, idx: UNI_CHUNK, host }; scheduleUnifiedChunk(); }
// دالّة الاختبار: ابحث عن صفّ في الذيل (250) لم يُرسَم بعد، ثم صفِّ
window.__runSearch = (q) => {
  document.getElementById("unSearch").value = q;
  filterUnmatched();
  const total = host.children.length;
  const target = [...host.children].find(el => el.getAttribute("data-search") === "item 250");
  const targetVisible = !!target && target.style.display !== "none";
  const visibleCount = [...host.children].filter(el => el.style.display !== "none").length;
  return { total, targetPresent: !!target, targetVisible, visibleCount };
};
</script></body></html>`;

function findChrome() {
  const c = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome-stable", "/usr/bin/google-chrome", process.env.CHROME_PATH || ""];
  for (const x of c) if (x && existsSync(x)) return x;
  for (const n of ["google-chrome-stable", "google-chrome", "chromium"]) try { return execFileSync("bash", ["-lc", "command -v " + n]).toString().trim(); } catch {}
  return "";
}
const exe = findChrome();
if (!exe) { console.error("✗ لا Chrome. اضبط CHROME_PATH."); process.exit(2); }

const browser = await puppeteer.launch({ executablePath: exe, headless: "new", args: ["--no-sandbox", "--disable-gpu"] });
try {
  const p = await browser.newPage();
  await p.setContent(page, { waitUntil: "load" });
  const initial = await p.evaluate(() => window.__initialRendered);
  // ابحث فوراً (قبل أن يُكمل الرسم التدريجي) عن صفّ في الذيل
  const r = await p.evaluate(() => window.__runSearch("item 250"));
  const fails = [];
  if (initial >= 300) fails.push(`الرسم غير تدريجي (رُسمت ${initial} فوراً بدل ${40})`);
  if (!r.targetPresent) fails.push("الصفّ 250 غير موجود في DOM بعد البحث (flush لم يُدخِل المتبقّي)");
  if (!r.targetVisible) fails.push("الصفّ 250 غير ظاهر رغم مطابقته للبحث");
  if (r.total !== 300) fails.push(`إجمالي الصفوف ${r.total} ≠ 300 (البحث لا يعمل فوق الكل)`);
  if (r.visibleCount !== 1) fails.push(`ظهر ${r.visibleCount} صفّاً بدل 1 (تصفية خاطئة)`);
  console.log(`  رُسم ابتدائياً=${initial} · بعد البحث: إجمالي=${r.total} · الصفّ250 ظاهر=${r.targetVisible} · مرئي=${r.visibleCount}`);

  if (BROKEN) {
    if (fails.length) { console.log("\n✅ تحقّق ذاتي: الاختبار رسب على الكود المعطوب (flush معطّل) — كما يجب."); process.exit(0); }
    console.error("\n✗ خلل منهجي: الاختبار لم يرسب رغم تعطيل flush!"); process.exit(1);
  }
  if (fails.length) { console.error("\n✗ فشل اختبار الرسم التدريجي/البحث:\n" + fails.map(f => "  ✗ " + f).join("\n")); process.exit(1); }
  console.log("\n✅ الرسم التدريجي لا يكسر البحث — البحث يعمل فوق الـ300 كاملة.");
} finally { await browser.close(); }
