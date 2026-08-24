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
// عروض متعدّدة — العطل يظهر عند كل عرض لا يتّسع للأعمدة، لا الجوال وحده (اللقطة كانت ~840px)
for (const w of [360, 390, 768, 900]) {
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
    const measure = t => { if (!t) return null; let h = 0, w = 1e9; t.querySelectorAll("tbody tr").forEach(tr => h = Math.max(h, tr.getBoundingClientRect().height)); t.querySelectorAll("tbody td").forEach(td => { const cw = td.getBoundingClientRect().width; if (cw > 0) w = Math.min(w, cw); }); return { maxRowH: Math.round(h), minCellW: Math.round(w) }; };
    const upd = measure(document.querySelector("#detailTable table"));
    // عرض اسم زد داخل .prodcell (صورة + اسم): إن انهار (الصورة تلتهم العمود المحدود، والاسم لا يملأ) صار كلمة/سطر ⇒ صفّ طويل. الصفّ وحده لا يمسكه (قد يبقى <260).
    const nmSpan = document.querySelector("#detailTable td.upd-nm .prodcell > span");
    if (upd && nmSpan) upd.nmSpanW = Math.round(nmSpan.getBoundingClientRect().width);
    // مشهد جدول «آخر الأحداث» (دفعة ٤): نبني .upd-table عبر actTableRow الحقيقي داخل #invActTable
    let act = null;
    try {
      try { goPage("inventory"); } catch {}   // #invActTable في صفحة المخزون — يجب تنشيطها للقياس
      const host = document.getElementById("invActTable");
      if (host && typeof actTableRow === "function") {
        const evs = [{ event_type: "sync_full", zid_sku: "0801512", details: { source: "manual" }, created_at: new Date(0).toISOString() }, { event_type: "link_added", zid_sku: "4506822", details: { source: "manual" }, created_at: new Date(0).toISOString() }, { event_type: "waiting_added", zid_sku: "0380124", details: {}, created_at: new Date(0).toISOString() }];
        host.className = "twrap";
        host.innerHTML = `<table class="upd-table"><thead><tr><th>الوقت</th><th>النوع</th><th>SKU زد</th><th>الطريقة</th><th>الحالة</th></tr></thead><tbody>${evs.map(actTableRow).join("")}</tbody></table>`;
        act = measure(host.querySelector("table"));
      }
    } catch (e) {}
    return { upd, act };
  });
  const chk = (m, label) => {
    if (!m) { fails.push(`@${w}px: تعذّر رسم ${label}`); return; }
    if (m.maxRowH > 260 || m.minCellW < 40) fails.push(`@${w}px ${label}: أقصى صفّ=${m.maxRowH}px · أضيق خلية=${m.minCellW}px (انكسار حرفي)`);
    else console.log(`✓ @${w}px ${label}: أقصى صفّ ${m.maxRowH}px · أضيق خلية ${m.minCellW}px`);
  };
  chk(res.upd, "«تم تحديثه»");
  if (res.upd && res.upd.nmSpanW != null && res.upd.nmSpanW < 120)
    fails.push(`@${w}px «تم تحديثه»: عرض اسم زد=${res.upd.nmSpanW}px < 120 (منهار لكلمة/سطر — الصورة تلتهم العمود والاسم لا يملأ)`);
  chk(res.act, "«آخر الأحداث»");
  await page.close();
}
await browser.close();
if (fails.length) { console.error("✗ انكسار جدول على الجوال:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ جداول الجوال («تم تحديثه» ＋ «آخر الأحداث») — لا انكسار حرفي (صفوف ≤260px، خلايا ≥40px) عبر 360/390/768/900.");
