// ============================================================================
// G-SALES-QUERY-BADGES (دفعة د) — صفّ شارات المنسدلة (القيمة، لا الشكل):
//   ② المصدر salesCtx.stock (خمسة مواقع منها الحراج): صنف في فرع حراج ⇒ شارة الحراج تظهر
//      (إثبات أنّ المصدر ليس مسار زد الذي لا حراج فيه).
//   ③ صنف في موقع واحد ⇒ شارتان فقط (إجمالي ＋ ذلك الموقع).
//   ④ مجموع شارات المواقع = شارة الإجمالي (فحص بالقيمة).
//   ＋ السعر price_incl (🚫 لا 1.15) · تعذّره ⇒ «—» · المواقع الخالية لا تظهر في المنسدلة.
// --broken: يجعل شارة الإجمالي = مجموع + 1 ⇒ الإجمالي ≠ مجموع الشارات ⇒ يرسب.
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
  const A = 'const totalChip = `<span class="q-chip ${total > 0 ? "qty-in" : "qty-out"}">إجمالي: <bdi dir="ltr">${salesNum(total)}</bdi></span>`;';
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد شارة الإجمالي"); process.exit(2); }
  html = html.replace(A, 'const totalChip = `<span class="q-chip ${total > 0 ? "qty-in" : "qty-out"}">إجمالي: <bdi dir="ltr">${salesNum(total + 1)}</bdi></span>`;');   // إجمالي مغلوط
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
  invBranches = [{ id: "az", name: "العزيزية" }, { id: "kh", name: "الخضرة" }];
  salesPeriod = "all"; salesLoc = "all"; salesTab = "all";
  const now = new Date().toISOString();
  const stock = [
    // 50277: مستودع 21 ＋ خضرة 5 (لا عزيزية/حراج) ⇒ إجمالي 26 · سعر 240
    { location: "wh", sku: "50277", name: "بطانية سولارون", qty: 21, price_incl: 240, price_excl: 209, barcode: "b1" },
    { location: "kh", sku: "50277", name: "بطانية سولارون", qty: 5, price_incl: 240, price_excl: 209, barcode: "b1" },
    // صنف حراج فقط (إثبات المصدر sales_stock)
    { location: "haraj_maf", sku: "HRJ", name: "طاولة حراج", qty: 8, price_incl: 500, price_excl: 435, barcode: "b2" },
    // صنف موقع واحد
    { location: "az", sku: "SOLO", name: "كرسي منفرد", qty: 3, price_incl: 100, price_excl: 87, barcode: "b3" },
    // صنف بلا سعر
    { location: "kh", sku: "NOPX", name: "بلا سعر", qty: 4, price_incl: null, price_excl: null, barcode: "b4" },
  ];
  const movs = [{ kind: "estimated_sale", delta: -2, value_est: 480, unit_price_incl: 240, unit_price_excl: 209, location: "kh", sku: "50277", sku_name: "بطانية سولارون", upload_id: "U_kh", captured_at: now, period_days: 5 }];
  const ups = [{ id: "U_kh", location: "kh", captured_at: now, suspect: false }];
  db.sales = { uploads: async () => ups, movements: async () => movs, clearSuspect: async () => {} };
  sb = { rpc: async () => ({ data: [{ used: 0, cap: 500 }], error: null }), from: () => ({ select: () => ({ range: async (a) => ({ data: (a === 0 ? stock : []), error: null }) }) }) };
  try { goPage("home"); } catch (e) {}
  document.getElementById("page-sales").classList.add("active");
  await renderSalesPage();
  const badgesOf = (row) => [...row.querySelectorAll(".q-meta .q-chip")].map(c => (c.textContent || "").replace(/\s+/g, " ").trim());
  // بحث يطابق الأصناف الخمسة عبر كلمة مشتركة؟ لا — نبحث كلاً على حدة عبر كوده
  const run1 = (q) => { salesQueryRun(q); const box = document.getElementById("sqResults"); const opts = [...box.querySelectorAll('[role="option"]')]; return opts.map(o => ({ code: (o.querySelector(".q-code").textContent || "").trim(), badges: badgesOf(o) })); };
  return { b50277: run1("50277"), hrj: run1("HRJ"), solo: run1("SOLO"), nopx: run1("NOPX") };
});
await b.close();
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
const num = s => { const m = String(s).replace(/[^\d]/g, ""); return m ? +m : null; };
const isPriceOrCost = x => x.startsWith("شامل") || x.startsWith("تكلفة");   // شارتا السعر/التكلفة — لا تُعَدّان موقعاً
const parse = (badges) => {
  const total = num((badges.find(x => x.includes("إجمالي")) || "").replace("إجمالي", ""));
  const locs = badges.filter(x => !x.includes("إجمالي") && !isPriceOrCost(x) && x.includes(":")).map(x => num(x.split(":")[1]));
  const price = badges.find(x => x.startsWith("شامل"));   // شارة السعر صارت «شامل: …»
  return { total, locs, sum: locs.reduce((a, c) => a + (c || 0), 0), price };
};
// ④ مجموع المواقع = الإجمالي — على كل صنف
for (const [k, rows] of Object.entries({ b50277: res.b50277, hrj: res.hrj, solo: res.solo, nopx: res.nopx })) {
  const row = rows[0]; if (!row) { fails.push(`${k}: لا نتيجة`); continue; }
  const pr = parse(row.badges);
  if (BROKEN) continue;
  if (pr.total !== pr.sum) fails.push(`${k}: الإجمالي ${pr.total} ≠ مجموع المواقع ${pr.sum} (${row.badges.join(" | ")})`);
}
if (BROKEN) {
  const pr = parse((res.b50277[0] || { badges: [] }).badges);
  if (pr.total != null && pr.total !== pr.sum) { console.log(`✅ (--broken) G-SALES-QUERY-BADGES مسك الخلل: الإجمالي ${pr.total} ≠ مجموع ${pr.sum}.`); process.exit(0); }
  console.error("✗ (--broken) لم يُرصد اختلاف الإجمالي — لا أسنان."); process.exit(1);
}
// ② الحراج يظهر
const hrjBadges = (res.hrj[0] || { badges: [] }).badges.join(" | ");
if (!/الحراج مفروشات/.test(hrjBadges)) fails.push(`② شارة الحراج غائبة (المصدر ليس sales_stock؟): ${hrjBadges}`);
// ③ موقع واحد ⇒ شارتان (إجمالي ＋ موقع) ＋ السعر = ثلاث شارات، بلا شارة موقع ثانية
const soloBadges = (res.solo[0] || { badges: [] }).badges;
const soloLocChips = soloBadges.filter(x => x.includes(":") && !x.includes("إجمالي") && !isPriceOrCost(x)).length;
if (soloLocChips !== 1) fails.push(`③ صنف موقع واحد له ${soloLocChips} شارات موقع (المتوقّع 1): ${soloBadges.join(" | ")}`);
// السعر: 50277 ⇒ 240 · NOPX ⇒ «—»
const p50277 = parse((res.b50277[0] || { badges: [] }).badges).price || "";
if (!/240/.test(p50277)) fails.push(`السعر 50277 ليس 240: «${p50277}»`);
const pNopx = parse((res.nopx[0] || { badges: [] }).badges).price || "";
if (!/—/.test(pNopx)) fails.push(`صنف بلا سعر لا يعرض «—»: «${pNopx}»`);
if (fails.length) { console.error("✗ G-SALES-QUERY-BADGES:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-SALES-QUERY-BADGES: مجموع المواقع=الإجمالي · الحراج يظهر (المصدر sales_stock) · موقع واحد⇒شارة واحدة · السعر price_incl (240) · بلا سعر ⇒ «—».");
