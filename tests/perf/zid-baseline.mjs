// ============================================================================
// G-BASELINE (الحراج) — رفعة التأسيس لا ترفع أي مؤشّر مبيعات (القيمة، لا الشكل):
//   بالقيمة الحيّة: haraj_maf=1261 ＋ haraj_reh=3129 = 4390 حركة kind='new' (رفعة تأسيس). يجب أن يكون
//   إسهامها في كل مؤشّرات المبيعات = صفر (قيمة · وحدات · **منتجات متحرّكة**) — والإجماليّ = الفرعان العاملان فقط.
//   🚨 «متحرّكة» (movedNow) لا تُصفّى بالنوع، فبلا استبعاد التأسيس تنتفخ بـ4390 — هذا ما يمسكه الحارس.
// --broken: يُلغي استبعاد رفعات التأسيس (movs = rawMovs) ⇒ 4390 حركة new تنفخ «متحرّكة» ⇒ يرسب.
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
  const A = 'const baselineIds = new Set([...kindsByUp].filter(([, ks]) => ks.size > 0 && [...ks].every(k => k === "new")).map(([id]) => id));';
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد كشف التأسيس"); process.exit(2); }
  html = html.replace(A, "const baselineIds = new Set();");   // يُلغي كشف التأسيس (البوّابتان: movs ＋ uploadedInPeriod)
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
  const movs = [sale("az", "A", 50, 5000), sale("kh", "K", 40, 4000)];
  // 4390 حركة تأسيس (new) على فرعَي الحراج — بالقيمة الحيّة
  for (let i = 0; i < 1261; i++) movs.push({ kind: "new", delta: 3, location: "haraj_maf", sku: "MAF" + i, sku_name: "م" + i, upload_id: "U_haraj_maf", captured_at: now, period_days: 5 });
  for (let i = 0; i < 3129; i++) movs.push({ kind: "new", delta: 3, location: "haraj_reh", sku: "REH" + i, sku_name: "ر" + i, upload_id: "U_haraj_reh", captured_at: now, period_days: 5 });
  const stock = [["az", "A"], ["kh", "K"], ["haraj_maf", "MAF0"], ["haraj_reh", "REH0"]].map(([l, s]) => ({ location: l, sku: s, name: s, qty: 10, price_incl: 100, price_excl: 87 }));
  const ups = ["az", "kh", "haraj_maf", "haraj_reh"].map(l => ({ id: "U_" + l, location: l, captured_at: now, suspect: false }));
  db.sales = { uploads: async () => ups, movements: async (loc) => loc === "all" ? movs : movs.filter(m => m.location === loc), clearSuspect: async () => {} };
  sb = { from: () => ({ select: () => ({ range: async (a) => ({ data: (a === 0 ? stock : []), error: null }) }) }) };
  try { goPage("home"); } catch (e) {}
  const rr = document.getElementById("result"); if (rr) rr.style.display = "block";
  document.getElementById("page-sales").classList.add("active");
  await renderSalesPage();
  const num = (k) => { const el = document.querySelector(`#salesKpis .kpi[data-k="${k}"] b`); return el ? (el.textContent || "").replace(/[^\d]/g, "") : ""; };
  return { sval: num("sval"), sunits: num("sunits"), smoved: num("smoved") };
});
await b.close();
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
// المتوقّع (تأسيس مستبعَد): المبيعات=9000 · القطع=90 · المتحرّكة=2 (A,K فقط) — لا +4390
if (BROKEN) {
  if (res.smoved !== "2") { console.log(`✅ (--broken) G-BASELINE مسك العطل: «متحرّكة» انتفخت بحركات التأسيس (=${res.smoved} بدل 2)`); process.exit(0); }
  console.error("✗ (--broken) لم تنتفخ «متحرّكة» — لا أسنان (=" + res.smoved + ")."); process.exit(1);
}
if (res.sval !== "9000") fails.push(`المبيعات ليست 9,000 (az+kh فقط): «${res.sval}»`);
if (res.sunits !== "90") fails.push(`القطع ليست 90 (50+40): «${res.sunits}»`);
if (res.smoved !== "2") fails.push(`«متحرّكة» ليست 2 — رفعتها حركات التأسيس (4390): «${res.smoved}»`);
if (fails.length) { console.error("✗ G-BASELINE:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-BASELINE (الحراج): 4390 حركة تأسيس (new) لم ترفع أي مؤشّر — المبيعات 9,000 · القطع 90 · المتحرّكة 2 (az+kh فقط).");
