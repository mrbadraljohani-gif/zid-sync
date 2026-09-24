// ============================================================================
// G-SALES-LOCS — مواقع شاشة المبيعات = ٤ فروع (زد ＋ الحراج) والمستودع خارجها (القيمة، لا الشكل):
//   branchLocs = [az, kh, haraj_maf, haraj_reh] (٤) · «wh» ليس فيها · المستودع في قسمه.
//   ＋ G-BASELINE للحراج: فرع حراج رفعته الوحيدة تأسيس (كلّها new) ⇒ مستبعَد من الإجماليّ («لا رفعة»)،
//     والإجماليّ = الفرعان العاملان فقط.
// --broken: salesAllLocs يُسقط SALES_EXTRA_LOCS ⇒ branchLocs=2 (بلا الحراج) ⇒ يرسب.
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
  const A = "function salesAllLocs() { return [...(invBranches || []).map(b => ({ id: b.id, name: b.name })), ...SALES_EXTRA_LOCS]; }";
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد salesAllLocs"); process.exit(2); }
  html = html.replace(A, "function salesAllLocs() { return [...(invBranches || []).map(b => ({ id: b.id, name: b.name }))]; }");   // يُسقط الحراج
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
const res = await p.evaluate(async () => {
  dbOnline = true; myRole = "owner"; authSession = { user: { email: "o@x.sa" } };
  invBranches = [{ id: "az", name: "العزيزية" }, { id: "kh", name: "الخضرة" }];
  salesPeriod = "all"; salesLoc = "all"; salesTab = "all";
  const now = new Date().toISOString();
  const sale = (loc, sku, q, v) => ({ kind: "estimated_sale", delta: -q, value_est: v, unit_price_incl: v / q, unit_price_excl: Math.round(v / q / 1.15), location: loc, sku, sku_name: sku, upload_id: "U_" + loc, captured_at: now, period_days: 5 });
  const isNew = (loc, sku) => ({ kind: "new", delta: 5, location: loc, sku, sku_name: sku, upload_id: "U_" + loc, captured_at: now, period_days: 5 });
  // az/kh مبيعات فعليّة · haraj_maf رفعته كلّها new (تأسيس) · wh سحب
  const movs = [sale("az", "A", 50, 5000), sale("kh", "K", 40, 4000), isNew("haraj_maf", "M1"), isNew("haraj_maf", "M2"), sale("wh", "W", 99, 9999)];
  const stock = [["az", "A"], ["kh", "K"], ["haraj_maf", "M1"], ["wh", "W"]].map(([l, s]) => ({ location: l, sku: s, name: s, qty: 10, price_incl: 100, price_excl: 87 }));
  const ups = ["az", "kh", "haraj_maf", "wh"].map(l => ({ id: "U_" + l, location: l, captured_at: now, suspect: false }));
  db.sales = { uploads: async () => ups, movements: async (loc) => loc === "all" ? movs : movs.filter(m => m.location === loc), clearSuspect: async () => {} };
  sb = { from: () => ({ select: () => ({ range: async (a) => ({ data: (a === 0 ? stock : []), error: null }) }) }) };
  try { goPage("home"); } catch (e) {}
  const rr = document.getElementById("result"); if (rr) rr.style.display = "block";
  document.getElementById("page-sales").classList.add("active");
  await renderSalesPage();
  const branchLocs = (salesCtx && salesCtx.branchLocs) || [];
  const cmpTxt = (document.getElementById("salesCmp").textContent || "");
  const totalRow = [...document.querySelectorAll("#salesCmp tbody tr.total")].map(t => t.textContent.replace(/\s+/g, " ")).join("");
  return { branchLocs, whInBranchLocs: branchLocs.includes("wh"), n: branchLocs.length, hasMaf: branchLocs.includes("haraj_maf"), hasReh: branchLocs.includes("haraj_reh"), total: totalRow };
});
await b.close();
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
if (BROKEN) {
  if (res.n !== 4 || !res.hasMaf) { console.log("✅ (--broken) G-SALES-LOCS مسك العطل: الحراج سقط من التعداد (n=" + res.n + ")"); process.exit(0); }
  console.error("✗ (--broken) لم يسقط الحراج — لا أسنان (n=" + res.n + ")."); process.exit(1);
}
if (res.n !== 4) fails.push(`مواقع المبيعات ليست ٤: ${res.n} (${res.branchLocs.join(",")})`);
if (!res.hasMaf || !res.hasReh) fails.push("الحراج (مفروشات/رحلات) غير مُدرَج في مواقع المبيعات");
if (res.whInBranchLocs) fails.push("🚨 المستودع (wh) داخل مواقع المبيعات (يجب استبعاده)");
// G-BASELINE للحراج: haraj_maf (تأسيس فقط) مستبعَد ⇒ الإجماليّ = 5,000+4,000 = 9,000 (بلا حراج/مستودع)
if (!/9,000/.test(res.total)) fails.push(`الإجماليّ ليس 9,000 (az+kh فقط، الحراج التأسيسيّ مستبعَد): «${res.total}»`);
if (fails.length) { console.error("✗ G-SALES-LOCS:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-SALES-LOCS: مواقع المبيعات ٤ فروع (زد ＋ الحراج) · المستودع خارجها · حراج التأسيس مستبعَد (الإجماليّ 9,000).");
