// ============================================================================
// حارس جداول الجوال — يمنع انكسار خلايا الجدول حرفاً حرفاً على الشاشات الضيّقة.
// العطل: table-layout:fixed + width:100% يضغط الأعمدة إلى ~عرض حرف فيلتفّ الاسم
// عمودياً ويرتفع الصفّ مئات البكسلات. حارس التجاوز الأفقي لا يمسكه (الكسر رأسي).
// يرسب إن: خلية عرضها < 40px  أو  صفّ بيانات ارتفاعه > 120px (دليل الالتفاف الحرفي).
//
// يغطّي «تم تحديثه» (updatedTableHTML) @360/390. HTML_PATH لإثبات الرسوب قبل الإصلاح.
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const html = readFileSync(process.env.HTML_PATH || join(root, "index.html"), "utf8");
function findChrome() { const c = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", process.env.CHROME_PATH || "", "/usr/bin/google-chrome-stable", "/usr/bin/google-chrome"]; for (const x of c) if (x && existsSync(x)) return x; for (const n of ["google-chrome-stable", "google-chrome", "chromium"]) try { return execFileSync("bash", ["-lc", "command -v " + n]).toString().trim(); } catch {} return ""; }
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const fails = [];
for (const w of [360, 390]) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: 900, deviceScaleFactor: 1 });
  await page.setRequestInterception(true);
  page.on("request", req => { const u = req.url(); if (u.startsWith("data:") || u.startsWith("about:")) return req.continue(); if (/^https?:/.test(u)) return req.abort(); req.continue(); });
  await page.setContent(html, { waitUntil: "load" });
  await new Promise(r => setTimeout(r, 250));
  const res = await page.evaluate(() => {
    const ov = document.getElementById("loginOverlay"); if (ov) ov.style.display = "none";
    try { goPage("home"); } catch {}
    const list = [];
    for (let i = 0; i < 4; i++) list.push({ sku: "80" + i, skuN: "80" + i, name: "طاولة قهوة خشب زان مبطّن فاخر بمسند " + i, whName: "طاولة زان فاخرة " + i, whCode: "80" + i, whBarcode: "", whPrice: 480, whBase: 480, offset: 0, oldQty: 5, newQty: 12, whQtyReal: 12, dist: null, oldPrice: 500, newPrice: 480, img: null, excluded: false, republish: false, reappeared: false });
    lastUpdated = list; currentFilter = "updated";
    document.getElementById("result").style.display = "block";
    renderDetail();
    const t = document.querySelector("#detailTable table");
    if (!t) return { noTable: true };
    let maxRowH = 0, minCellW = 1e9;
    t.querySelectorAll("tbody tr").forEach(tr => { maxRowH = Math.max(maxRowH, tr.getBoundingClientRect().height); });
    t.querySelectorAll("tbody td").forEach(td => { const cw = td.getBoundingClientRect().width; if (cw > 0) minCellW = Math.min(minCellW, cw); });
    return { maxRowH: Math.round(maxRowH), minCellW: Math.round(minCellW) };
  });
  if (res.noTable) { fails.push(`@${w}px: تعذّر رسم جدول «تم تحديثه»`); }
  else {
    const bad = res.maxRowH > 120 || res.minCellW < 40;
    if (bad) fails.push(`@${w}px: أقصى ارتفاع صفّ=${res.maxRowH}px · أضيق خلية=${res.minCellW}px (انكسار حرفي)`);
    else console.log(`✓ @${w}px «تم تحديثه»: أقصى صفّ ${res.maxRowH}px · أضيق خلية ${res.minCellW}px`);
  }
  await page.close();
}
await browser.close();
if (fails.length) { console.error("✗ انكسار جدول على الجوال:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ جداول الجوال — لا انكسار حرفي (صفوف ≤120px، خلايا ≥40px) @360/390.");
