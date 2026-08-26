// ============================================================================
// حارس الصمّامين (الدفعة ٤) — سلوكي في متصفّح حقيقي، لا بنيوي.
//   ① بوّابة الرفع: انكماش المخزن > INV_SHRINK_PCT ⇒ توقّف وتأكيد صريح،
//      والإلغاء **لا يعتمد الملف محلياً ولا يكتب في القاعدة** (المخزن السابق كما هو).
//   ② صمّام التنزيل: نسبة التصفير من إجمالي منتجات زد > ZERO_GATE_PCT ⇒ يوقف التنزيل.
// المقام في ② هو **إجمالي منتجات زد** لا حجم الملف: مستقرّ فتُقارَن النسبة بين التشغيلات.
//
// تشغيل:  node tests/valves.mjs
//         node tests/valves.mjs --broken   (تحقّق ذاتي: يزيل نداء البوّابة ⇒ يجب أن يرسب)
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import puppeteer from "puppeteer-core";

let html = readFileSync(new URL("../index.html", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const BROKEN = process.argv.includes("--broken");
if (BROKEN) {
  // اكسر البوّابة كما لو نُسي نداؤها في onMergeWh (العطل الواقعي: الملف الناقص يُعتمد)
  html = html.replace('if (!invShrinkCheck("wh", aggWh.length))', "if (false)");
}

function findChrome() {
  const c = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", process.env.CHROME_PATH || "", "/usr/bin/google-chrome-stable"];
  for (const x of c) if (x && existsSync(x)) return x;
  for (const n of ["google-chrome-stable", "google-chrome", "chromium"]) try { return execFileSync("bash", ["-lc", "command -v " + n]).toString().trim(); } catch {}
  return "";
}
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setRequestInterception(true);
page.on("request", req => { const u = req.url(); if (/^https?:/.test(u)) return req.abort(); req.continue(); });
await page.setContent(html, { waitUntil: "load" });
await new Promise(r => setTimeout(r, 300));

const fails = [];
const check = (ok, what) => { if (!ok) fails.push(what); };

// ---------- ① بوّابة الرفع: عتبة دقيقة ----------
const gate = await page.evaluate(() => {
  const ov = document.getElementById("loginOverlay"); if (ov) ov.style.display = "none";
  const calls = [];
  window.confirm = m => { calls.push(m); return false; };   // المستخدم يلغي
  const out = { pct: INV_SHRINK_PCT, calls };
  invMeta = { id: 1, wh_count: 2000, branch_count: 1000 };
  out.small = invShrinkCheck("wh", 1900);        // −5%  ⇒ يمرّ بلا حوار
  out.atEdge = invShrinkCheck("wh", 1700);       // −15% (على الحدّ) ⇒ يمرّ
  out.overEdge = invShrinkCheck("wh", 1699);     // −15.05% ⇒ يوقف
  out.growth = invShrinkCheck("wh", 2400);       // نمو ⇒ يمرّ
  out.branch = invShrinkCheck("branch", 400);    // الفرع له مرجعه المستقلّ ⇒ يوقف
  invMeta = null;
  out.noRef = invShrinkCheck("wh", 5);           // بلا مرجع سابق ⇒ يمرّ (لا بوّابة بلا مقارنة)
  return out;
});
check(gate.small === true, "① −5% يجب أن يمرّ بلا حوار");
check(gate.atEdge === true, `① الانكماش على الحدّ (${gate.pct}%) يجب أن يمرّ`);
check(gate.overEdge === false, `① تجاوز الحدّ (${gate.pct}%) يجب أن يوقف`);
check(gate.growth === true, "① نمو المخزن يجب أن يمرّ");
check(gate.branch === false, "① الفرع يُقارَن بمرجعه المستقلّ (branch_count)");
check(gate.noRef === true, "① بلا مرجع سابق ⇒ لا بوّابة");
check(gate.calls.length === 2, `① عدد الحوارات = 2 (المتجاوزان فقط) — جاء ${gate.calls.length}`);
for (const m of gate.calls) {
  check(/الرفعة السابقة/.test(m) && /الرفعة الجديدة/.test(m) && /النقص/.test(m), "① الحوار يذكر الأرقام الثلاثة (سابقة · جديدة · النقص)");
  check(/%/.test(m), "① الحوار يذكر النسبة");
  check(/غائب/.test(m) && /صفر/.test(m), "① الحوار يشرح العاقبة (غائب ⇒ صفر)");
}

// ---------- ① الإلغاء لا يعتمد الملف محلياً ----------
const abort = await page.evaluate(() => {
  window.confirm = () => false;
  invMeta = { id: 1, wh_count: 2000 };
  mergeWh = [{ code: "OLD1", name: "قديم", qty: 5, price: 100 }];
  dbOnline = false;                       // اعزل مسار القاعدة: نختبر الاعتماد المحلي
  const before = JSON.stringify(mergeWh);
  const fake = { files: [{ name: "partial.xlsx" }], value: "x" };
  window.readInvFileFull = async () => ({ list: Array.from({ length: 100 }, (_, i) => ({ code: "C" + i, name: "n", qty: 1, price: 10 })), header: [], headers: [], colMap: {} });
  return onMergeWh(fake).then(() => ({ before, after: JSON.stringify(mergeWh) }));
});
check(abort.before === abort.after, "① الإلغاء يترك mergeWh السابق كما هو (لا اعتماد لملف ناقص)");

// ---------- ② صمّام التنزيل ----------
const valve = await page.evaluate(() => {
  const mk = (z, nz) => { const a = [["sku", "name_ar", "name_en", "q"]]; for (let i = 0; i < z; i++) a.push(["S" + i, "n", "", 0]); for (let i = 0; i < nz; i++) a.push(["P" + i, "n", "", 5]); return a; };
  const msgs = [];
  window.confirm = m => { msgs.push(m); return false; };
  const out = { pct: ZERO_GATE_PCT, msgs };
  out.empty = zeroRatio([["sku"]], 2294);                   // ملف فارغ ⇒ 0%
  out.low = zeroRatio(mk(20, 300), 2294);                   // النطاق الطبيعي اليوم
  out.mid = zeroRatio(mk(623, 200), 2294);                  // المتوقَّع بعد الدفعة ٥
  out.high = zeroRatio(mk(1500, 50), 2294);                 // خلل
  out.denomIsZid = zeroRatio(mk(10, 0), 2294).pct;          // المقام = إجمالي زد لا حجم الملف (10/2294 لا 10/10)
  out.okLow = zeroGateOk(out.low);
  out.okMid = zeroGateOk(out.mid);
  out.okHigh = zeroGateOk(out.high);
  return out;
});
check(valve.empty.pct === 0, "② ملف فارغ ⇒ 0% بلا قسمة على صفر");
check(valve.denomIsZid < 1, `② المقام هو إجمالي منتجات زد لا حجم الملف (جاء ${valve.denomIsZid}%)`);
check(valve.okLow === true, `② النطاق الطبيعي (${valve.low.pct}%) يجب أن يمرّ`);
check(valve.okMid === true, `② المتوقَّع بعد الدفعة ٥ (${valve.mid.pct}%) يجب أن يمرّ — وإلا شلّ الصمّامُ التشغيلَ العادي`);
check(valve.okHigh === false, `② الخلل (${valve.high.pct}%) يجب أن يوقف`);
check(valve.msgs.length === 1, `② حوار واحد (المتجاوز فقط) — جاء ${valve.msgs.length}`);
if (valve.msgs[0]) {
  const m = valve.msgs[0];
  check(/1500/.test(m) && /2294/.test(m), "② الحوار يذكر العدد والإجمالي");
  check(new RegExp("الحدّ " + valve.pct).test(m), "② الحوار يذكر الحدّ نفسه");
  check(/ناقص|مفقود/.test(m), "② الحوار يشرح السبب المرجَّح");
}

// ---------- ② الصمّام مربوط بزرّ الكميات فعلاً ----------
const wired = await page.evaluate(() => {
  const src = [...document.querySelectorAll("script")].map(s => s.textContent).join("\n");
  const i = src.indexOf("const wireDl =");
  const seg = src.slice(i, i + 700);
  return { hasGate: seg.includes("zeroGateOk(lastZeroRatio)"), hasPrevent: seg.includes("preventDefault"), onlyQty: seg.includes('id === "dlQty" && !zeroGateOk') };
});
check(wired.hasGate && wired.hasPrevent, "② زرّ الكميات يستدعي الصمّام ويمنع التنزيل فعلاً (preventDefault)");
check(wired.onlyQty, "② الصمّام على ملف الكميات فقط (الأسعار لا يُصفِّر كميات)");

await browser.close();

if (BROKEN) {
  if (!fails.length) { console.error("✗ التحقّق الذاتي: بكسر نداء البوّابة لم يرسب شيء — الحارس بلا أسنان."); process.exit(1); }
  console.log(`✅ تحقّق ذاتي: بكسر نداء البوّابة رسب ${fails.length} فحصاً — للحارس أسنان.`);
  console.log("   " + fails[0]);
  process.exit(0);
}
if (fails.length) {
  console.error(`✗ ${fails.length} فشل:`);
  for (const f of fails) console.error("  ✗ " + f);
  process.exit(1);
}
console.log("✅ الصمّامان: ① بوّابة الرفع (عتبة · فرع مستقلّ · بلا مرجع · الإلغاء لا يعتمد) · ② صمّام التنزيل (مقام زد · عتبة · يمنع فعلاً).");
