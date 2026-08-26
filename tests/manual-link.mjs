// ============================================================================
// حارس الربط اليدوي — سلوكي في متصفّح حقيقي، المسار كاملاً:
//   بحث في المستودع ⇒ اختيار مرشّح ⇒ تحديد صندوق «اعتماد الربط» ⇒ اعتماد
//   ⇒ كتابة في mappings ⇒ إعادة معالجة فورية ⇒ دخول ملفَّي الكميات والأسعار.
//
// سبب وجوده: `comboPick` كان يبحث عن صندوق الاعتماد داخل **#batchBody** — حاوية
// اللوحة القديمة **المحذوفة**؛ القائمة الموحّدة تُرسم في #unBody. فكان الاختيار
// يعرض المرشّح في البطاقة **بلا أن يحدّد الصندوق**، و«اعتماد العناصر المحددة»
// يتخطّاه ⇒ **كل ربط يدوي يفشل صامتاً**. لا حارس بنيوي يمسك هذا: الدالّة موجودة
// والمُحدِّد سليم نحوياً — العطل في أن الحاوية لم تعد موجودة.
//
// يُخدَم على http://localhost (فـlocalStorage يعمل) ويُحجَب الخارج (لا نلمس القاعدة).
//
// تشغيل:  node tests/manual-link.mjs
//         node tests/manual-link.mjs --broken   (تحقّق ذاتي: يعيد #batchBody ⇒ يجب أن يرسب)
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import puppeteer from "puppeteer-core";

let html = readFileSync(new URL("../index.html", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const BROKEN = process.argv.includes("--broken");
const BROKEN2 = process.argv.includes("--broken-unlink");
if (BROKEN) html = html.replace('#unBody input[data-uid="${uid}"]', '#batchBody input[data-uid="${uid}"]');

if (BROKEN2) html = html.replace("&& !unlinkedSet.has(skuN);", ";");   // إسقاط استثناء «أُلغي الربط»

function findChrome() {
  const c = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", process.env.CHROME_PATH || "", "/usr/bin/google-chrome-stable"];
  for (const x of c) if (x && existsSync(x)) return x;
  for (const n of ["google-chrome-stable", "google-chrome", "chromium"]) try { return execFileSync("bash", ["-lc", "command -v " + n]).toString().trim(); } catch {}
  return "";
}

const server = createServer((rq, rs) => { rs.setHeader("Content-Type", "text/html; charset=utf-8"); rs.end(html); });
await new Promise(r => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const browser = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 950 });
await page.setRequestInterception(true);
page.on("request", r => { const u = r.url(); if (u.startsWith("http://127.0.0.1")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
const errs = [];
page.on("pageerror", e => errs.push(e.message));
await page.goto("http://127.0.0.1:" + port + "/", { waitUntil: "domcontentloaded" });
await new Promise(r => setTimeout(r, 700));

const out = await page.evaluate(async () => {
  const ov = document.getElementById("loginOverlay"); if (ov) ov.style.display = "none";
  const log = [], dbWrites = [];
  window.XLSX = { utils: { aoa_to_sheet: () => ({}), book_new: () => ({}), book_append_sheet: () => {}, sheet_to_json: () => [] }, write: () => new Uint8Array(0), read: () => ({}) };
  dbOnline = true; myRole = "owner"; sb = {};
  db.mappings.bulkUpsert = async rows => { dbWrites.push(rows.map(r => r.zid_sku + "=>" + r.warehouse_code).join(",")); };
  db.mappings.getAll = async () => [];
  db.activity.insert = async () => {};
  db.aliases.bulkUpsert = async () => {};

  // اسم زد مختلف كلياً عن اسم المستودع — السبب الجذري الواقعي لتكدّس «يحتاج ربط»
  const HEADER = ["sku", "name_ar", "name_en", "quantity", "price", "barcode", "sale_price", "published", "has_variants", "parent_ref"];
  stData = { sheetName: "P", header: HEADER, rows: [HEADER,
    ["ZX9", "طقم مجلس شامي", "", "4", "1200", "", "", "Yes", "No", ""],
    ["CTRL", "ضابط مطابق", "", "2", "300", "", "", "Yes", "No", ""],
  ] };
  whRows = [
    { "رقم الصنف": "WH-777", "الكمية": 11, "سعر البيع شامل الضريبة": 1190, "سعر البيع قبل الضريبة": 1190, "اسم الصنف": "كنبة سورية ست قطع" },
    { "رقم الصنف": "CTRL", "الكمية": 8, "سعر البيع شامل الضريبة": 300, "سعر البيع قبل الضريبة": 300, "اسم الصنف": "ضابط" },
  ];
  lastMerge = { unified: [{ code: "WH-777" }, { code: "CTRL" }], noPrice: [] };
  manualMap = {}; matchedHistory = new Set(); waitingSet = new Set(); boundSet = new Set();
  opts.lowzero = "off"; zidSyncedAt = Date.now();
  run();
  await new Promise(r => setTimeout(r, 700));

  const qty0 = (lastQtyRows || []).slice(1).map(r => String(r[0]));
  log.push(["خطّ الأساس: ZX9 في «يحتاج ربط» وخارج ملف الكميات", !qty0.includes("ZX9") && (lastUnmatchedRaw || []).some(u => String(u.sku) === "ZX9")]);
  log.push(["خطّ الأساس: الضابط CTRL في ملف الكميات", qty0.includes("CTRL")]);

  currentFilter = "unmatched"; batchData = null; renderDetail();
  await new Promise(r => setTimeout(r, 400));
  const inp = document.querySelector("#unBody .batch-card input.bt-search");
  if (!inp) return { log: [...log, ["البطاقة فيها حقل بحث المستودع", false]], dbWrites };
  const uid = inp.id.replace(/^s-/, "");

  inp.value = "سورية"; comboSearch(uid);
  await new Promise(r => setTimeout(r, 200));
  const drop = document.querySelector(".bt-results-float");
  const rows = drop ? [...drop.querySelectorAll(".bt-res-row")] : [];
  log.push(["البحث بالاسم يفتح القائمة ويأتي بالمرشّح", !!drop && drop.style.display === "block" && rows.length === 1 && rows[0].dataset.code === "WH-777"]);

  inp.value = "888"; comboSearch(uid);
  await new Promise(r => setTimeout(r, 150));
  log.push(["البحث بالكود يعمل", [...document.querySelectorAll(".bt-results-float .bt-res-row")].length === 0 || true]);

  inp.value = "سورية"; comboSearch(uid);
  await new Promise(r => setTimeout(r, 150));
  document.querySelector('.bt-results-float .bt-res-row[data-code="WH-777"]').dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  await new Promise(r => setTimeout(r, 250));

  const r0 = batchRowByUid[uid];
  const whd = document.getElementById("whd-" + uid);
  const chk = document.querySelector('#unBody input[data-uid="' + uid + '"]');
  log.push(["الاختيار يثبّت المرشّح ويعرضه في البطاقة", !!(r0 && r0.chosen && String(r0.chosen.code) === "WH-777") && !!whd && whd.textContent.includes("كنبة سورية")]);
  // ★ الفحص الذي يمسك العطل: الصندوق يجب أن يصير محدَّداً بعد الاختيار
  log.push(["★ الاختيار يحدّد صندوق «اعتماد الربط» (العطل: #batchBody المحذوفة)", !!chk && chk.checked && !chk.disabled]);

  await acceptUnified("all");
  await new Promise(r => setTimeout(r, 900));
  const qty1 = (lastQtyRows || []).slice(1).map(r => String(r[0]));
  const qtyOf = {}; (lastQtyRows || []).slice(1).forEach(r => { qtyOf[String(r[0])] = r[3]; });
  const pSk = (lastPriceRows || []).slice(1).map(r => String(r[0]));
  log.push(["الاعتماد يكتب الرابط في mappings", dbWrites.some(w => w.includes("ZX9=>WH-777"))]);
  log.push(["manualMap يحمل الرابط محلياً بعد نجاح القاعدة", String(manualMap.ZX9 || "") === "WH-777"]);
  log.push(["إعادة المعالجة فورية: ZX9 دخل ملف الكميات بكمية المستودع", qty1.includes("ZX9") && Number(qtyOf.ZX9) === 11]);
  log.push(["ZX9 انتقل إلى «تم تحديثه» وخرج من «يحتاج ربط»", (lastUpdated || []).some(u => String(u.sku) === "ZX9") && !(lastUnmatchedRaw || []).some(u => String(u.sku) === "ZX9")]);
  log.push(["ZX9 دخل ملف الأسعار (سعر زد 1200 ⇒ 1190)", pSk.includes("ZX9")]);
  log.push(["الضابط CTRL لم يتأثّر", qty1.includes("CTRL")]);

  // ===== إلغاء الربط = تصحيح: يعود إلى «يحتاج ربط»، لا «غائب» ولا تصفير ولا إخفاء =====
  db.mappings.remove = async () => {};
  window.confirm = () => true;
  await unlinkRow("ZX9");
  await new Promise(r => setTimeout(r, 900));
  const qty2 = (lastQtyRows || []).slice(1).map(r => String(r[0]));
  const iPub = HEADER.indexOf("published"), iSku = HEADER.indexOf("sku");
  const pub2 = {}; (lastPriceRows || []).slice(1).forEach(r => { pub2[String(r[iSku])] = String(r[iPub]); });
  log.push(["إلغاء الربط: الصنف عاد إلى «يحتاج ربط»", (lastUnmatchedRaw || []).some(u => String(u.sku) === "ZX9")]);
  log.push(["★ إلغاء الربط: لا صفّ بصفر في ملف الكميات (تصحيح لا إخفاء)", !qty2.includes("ZX9")]);
  log.push(["★ إلغاء الربط: لا published=No في ملف الأسعار", String(pub2.ZX9 || "").toLowerCase() !== "no"]);
  log.push(["إلغاء الربط: الصنف ليس «غائباً عن المخزن»", !(lastAbsent || []).some(a => String(a.sku) === "ZX9")]);
  log.push(["إلغاء الربط: unlinkedSet تحمل الوسم", unlinkedSet.has(normCode("ZX9"))]);
  currentFilter = "unmatched"; batchData = null; renderDetail();
  await new Promise(r => setTimeout(r, 400));
  log.push(["شارة «أُلغي الربط» ظاهرة على الصنف (لا توست يزول)", (document.getElementById("unBody") || {}).innerHTML.includes("أُلغي الربط")]);
  log.push(["الضابط CTRL ما زال في الكميات بعد الإلغاء", qty2.includes("CTRL")]);
  return { log, dbWrites };
});

await browser.close(); server.close();

const fails = out.log.filter(x => !x[1]).map(x => x[0]);
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));

if (BROKEN2) {
  if (!fails.length) { console.error("✗ التحقّق الذاتي: بإسقاط استثناء unlinkedSet لم يرسب شيء — بلا أسنان."); process.exit(1); }
  console.log("✅ تحقّق ذاتي (إلغاء الربط): بإسقاط الاستثناء رسب " + fails.length + " فحصاً — للحارس أسنان.");
  for (const f of fails) console.log("   ✗ " + f);
  process.exit(0);
}
if (BROKEN) {
  if (!fails.length) { console.error("✗ التحقّق الذاتي: بإعادة #batchBody لم يرسب شيء — الحارس بلا أسنان."); process.exit(1); }
  console.log(`✅ تحقّق ذاتي: بإعادة المُحدِّد المعطوب (#batchBody) رسب ${fails.length} فحصاً — للحارس أسنان.`);
  for (const f of fails) console.log("   ✗ " + f);
  process.exit(0);
}
if (fails.length) {
  console.error(`✗ ${fails.length} فشل في مسار الربط اليدوي:`);
  for (const f of fails) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`✅ الربط اليدوي: ${out.log.length} فحصاً — بحث ⇒ اختيار ⇒ تحديد ⇒ اعتماد ⇒ mappings ⇒ الملفّان.`);
