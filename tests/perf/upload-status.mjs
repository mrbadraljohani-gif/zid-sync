// ============================================================================
// G-UPLOAD-STATUS — شارة حالة الرفع في الرئيسية (القيمة، لا الشكل):
//   معيار 24 ساعة متدحرجة: موقع آخر رفعة له منذ 23 ساعة ⇒ 🟢 · منذ 25 ساعة ⇒ 🔴 مع الرسالة.
//   owner/admin يريان الشريط · marketing لا يراه إطلاقاً.
// --broken: يقلب المعيار (> ⇒ <=) ⇒ المتأخّر (25 ساعة) يظهر أخضر بلا رسالة ⇒ يرسب.
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
  const A = "const isStale = l => l.ms == null || (now - l.ms) > UPLOAD_FRESH_MS;";
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد مُسند الحداثة"); process.exit(2); }
  html = html.replace(A, "const isStale = l => l.ms != null && (now - l.ms) <= UPLOAD_FRESH_MS;");   // مُسند مقلوب
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
const scenario = async (role) => p.evaluate(async (role) => {
  const now = Date.now(), h = 3600000;
  myRole = role;
  invMeta = { wh_synced_at: new Date(now - 23 * h).toISOString(), wh_count: 100 };   // 23 ساعة ⇒ 🟢
  invBranches = [{ id: "az", name: "العزيزية", synced_at: new Date(now - 25 * h).toISOString() }];   // 25 ساعة ⇒ 🔴
  renderUploadStatus();
  const el = document.getElementById("uploadStatusBar");
  const txt = (el.textContent || "").replace(/\s+/g, " ").trim();
  const shown = el.style.display !== "none";
  const cls = el.className;
  const dots = [...el.querySelectorAll(".us-dot")].map(d => d.getAttribute("style") || "");
  const staleNames = [...el.querySelectorAll(".us-item.stale b")].map(x => (x.textContent || "").trim());
  return { shown, txt, cls, dots, staleNames };
}, role);
const owner = await scenario("owner");
const admin = await scenario("admin");
const marketing = await scenario("marketing");
await b.close();
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
if (!BROKEN) {
  if (!owner.shown) fails.push("owner لا يرى الشريط");
  if (!admin.shown) fails.push("admin لا يرى الشريط");
  if (marketing.shown) fails.push("marketing يرى الشريط — يجب حجبه");
  if (!/bad/.test(owner.cls)) fails.push(`الشريط ليس بحالة تأخّر رغم موقع 25 ساعة: «${owner.cls}»`);
  if (!/العزيزية/.test(owner.txt) || !/آخر رفعة/.test(owner.txt) || !/حتى يُرفع/.test(owner.txt)) fails.push(`رسالة المتأخّر ناقصة (اسم/منذ/ما العمل): «${owner.txt}»`);
  // المتأخّر = العزيزية (25س) فقط — لا المستودع (23س)
  if (owner.staleNames.join("|") !== "العزيزية") fails.push(`المتأخّر يجب أن يكون «العزيزية» وحده، وجدت: ${JSON.stringify(owner.staleNames)}`);
  const green = owner.dots.filter(d => /--green/.test(d)).length, red = owner.dots.filter(d => /--danger/.test(d)).length;
  if (green !== 1 || red !== 1) fails.push(`الألوان: توقّعت أخضر=1 (المستودع) أحمر=1 (العزيزية)، وجدت أخضر=${green} أحمر=${red}`);
}
if (BROKEN) {
  // معيار مقلوب: المستودع (23س، طازج) يُعدّ متأخّراً والعزيزية (25س) طازجة — القيمة معكوسة
  if (owner.staleNames.join("|") === "المستودع") { console.log("✅ (--broken) G-UPLOAD-STATUS مسك العطل: المعيار المقلوب وسم المستودع (23س) متأخّراً بدل العزيزية (25س)"); process.exit(0); }
  console.error("✗ (--broken) لم ينعكس المتأخّر — لا أسنان (stale=" + JSON.stringify(owner.staleNames) + ")."); process.exit(1);
}
if (fails.length) { console.error("✗ G-UPLOAD-STATUS:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-UPLOAD-STATUS: 23س🟢 · 25س🔴 مع الرسالة · owner/admin يريان · marketing محجوب.");
