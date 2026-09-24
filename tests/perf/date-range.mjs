// ============================================================================
// G-DATE-RANGE — تقويم اختيار المدى (القيمة، لا الشكل):
//   ① الأيام الذهبية = business_date للرفعات (من ups) لا captured_at/UTC. يوم بلا رفعة ⇒ بلا ذهبي.
//   ② المدى اليدويّ [start,end] يصل الحساب **شاملاً الطرفين**: 22←22 يوم واحد · 22←23 يومان (مجموع).
//   ③ الحدود: يوم بعد آخر business_date أو قبل أوّله ⇒ disabled (salesPickDay يتجاهله).
//   ④ الأزرار السريعة (أمس/7/30/منذ البداية) تعطي نفس النتيجة قبل/بعد (منذ البداية == كل الحركات).
//   ⑤ إضافة ٢: الفترة السابقة لمدى يدويّ = [start−len, start) بطول len بالضبط، لا تتداخل ولا تتجاوز.
//   ⑥ Riyadh: business_date = اليوم السابق للرفعة بتوقيت الرياض (لا UTC).
// --broken: salesAvailableDates تستعمل riyadhDay (يوم captured_at) بدل salesBizDate ⇒ الأيام الذهبية تنزاح يوماً ⇒ يرسب.
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BROKEN = process.argv.includes("--broken");
let html = readFileSync(process.env.HTML_PATH || join(root, "index.html"), "utf8").replace(/\r\n/g, "\n");
if (BROKEN) {
  const A = "for (const u of ups) { const d = salesBizDate(u.captured_at); if (d) s.add(d); }";
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد بناء الأيام المتاحة"); process.exit(2); }
  html = html.replace(A, "for (const u of ups) { const d = riyadhDay(u.captured_at); if (d) s.add(d); }");   // UTC/captured_at بدل business_date
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setViewport({ width: 1200, height: 900 });
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
const res = await p.evaluate(async () => {
  dbOnline = true; myRole = "owner"; authSession = { user: { email: "o@x.sa" } };
  invBranches = [{ id: "kh", name: "الخضرة" }]; salesLoc = "all"; salesTab = "all"; salesSearch = "";
  const iso = (ymd) => new Date(Date.parse(ymd + "T06:00:00+03:00")).toISOString();   // رفعة صباح اليوم التالي ⇒ business_date = اليوم السابق
  // business_date 21 (captured 22)=100 · 22 (captured 23)=200 · 23 (captured 24)=300
  const D = [["2026-09-22", 100], ["2026-09-23", 200], ["2026-09-24", 300]];
  const ups = D.map(([c], i) => ({ id: "U" + i, location: "kh", captured_at: iso(c), suspect: false }));
  const movs = D.map(([c, v], i) => ({ kind: "estimated_sale", delta: -1, value_est: v, unit_price_incl: v, unit_price_excl: Math.round(v / 1.15), location: "kh", sku: "K" + i, sku_name: "ك", upload_id: "U" + i, captured_at: iso(c), period_days: 1 }));
  const stock = [{ location: "kh", sku: "K0", name: "ك", qty: 10, price_incl: 100, price_excl: 87 }];
  db.sales = { uploads: async () => ups, movements: async () => movs, clearSuspect: async () => {} };
  sb = { rpc: async () => ({ data: [{ used: 0, cap: 500 }], error: null }), from: () => ({ select: () => ({ range: async (a) => ({ data: (a === 0 ? stock : []), error: null }) }) }) };
  try { goPage("home"); } catch (e) {}
  document.getElementById("page-sales").classList.add("active");
  const sval = async () => { await renderSalesPage(); const el = document.querySelector('#salesKpis .kpi[data-k="sval"] b'); return el ? +((el.textContent || "").replace(/[^\d]/g, "")) : null; };
  // ④ الأزرار السريعة (منذ البداية = كل الحركات)
  salesManualRange = null; salesPeriod = "all"; const allVal = await sval();
  // ② مدى يدويّ شامل الطرفين
  salesManualRange = { start: "2026-09-22", end: "2026-09-22" }; salesPeriod = null; const single = await sval();   // يوم واحد ⇒ 200
  salesManualRange = { start: "2026-09-22", end: "2026-09-23" }; const two = await sval();                          // يومان ⇒ 500
  salesManualRange = { start: "2026-09-21", end: "2026-09-23" }; const three = await sval();                        // ثلاثة ⇒ 600
  // ⑤ الفترة السابقة: مدى يدويّ 3 أيام ⇒ prev [18,21) طوله 3
  const r3 = salesRange();   // يقرأ salesManualRange الحاليّ (21←23)
  // ① الأيام الذهبية + ③ الحدود (افتح التقويم)
  salesManualRange = null; salesPeriod = "all"; await renderSalesPage();
  salesCalToggle(); const pop = document.getElementById("salesCalPop");
  const gold = [...pop.querySelectorAll(".cal-day.has")].map(d => d.textContent.trim());
  const disabled25 = !![...pop.querySelectorAll(".cal-day.disabled")].find(d => d.textContent.trim() === "25");
  const day22 = [...pop.querySelectorAll(".cal-day")].find(d => d.textContent.trim() === "22" && !d.classList.contains("empty"));
  const day22Gold = day22 ? day22.classList.contains("has") : false;
  const day20 = [...pop.querySelectorAll(".cal-day")].find(d => d.textContent.trim() === "20" && !d.classList.contains("empty"));
  const day20Disabled = day20 ? day20.classList.contains("disabled") : false;
  // ③ اختيار يوم معطّل لا يفعل شيئاً
  salesCalPickStart = null; salesPickDay("2026-09-25"); const pickedOutOfBounds = !!salesManualRange;
  return { allVal, single, two, three, prevSinceIso: r3.prevSinceIso, sinceIso: r3.sinceIso, untilIso: r3.untilIso, gold, disabled25, day22Gold, day20Disabled, pickedOutOfBounds };
});
await b.close();
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
// ⑤ prev: start=21, len=3 ⇒ prevSince=18 (بتوقيت الرياض)، والحاليّة تبدأ 21
const bizDay = (iso) => { const t = Date.parse(iso); return new Date(t + 3 * 3600000).toISOString().slice(0, 10); };
if (BROKEN) {
  if (res.gold.join(",") !== "21,22,23") { console.log(`✅ (--broken) G-DATE-RANGE مسك UTC/captured_at: الأيام الذهبية انزاحت إلى [${res.gold.join(",")}] بدل 21,22,23.`); process.exit(0); }
  console.error("✗ (--broken) لم تنزح الأيام — لا أسنان."); process.exit(1);
}
// ①
if (res.gold.join(",") !== "21,22,23") fails.push(`① الأيام الذهبية ليست 21,22,23 (business_date): [${res.gold.join(",")}]`);
if (!res.day22Gold) fails.push("① يوم 22 (له رفعة) ليس ذهبياً");
// ②
if (res.single !== 200) fails.push(`② يوم واحد 22←22 ليس 200: ${res.single}`);
if (res.two !== 500) fails.push(`② يومان 22←23 ليس 500 (شامل الطرفين): ${res.two}`);
if (res.three !== 600) fails.push(`② ثلاثة 21←23 ليس 600: ${res.three}`);
// ③
if (!res.disabled25) fails.push("③ يوم 25 (بعد آخر بيانات) ليس disabled");
if (!res.day20Disabled) fails.push("③ يوم 20 (قبل أوّل بيانات) ليس disabled");
if (res.pickedOutOfBounds) fails.push("③ اختيار يوم خارج الحدود (25) ثبَّت مدى — يجب تجاهله");
// ④
if (res.allVal !== 600) fails.push(`④ «منذ البداية» ليس 600 (كل الحركات): ${res.allVal}`);
// ⑤ الفترة السابقة بحدّين
const prevD = bizDay(res.prevSinceIso), startD = bizDay(res.sinceIso), endD = bizDay(res.untilIso);
if (!(startD === "2026-09-21" && endD === "2026-09-23")) fails.push(`⑤ طرفا المدى اليدويّ ليسا 21..23: ${startD}..${endD}`);
if (prevD !== "2026-09-18") fails.push(`⑤ الفترة السابقة لا تبدأ 18 (start−len=21−3): ${prevD}`);   // len=3، prev=[18,21)
if (fails.length) { console.error("✗ G-DATE-RANGE:\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`✅ G-DATE-RANGE: ذهبي=business_date(21,22,23) · مدى شامل الطرفين (200/500/600) · حدود disabled · منذ البداية=600 · السابقة [18,21) طول 3 · Riyadh لا UTC.`);
