// ============================================================================
// G-CMP-LAYOUT — جدول مقارنة المواقع ومحور الرسم (القيمة، لا الشكل):
//   ① لا تلاصق: صناديق الخلايا المتجاورة في كل صفّ لا تتقاطع أفقياً (فجوة ≥ 2px) عند عرض واقعيّ ضيّق.
//   ② الوحدة ملتصقة برقمها («ر.س»/«يوم») بخطّ عربيّ (لا mono) — نصّ الخليّة يحمل قيمتها ووحدتها فقط.
//   ③ لا بتر محور: كل تسمية محور (y ＋ تاريخ) داخل حدود viewBox [0..W] (getBBox).
// --broken: يزيل direction:ltr عن .s4-ml-ax ⇒ آخر تاريخ عربيّ يمتدّ يميناً خارج viewBox ⇒ يرسب.
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
  const A = "font-family: var(--mono); direction: ltr; }   /* direction:ltr";
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد direction:ltr في .s4-ml-ax"); process.exit(2); }
  html = html.replace(A, "font-family: var(--mono); }   /* (--broken) بلا direction:ltr");
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setViewport({ width: 760, height: 1000, isMobile: true });   // عرض واقعيّ ضيّق (الجدول ~65% منه)
await p.setContent(html, { waitUntil: "load" });
const res = await p.evaluate(async () => {
  dbOnline = true; myRole = "owner"; authSession = { user: { email: "o@x.sa" } };
  invBranches = [{ id: "az", name: "العزيزية" }, { id: "kh", name: "الخضرة" }]; salesPeriod = "all"; salesLoc = "all"; salesTab = "all"; salesSearch = "";
  const day = 86400000, now = Date.now(), iso = t => new Date(t).toISOString();
  const sale = (loc, sku, q, px, up, cap) => ({ kind: "estimated_sale", delta: -q, value_est: q * px, unit_price_incl: px, unit_price_excl: Math.round(px / 1.15), location: loc, sku, sku_name: sku, upload_id: up, captured_at: cap, period_days: 20 });
  const movs = []; for (let i = 0; i < 3; i++) { const d = iso(now - (i + 1) * day * 7); movs.push(sale("wh", "W" + i, 5, 1900, "w" + i, d)); movs.push(sale("az", "A" + i, 8, 300, "a" + i, d)); movs.push(sale("kh", "K" + i, 6, 250, "k" + i, d)); }
  // مخزون بالملايين ⇒ أرقام عريضة (اختبار التلاصق الحقيقيّ)
  const stock = [{ location: "wh", sku: "W0", name: "x", qty: 9000, price_incl: 632, price_excl: 550, barcode: "1" }, { location: "az", sku: "A0", name: "y", qty: 5000, price_incl: 275, price_excl: 239, barcode: "2" }, { location: "kh", sku: "K0", name: "z", qty: 8000, price_incl: 210, price_excl: 183, barcode: "3" }];
  db.sales = { uploads: async () => [...new Set(movs.map(m => m.upload_id))].map(id => { const m = movs.find(x => x.upload_id === id); return { id, location: m.location, captured_at: m.captured_at, suspect: false }; }), movements: async () => movs, clearSuspect: async () => {} };
  sb = { from: () => ({ select: () => ({ range: async (a) => ({ data: (a === 0 ? stock : []), error: null }) }) }) };
  ["page-home", "page-inventory", "page-db", "page-options", "page-account", "page-newuser"].forEach(id => { const e = document.getElementById(id); if (e) e.classList.remove("active"); });
  const ps = document.getElementById("page-sales"); ps.classList.add("active"); ps.style.display = "block";
  await renderSalesPage();
  // ① تلاصق **محتوى** الخلايا (Range على النصّ الفعليّ لا صندوق الخليّة — الحشو داخليّ فالصناديق متلاصقة دائماً)
  let minGap = 1e9;
  for (const tr of document.querySelectorAll("#salesCmp tbody tr")) {
    const boxes = [...tr.querySelectorAll("td")].map(td => { const rg = document.createRange(); rg.selectNodeContents(td); const r = rg.getBoundingClientRect(); return { l: r.left, r: r.right, w: r.width }; }).filter(x => x.w > 0).sort((a, b) => a.l - b.l);
    for (let i = 0; i + 1 < boxes.length; i++) minGap = Math.min(minGap, boxes[i + 1].l - boxes[i].r);
  }
  // ② الوحدات موجودة بخطّ عربيّ (لا mono) ＋ نصّ الخليّة = قيمة+وحدة فقط
  const cu = document.querySelector("#salesCmp .cmp-u");
  const cuFont = cu ? getComputedStyle(cu).fontFamily : "";
  const invCell = [...document.querySelectorAll("#salesCmp tbody tr td.n")].find(td => /ر\.س/.test(td.textContent));
  const invTxt = invCell ? invCell.textContent.replace(/\s+/g, " ").trim() : "";
  // ③ بتر المحور: صناديق نصوص المحور داخل [0..W=560]
  const svg = document.querySelector("#salesChart svg");
  const clipped = [...svg.querySelectorAll("text")].map(t => { const bb = t.getBBox(); return { s: t.textContent, x: bb.x, r: bb.x + bb.width }; }).filter(o => o.x < -0.5 || o.r > 560.5);
  return { minGap, cuFont, invTxt, clipped };
});
await b.close();
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
if (!BROKEN) {
  if (!(res.minGap >= 2)) fails.push(`تلاصق خلايا: أصغر فجوة ${Math.round(res.minGap)}px (<2) — رقمان متلاصقان`);
  if (!/sans|IBM|Plex|Tahoma|Segoe/i.test(res.cuFont)) fails.push(`وحدة «ر.س/يوم» ليست بخطّ عربيّ (sans): «${res.cuFont}»`);
  if (!/^[\d,]+\s*ر\.س$/.test(res.invTxt)) fails.push(`نصّ خليّة القيمة ليس «رقم ر.س» وحده: «${res.invTxt}»`);
  if (res.clipped.length) fails.push(`بتر محور: ${JSON.stringify(res.clipped.map(o => o.s))} خارج viewBox`);
}
if (BROKEN) {
  if (fails.length || res.clipped.length) { console.log("✅ (--broken) G-CMP-LAYOUT مسك العطل: " + (res.clipped.length ? "بتر محور " + JSON.stringify(res.clipped.map(o => o.s)) : fails[0])); process.exit(0); }
  console.error("✗ (--broken) لم يظهر بتر بعد إزالة direction:ltr — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ G-CMP-LAYOUT:\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`✅ G-CMP-LAYOUT: لا تلاصق (فجوة≥${Math.round(res.minGap)}px) · الوحدة عربيّة ملتصقة («${res.invTxt}») · لا بتر محور.`);
