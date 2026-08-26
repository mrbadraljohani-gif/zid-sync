// ============================================================================
// المشغّل السلوكي لـrun() — يشغّل الكود الحقيقي في متصفّح فعلي (puppeteer-core)
// على بيانات وهمية، ويثبت **سلوكاً** لا بنية:
//   ج-١ : الملفّان (lastQtyRows+lastPriceRows) متطابقان قبل/بعد حذف فرع isInf.
//   ٤   : إجراء عبر applyDecision ⇒ الملفّان يعكسانه فوراً (run(true) داخله).
//   ٥   : إجماع الأب — ابن حيّ يحميه · كل الأبناء 0 يُخفيه.
//   —   : صمام تعارض التخفيض — sale ≥ price ⇒ مُستبعَد من الأسعار + في lastSaleConflicts.
//   ٣+١ : العائد — مربوط يستأنف بوسم reappeared · غير مربوط ⇒ «يحتاج قرار» · متجاهَل يبقى.
// المنهجية (CLAUDE.md): كل ادّعاء إصلاحه في الجلسة يُشغَّل على **النسخة قبل الإصلاح**
//   ويُتأكَّد أنه يرسب هناك (ج-١ before/after · ج-٣ على 917989d). وإلا فلا أسنان له.
//
// يخدم الصفحة عبر http://localhost (فـlocalStorage/saveMatchedHistory تعمل) ويحجب
// الشبكة الخارجية (CDN/Supabase) فلا نلمس القاعدة الحيّة، وSupabase يبقى وهمياً.
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const curHtml = readFileSync(join(root, "index.html"), "utf8").replace(/\r\n/g, "\n");
const showAt = ref => execFileSync("git", ["show", ref + ":index.html"], { cwd: root, maxBuffer: 64 * 1024 * 1024 }).toString().replace(/\r\n/g, "\n");

function findChrome() {
  const c = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome-stable", "/usr/bin/google-chrome", process.env.CHROME_PATH || ""];
  for (const x of c) if (x && existsSync(x)) return x;
  for (const n of ["google-chrome-stable", "google-chrome", "chromium"]) try { return execFileSync("bash", ["-lc", "command -v " + n]).toString().trim(); } catch {}
  return "";
}

// ---- fixtures ----
const HEADER = ["sku", "name_ar", "name_en", "quantity", "price", "barcode", "sale_price", "published", "has_variants", "parent_ref"];
// صفّ زد: [sku,name_ar,name_en,quantity,price,barcode,sale_price,published,has_variants,parent_ref]
const Z = (sku, qty, price, { sale = "", pub = "Yes", hv = "No", par = "" } = {}) => [sku, "زد " + sku, sku, qty, price, "", sale, pub, hv, par];
const WH = (code, qty, incl) => ({ "رقم الصنف": code, "الكمية": qty, "سعر البيع شامل الضريبة": incl, "سعر البيع قبل الضريبة": incl, "اسم الصنف": "مخزن " + code, "باركود المستودع": "" });
const merge = codes => ({ unified: codes.map(c => ({ code: c })), noPrice: [] });

// المشهد الرئيسي: يغطّي كل الحالات دفعةً واحدة
function masterCfg() {
  const rows = [HEADER,
    Z("A1", "5", "100"),                                   // مطابَق عادي (5→9)
    Z("INF1", "infinite", "50"),                            // لا-محدود بلا مطابقة (ج-١)
    Z("SC1", "10", "100", { sale: "200" }),                 // تخفيض 200 ≥ سعر نهائي 150 ⇒ استبعاد
    Z("P1", "3", "1000", { hv: "Yes" }),                    // أب — كل أبنائه 0 ⇒ يُخفى
    Z("P1.1", "0", "1000", { par: "P1" }),
    Z("P1.2", "0", "1000", { par: "P1" }),
    Z("P2", "3", "1000", { hv: "Yes" }),                    // أب — ابن حيّ ⇒ لا يُخفى
    Z("P2.1", "0", "1000", { par: "P2" }),
    Z("W1", "2", "300"),                                    // انتظار عاد كوده (غير مربوط)
    Z("W2", "2", "300"),                                    // انتظار عاد كوده المربوط (WH2)
    Z("IG1", "2", "300"),                                   // انتظار عاد (كان متجاهَلاً — حُذف «تجاهل» في الدفعة ١)
    Z("W3", "2", "300"),                                    // انتظار ما زال غائباً
    Z("NEW1", "7", "300"),                                  // جديد بلا مطابقة (لاختبار applyDecision: wait ⇒ يُصفَّر فوراً)
  ];
  const whRows = [WH("A1", 9, 100), WH("SC1", 8, 150), WH("P1.1", 0, 1000), WH("P1.2", 0, 1000), WH("P2.1", 7, 1000), WH("W1", 4, 300), WH("WH2", 6, 300), WH("IG1", 5, 300)];
  const codes = ["A1", "SC1", "P1.1", "P1.2", "P2.1", "W1", "WH2", "IG1"];
  return {
    stData: { sheetName: "P", header: HEADER, rows },
    whRows, lastMerge: merge(codes),
    manualMap: { W2: "WH2" },
    waiting: [{ skuN: "W1", sku: "W1" }, { skuN: "W2", sku: "W2" }, { skuN: "IG1", sku: "IG1" }, { skuN: "W3", sku: "W3" }],
    history: [], opts: { price: "incl", absent: "keep", lowzero: "off", split: "equal" },
    uploaded: true, callHook: true,
  };
}

// ===== fixture الدفعة ٥: «غائب عن المخزن» ⇒ كمية 0 ＋ published=No دائماً =====
// المنطقة كانت **بلا حارس** إطلاقاً (صفر مرساة على absent في b3، وصفر مشهد سلوكي).
// AB1: له matchedHistory · غائب عن المخزن الموحّد · كمية زد 7 (≠0) · منشور  ⇒ يجب: qty=0 ＋ published=No
// AB2: مربوط يدوياً وكوده المخزني غائب ⇒ نفس المعاملة (الغياب لا يفرّق بين مصدر التاريخ)
// AB0: مطابَق ضابط — يثبت أن التغيير لم يمسّ المسار العادي
// ABZ: غائب لكن كمية زد 0 أصلاً ⇒ stripNoChangeQty يُسقطه (لا استيراد عبثي)
// ABV: غائب ومتغيّر (له أب) ⇒ لا published على صفّه (النشر يُدار من الأب)
function absentCfg() {
  const rows = [HEADER,
    Z("AB0", "3", "500"),                                 // مطابَق: زد 3 ⇒ مخزن 9 (تغيير فعليّ وإلا أسقطه stripNoChangeQty)
    Z("AB1", "7", "500"),
    Z("AB2", "4", "500"),
    Z("ABZ", "0", "500"),
    Z("ABP", "3", "500", { hv: "Yes" }),
    Z("ABV", "5", "500", { par: "ABP" }),
  ];
  return {
    stData: { sheetName: "P", header: HEADER, rows },
    whRows: [WH("AB0", 9, 500)], lastMerge: merge(["AB0"]),
    manualMap: { AB2: "WHX" },
    waiting: [],
    history: ["AB1", "ABZ", "ABV"],
    // **keep عمداً**: بعد الدفعة ٥ لم يعد للخيار أثر — فنجاحُ الفحص يثبت أن التصفير
    // صار قاعدة لا خياراً، ورسوبُه على النسخة القديمة يثبت أن للفحص أسناناً.
    opts: { price: "incl", absent: "keep", lowzero: "off", split: "equal" },
    uploaded: false, callHook: false,
  };
}

// مشهد ج-١ الأدنى: عنصر لا-محدود + مطابَق ضابط — بلا انتظار/خطاف (يعمل على النسخ القديمة)
function infCfg() {
  const rows = [HEADER, Z("A1", "5", "100"), Z("INF1", "infinite", "50")];
  return {
    stData: { sheetName: "P", header: HEADER, rows },
    whRows: [WH("A1", 9, 100)], lastMerge: merge(["A1"]),
    manualMap: {}, waiting: [], history: [],
    opts: { price: "incl", absent: "keep", lowzero: "off", split: "equal" },
    uploaded: false, callHook: false,
  };
}

// عطل ٢: خليط «يحتاج قرار» (جديد، ليس wasLinked) + «غائب مربوط يدوياً» (wasLinked) — لتفعيل فلتر «سبق ربطه فقط»
function countsCfg() {
  const rows = [HEADER, Z("N1", "5", "100"), Z("N2", "6", "100"), Z("L1", "2", "300"), Z("L2", "2", "300")];
  return {
    stData: { sheetName: "P", header: HEADER, rows }, whRows: [], lastMerge: merge([]),
    manualMap: { L1: "WL1", L2: "WL2" }, waiting: [], history: ["L1", "L2"],
    opts: { price: "incl", absent: "keep", lowzero: "off", split: "equal" }, uploaded: false, callHook: false, countsProbe: true,
  };
}

// إصلاح البانر: صنف مربوط يدوياً (كوده الخاص ليس في المخزن) — حذف الرابط يجب أن يُخرجه من الملفّين فوراً
function delmapCfg() {
  return {
    stData: { sheetName: "P", header: HEADER, rows: [HEADER, Z("MAP1", "3", "100")] },
    whRows: [WH("WMAP", 9, 100)], lastMerge: merge(["WMAP"]), manualMap: { MAP1: "WMAP" },
    waiting: [], history: [], opts: { price: "incl", absent: "keep", lowzero: "off", split: "equal" }, uploaded: false,
  };
}

// أب has_variants=Yes **وله كود مستودع مطابِق** ⇒ يجب صفر صفوف كميات (لولا الاستبعاد لطابَق ودخل — مشهد معزول ذو أسنان). A1 ضابط.
function parentQtyCfg() {
  return {
    stData: { sheetName: "P", header: HEADER, rows: [HEADER, Z("A1", "5", "100"), Z("PV", "5", "200", { hv: "Yes" })] },
    whRows: [WH("A1", 9, 100), WH("PV", 9, 200)], lastMerge: merge(["A1", "PV"]), manualMap: {},
    waiting: [], history: [], opts: { price: "incl", absent: "keep", lowzero: "off", split: "equal" }, uploaded: false, callHook: false,
  };
}

// دالّة داخل الصفحة: تهيّئ الحالة، تستدعي الخطاف+run (＋قرار اختياري)، وتُعيد القراءات (دفاعية للنسخ القديمة)
async function inpage(cfg) {
  const mk = () => { const c = { select() { return c; }, upsert: async () => ({ error: null }), delete() { return c; }, insert: async () => ({ error: null }), eq: async () => ({ error: null }), in: async () => ({ error: null }), order() { return c; }, range: async () => ({ data: [], error: null }) }; return c; };
  try { sb = { from: mk, auth: { getSession: async () => ({ data: { session: null } }) } }; } catch (e) {}
  try { dbOnline = true; myRole = "owner"; } catch (e) {}
  // SheetJS محجوب (CDN) — بديل وهمي فقط لتوليد Blob في wireDl (نقارن الصفوف لا البايتات؛ بدونه يرمي wireDl فيُجهِض run قبل ضبط lastUpdated/lastUnmatchedRaw)
  window.XLSX = { utils: { aoa_to_sheet: () => ({}), book_new: () => ({}), book_append_sheet: () => {}, sheet_to_json: () => [] }, write: () => new Uint8Array(0), read: () => ({}) };
  stData = cfg.stData; whRows = cfg.whRows; lastMerge = cfg.lastMerge;
  manualMap = cfg.manualMap || {};
  waitingSet = new Set((cfg.waiting || []).map(w => w.skuN));
  try { waitingMeta = new Map((cfg.waiting || []).map(w => [w.skuN, { sku: w.sku, name: "", missed: 0, lastSeen: null }])); } catch (e) {}
  matchedHistory = new Set(cfg.history || []);
  try { priceOffsets = {}; } catch (e) {}
  try { opts = Object.assign(opts, cfg.opts || {}); } catch (e) {}
  try { whWasUploaded = cfg.uploaded === undefined ? true : cfg.uploaded; } catch (e) {}
  let err = null;
  try { if (cfg.callHook && typeof processWaitingOnUpload === "function") processWaitingOnUpload(); } catch (e) { err = "hook:" + e; }
  let snap = null;
  try { run(false); snap = { upd: (lastUpdated || []).length, unm: (lastUnmatchedRaw || []).length, reap: (typeof reappearedSet !== "undefined" && reappearedSet ? reappearedSet.size : -1) }; } catch (e) { err = (err ? err + " | " : "") + "run:" + e; }
  if (cfg.decision && cfg.decision.type === "wait") {
    try { await applyDecision(() => markWaiting(cfg.decision.raw, cfg.decision.skuN, "")); } catch (e) { err = (err ? err + " | " : "") + "dec:" + e; }
  }
  if (cfg.decision && cfg.decision.type === "delmap") {
    try { await delMap(cfg.decision.sku); } catch (e) { err = (err ? err + " | " : "") + "delmap:" + e; }
  }
  let countsProbe = null;
  if (cfg.countsProbe) {
    try {
      const need = () => { const el = document.querySelector(".uni-need"); return el ? el.textContent.replace(/[^\d]/g, "") : "?"; };
      const absent = () => { const e = [...document.querySelectorAll(".uni-st")].find(x => x.textContent.includes("غائب")); return e ? e.textContent.replace(/[^\d]/g, "") : "?"; };
      batchLostOnly = false; renderDetail(); const offN = need(), offA = absent();
      batchLostOnly = true; renderDetail(); const onN = need(), onA = absent();
      batchLostOnly = false; renderDetail();
      countsProbe = { offN, onN, offA, onA };
    } catch (e) { countsProbe = { err: String(e) }; }
  }
  const H = stData.header;
  const iSku = H.indexOf("sku"), iPub = H.indexOf("published"), iPrice = H.indexOf("price");
  const pr = lastPriceRows || [], qr = lastQtyRows || [];
  const qtySku = r => String(r[0]);
  return {
    err, snap, countsProbe,
    qtyRows: qr,
    qtySkus: qr.slice(1).map(qtySku),
    qtyOf: (() => { const m = {}; qr.slice(1).forEach(r => { m[String(r[0])] = r[3]; }); return m; })(),
    priceRows: pr,
    priceSkus: pr.slice(1).map(r => String(r[iSku])),
    parentHidden: pr.slice(1).filter(r => iPub >= 0 && String(r[iPub]).toLowerCase() === "no" && (r[iPrice] === "" || r[iPrice] == null)).map(r => String(r[iSku])),
    updated: (lastUpdated || []).map(u => ({ sku: String(u.sku), newQty: u.newQty, reappeared: !!u.reappeared })),
    unmatched: (lastUnmatchedRaw || []).map(u => ({ sku: String(u.sku), reappeared: !!u.reappeared, waiting: !!u.waiting })),
    saleConflicts: (typeof lastSaleConflicts !== "undefined" && lastSaleConflicts ? lastSaleConflicts : []).map(s => String(s.sku)),
    reappearedSet: (typeof reappearedSet !== "undefined" && reappearedSet ? [...reappearedSet] : []),
    absent: (typeof lastAbsent !== "undefined" && lastAbsent ? lastAbsent : []).map(a => String(a.sku)),
    pubOf: (() => { const m = {}; pr.slice(1).forEach(r => { if (iPub >= 0) m[String(r[iSku])] = String(r[iPub]); }); return m; })(),
    waitingLeft: [...waitingSet],
  };
}

// ---- محرّك: يخدم html ويشغّل inpage(cfg) ----
async function bootRead(browser, html, cfg) {
  const server = createServer((req, res) => { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(html); });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const page = await browser.newPage();
  const perr = [];
  page.on("pageerror", e => perr.push(String(e).slice(0, 140)));
  await page.setRequestInterception(true);
  page.on("request", req => { const u = req.url(); if (u.startsWith("http://127.0.0.1:" + port)) return req.continue(); if (/^https?:/.test(u)) return req.abort(); req.continue(); });
  await page.goto("http://127.0.0.1:" + port + "/", { waitUntil: "load" });
  let out;
  try { out = await page.evaluate(inpage, cfg); } finally { await page.close(); server.close(); }
  out._pageerrors = perr.slice(0, 4);
  return out;
}

// ---- deep-equal ----
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- التشغيل ----
const exe = findChrome();
if (!exe) { console.error("✗ لا Chrome. اضبط CHROME_PATH."); process.exit(2); }
const browser = await puppeteer.launch({ executablePath: exe, headless: "new", args: ["--no-sandbox", "--disable-gpu"] });
const fails = [], notes = [];
try {
  // ===== المشهد الرئيسي على النسخة الحالية =====
  const M = await bootRead(browser, curHtml, masterCfg());
  if (M.err) fails.push("المشهد الرئيسي رمى: " + M.err);
  notes.push(`رئيسي: qty=[${M.qtySkus}] parentHidden=[${M.parentHidden}] reappeared=[${M.reappearedSet}] waitingLeft=[${M.waitingLeft}] saleConflicts=[${M.saleConflicts}]`);
  notes.push(`  updated: ${M.updated.map(u => u.sku + (u.reappeared ? "↩" : "")).join(", ")} · unmatched: ${M.unmatched.map(u => u.sku + (u.reappeared ? "↩" : "") + (u.waiting ? "⏳" : "")).join(", ")}`);

  // ج-١: INF1 خارج الملفّين
  if (M.qtySkus.includes("INF1")) fails.push("ج-١: INF1 دخل ملف الكميات (يجب ألا يدخل)");
  if (M.priceSkus.includes("INF1")) fails.push("ج-١: INF1 دخل ملف الأسعار");

  // صمام التخفيض
  if (!M.saleConflicts.includes("SC1")) fails.push("الصمام: SC1 ليس في lastSaleConflicts");
  if (M.priceSkus.includes("SC1")) fails.push("الصمام: SC1 تسرّب إلى ملف الأسعار (sale ≥ price)");

  // إجماع الأب
  if (!M.parentHidden.includes("P1")) fails.push("الإجماع: P1 (كل أبنائه 0) لم يُخفَ");
  if (M.parentHidden.includes("P2")) fails.push("الإجماع: P2 (ابن حيّ) أُخفي خطأً");
  // الأب has_variants=Yes ⇒ صفر صفوف في ملف الكميات (سلوكياً لا بنيوياً — الحارس البنيوي أثبت هشاشته لهذا الثابت)
  if (M.qtySkus.includes("P1")) fails.push("الأب: P1 (has_variants=Yes) دخل ملف الكميات (يجب صفر صفوف)");
  if (M.qtySkus.includes("P2")) fails.push("الأب: P2 (has_variants=Yes) دخل ملف الكميات (يجب صفر صفوف)");

  // العائد (٣+١)
  const uW1 = M.unmatched.find(u => u.sku === "W1"), upW2 = M.updated.find(u => u.sku === "W2");
  if (!(uW1 && uW1.reappeared)) fails.push("٣: W1 (غير مربوط عاد) ليس في «يحتاج قرار» بوسم reappeared");
  if (M.updated.some(u => u.sku === "W1")) fails.push("٣: W1 دخل «تم تحديثه» (يجب ألا يُطابَق تلقائياً)");
  if (!(upW2 && upW2.reappeared)) fails.push("١: W2 (مربوط عاد) ليس في «تم تحديثه» بوسم reappeared");
  if (M.unmatched.some(u => u.sku === "W2" && u.reappeared)) fails.push("١: W2 المربوط ظهر كـ«يحتاج قرار» (يجب أن يستأنف رابطه)");
  // الدفعة ١: حُذف «تجاهل» ⇒ IG1 لم يعد مستثنى من حارس العودة، فيجب أن يسلك سلوك W1 بالضبط (عاد غير مربوط ⇒ «يحتاج ربط» بوسم reappeared).
  if (!M.unmatched.some(u => u.sku === "IG1" && u.reappeared)) fails.push("الدفعة١: IG1 (عاد غير مربوط) ليس في «يحتاج ربط» بوسم reappeared — بقايا استثناء التجاهل؟");
  if (!M.waitingLeft.includes("W3")) fails.push("٢: W3 (غائب) خرج من الانتظار خطأً");
  if (M.waitingLeft.includes("W1") || M.waitingLeft.includes("W2")) fails.push("٣: العائد لم يُزَل من الانتظار");
  if (!(M.reappearedSet.includes("W1") && M.reappearedSet.includes("W2"))) fails.push("٣: reappearedSet لا يشمل W1/W2 (كشف العودة — يشمل المربوط بالكود المُحَلّ)");

  // A1 المطابَق العادي
  if (!(M.qtyOf.A1 === 9 || M.qtyOf.A1 === "9")) fails.push(`A1 المطابَق: كمية ${M.qtyOf.A1} ≠ 9`);

  // ===== الأب has_variants=Yes ⇒ صفر صفوف كميات (سلوكي معزول ذو أسنان) =====
  const PVc = await bootRead(browser, curHtml, parentQtyCfg());
  if (PVc.err) fails.push("مشهد الأب رمى: " + PVc.err);
  if (PVc.qtySkus.includes("PV")) fails.push("الأب: PV (has_variants=Yes وله كود مستودع) دخل ملف الكميات (يجب صفر صفوف)");
  if (!PVc.qtySkus.includes("A1")) fails.push("مشهد الأب: A1 الضابط غائب عن ملف الكميات (مقارنة عابثة)");
  notes.push(`الأب PV: qty=[${PVc.qtySkus}] (PV يغيب · A1 حاضر)`);
  // أسنان: الأب محميّ بدفاع عميق (continue الحلقة ＋ stripHasVar النهائية) — يجب كسر الاثنين ليتغيّر السلوك فعلاً
  const pvMut = curHtml
    .replace("if (parentRaws.has(rawKey)) { cls.parent++; continue; }", "if (parentRaws.has(rawKey)) { cls.parent++; }")
    .replace("qtyRows = stripHasVar(qtyRows); qtyCount = qtyRows.length - 1;", "qtyCount = qtyRows.length - 1;");
  if (pvMut === curHtml) fails.push("أسنان الأب: تعذّر تطبيق الطفرة (لم يُطابَق استبعاد الأب/stripHasVar)");
  else { const PT = await bootRead(browser, pvMut, parentQtyCfg()); if (!PT.qtySkus.includes("PV")) fails.push("أسنان الأب: بعد كسر الحارسين بقي PV خارج ملف الكميات — الاختبار بلا أسنان"); else notes.push(`أسنان الأب (بكسر continue ＋ stripHasVar): qty=[${PT.qtySkus}] ⇒ PV دخل (الاختبار له أسنان)`); }

  // ===== ٤: applyDecision يعكس القرار فوراً (جديد غير مطابَق ⇒ wait ⇒ يدخل ملف الكميات بـ0 فوراً) =====
  if (M.qtySkus.includes("NEW1")) fails.push("٤ (خطّ أساس): NEW1 الجديد ظهر في ملف الكميات قبل أي قرار");
  const D = await bootRead(browser, curHtml, { ...masterCfg(), decision: { type: "wait", raw: "NEW1", skuN: "NEW1" } });
  if (D.err) fails.push("مشهد القرار رمى: " + D.err);
  if (!(D.qtyOf.NEW1 === 0 || D.qtyOf.NEW1 === "0")) fails.push(`٤: بعد applyDecision(wait NEW1) NEW1 غير مصفّر في ملف الكميات (=${D.qtyOf.NEW1}) — run(true) لم يعكس القرار فوراً`);
  notes.push(`قرار: NEW1 قبل=${M.qtySkus.includes("NEW1") ? "موجود" : "غائب"} · بعد wait ⇒ كمية=${D.qtyOf.NEW1}`);
  // أسنان ٤: بحذف run(true) من applyDecision لا يعكس القرار (NEW1 يبقى خارج ملف الكميات)
  const mutated = curHtml.replace("run(true);   // يعكس القرار فوراً في الملفّين", "/*no-run*/;   // معطّل للتحقّق");
  if (mutated === curHtml) fails.push("أسنان ٤: تعذّر تطبيق الطفرة (لم يُطابَق run(true) في applyDecision)");
  else {
    const T = await bootRead(browser, mutated, { ...masterCfg(), decision: { type: "wait", raw: "NEW1", skuN: "NEW1" } });
    if (T.qtyOf.NEW1 === 0 || T.qtyOf.NEW1 === "0") fails.push("أسنان ٤: بلا run(true) بقي NEW1 مصفّراً — الاختبار بلا أسنان");
    notes.push(`أسنان ٤ (بلا run(true)): NEW1 كمية=${T.qtyOf.NEW1 === undefined ? "غائب عن الملف (صحيح)" : T.qtyOf.NEW1}`);
  }

  // ===== تشخيص عطل ١: صنف كميته 0 أصلاً في زد ⇒ wait ⇒ لا صفّ كميات (stripNoChangeQty) لكنه يُخفى إن كان منشوراً بسيطاً =====
  const Z0 = await bootRead(browser, curHtml, {
    stData: { sheetName: "P", header: HEADER, rows: [HEADER, Z("ZP", "0", "300", { pub: "Yes" })] },
    whRows: [], lastMerge: merge([]), manualMap: {}, waiting: [], history: [],
    opts: { price: "incl", absent: "keep", lowzero: "off", split: "equal" }, uploaded: false, callHook: false,
    decision: { type: "wait", raw: "ZP", skuN: "ZP" },
  });
  if (Z0.qtySkus.includes("ZP")) fails.push("عطل١-تشخيص: ZP (زد=0) دخل ملف الكميات — كان يجب أن يُسقطه stripNoChangeQty");
  if (!Z0.priceSkus.includes("ZP")) fails.push("عطل١-تشخيص: ZP المنشور البسيط لم يُخفَ (published=No) — مسار الإخفاء معطّل");
  notes.push(`عطل١ تشخيص: ZP(زد qty 0، منشور بسيط) بعد wait ⇒ كميات=${Z0.qtySkus.includes("ZP") ? "موجود(خطأ)" : "غائب(صحيح — 0==0)"} · أسعار=${Z0.priceSkus.includes("ZP") ? "published=No (يُخفى)" : "لا صفّ"}`);

  // ===== عطل ٢: تفعيل btFilter لا يغيّر عدّادات الشريط (المحسوب من الخام) =====
  const CC = await bootRead(browser, curHtml, countsCfg());
  const cp = CC.countsProbe || {};
  if (!(cp.offN === cp.onN && cp.offA === cp.onA)) fails.push(`عطل٢: العدّاد تغيّر بالفلتر (يحتاج قرار ${cp.offN}→${cp.onN} · غائب ${cp.offA}→${cp.onA})`);
  notes.push(`عطل٢: الفلتر مُطفأ/مُفعّل ⇒ يحتاج قرار ${cp.offN}/${cp.onN} · غائب ${cp.offA}/${cp.onA} (يجب تطابقهما)`);
  const CCold = await bootRead(browser, showAt("4f66288"), countsCfg());
  const cpo = CCold.countsProbe || {};
  if (cpo.offN === cpo.onN && cpo.offA === cpo.onA) fails.push(`أسنان عطل٢: على 4f66288 لم يتغيّر العدّاد بالفلتر (${cpo.offN}/${cpo.onN}) — بلا أسنان`);
  notes.push(`أسنان عطل٢ (4f66288 قبل الإصلاح): يحتاج قرار ${cpo.offN}→${cpo.onN} · غائب ${cpo.offA}→${cpo.onA} (يتغيّر = العطل)`);

  // ===== إصلاح البانر: حذف رابط ⇒ الملفّان يعكسانه فوراً (delMap → run(true)) =====
  const DMb = await bootRead(browser, curHtml, delmapCfg());
  const DMd = await bootRead(browser, curHtml, { ...delmapCfg(), decision: { type: "delmap", sku: "MAP1" } });
  if (!(DMb.qtyOf.MAP1 === 9 || DMb.qtyOf.MAP1 === "9")) fails.push(`delMap خطّ أساس: MAP1 المربوط ليس في الكميات (=${DMb.qtyOf.MAP1})`);
  // §الدفعة٥ — تحوّل سلوكي مقصود: كان حذف الرابط يُخرِج الصنف من الملفّين. الآن matchedHistory
  // تراكم في التشغيل الأول، فيصير الصنف «معروفاً سابقاً وغائباً عن المخزن» ⇒ يُصدَّر بـ0 ويُخفى.
  // الفحص ما زال يثبت الفوريّة (run(true))، لكن بالنتيجة الصحيحة الجديدة لا بالاختفاء.
  if (Number(DMd.qtyOf.MAP1) !== 0) fails.push(`إصلاح البانر: بعد delMap كمية MAP1 = ${DMd.qtyOf.MAP1} لا 0 — run(true) لم يعكس الحذف`);
  if (String((DMd.pubOf || {}).MAP1 || "").toLowerCase() !== "no") fails.push(`الدفعة٥: بعد delMap لم يُخفَ MAP1 (published=${(DMd.pubOf||{}).MAP1})`);
  notes.push(`delMap: قبل=${DMb.qtyOf.MAP1} · بعد=${"MAP1" in DMd.qtyOf ? DMd.qtyOf.MAP1 : "غائب"} · pub=${(DMd.pubOf||{}).MAP1}`);
  const DMo = await bootRead(browser, showAt("831c299"), { ...delmapCfg(), decision: { type: "delmap", sku: "MAP1" } });
  if (!("MAP1" in DMo.qtyOf)) fails.push("أسنان delMap: على 831c299 اختفى MAP1 رغم markDirty (بلا run(true)) — بلا أسنان");
  notes.push(`أسنان delMap (831c299): بعد delMap MAP1=${"MAP1" in DMo.qtyOf ? DMo.qtyOf.MAP1 : "غائب"} (يبقى = العطل القديم)`);

  // ===== ج-١ حياد: before(1a036f4، فيه isInf) == after(8bb0486) =====
  const before = await bootRead(browser, showAt("8bb0486^"), infCfg());
  const after = await bootRead(browser, showAt("8bb0486"), infCfg());
  if (before.err) notes.push("before pageerr: " + (before._pageerrors || []).join(" | "));
  const b = { qty: before.qtyRows, price: before.priceRows }, a = { qty: after.qtyRows, price: after.priceRows };
  if (!eq(b, a)) fails.push("ج-١: الملفّان اختلفا قبل/بعد حذف isInf (ليسا متطابقين!)");
  if (before.qtyRows.length <= 1) fails.push("ج-١: مقارنة عابثة — ملف الكميات فارغ (A1 الضابط مفقود)");
  if (before.qtySkus.includes("INF1") || after.qtySkus.includes("INF1")) fails.push("ج-١: INF1 دخل الكميات في إحدى النسختين");
  notes.push(`ج-١ حياد: before.qty=[${before.qtySkus}] == after.qty=[${after.qtySkus}] ⇒ ${eq(b, a)}`);

  // ===== الدفعة ٥: «غائب عن المخزن» ⇒ كمية 0 ＋ published=No دائماً =====
  // المنطقة كانت بلا حارس. الـfixture تمرّر absent:"keep" عمداً — فنجاحُها يثبت أن
  // التصفير صار **قاعدة لا خياراً**، ورسوبُها على النسخة قبل التغيير يثبت الأسنان.
  const AB = await bootRead(browser, curHtml, absentCfg());
  if (AB.err) fails.push("الدفعة٥: خطأ تشغيل — " + AB.err);
  const q = AB.qtyOf || {}, p = AB.pubOf || {};
  // (أ) الضابط: المطابَق لم يتأثّر
  if (!AB.qtySkus.includes("AB0")) fails.push("الدفعة٥: AB0 المطابَق غاب عن ملف الكميات — التغيير مسّ المسار العادي");
  if (Number(q.AB0) !== 9) fails.push(`الدفعة٥: AB0 كميته ${q.AB0} لا 9 (المطابَق يجب أن يبقى على كميته)`);
  // (ب) الغائب بتاريخ مطابقة ⇒ 0 في الكميات
  if (Number(q.AB1) !== 0) fails.push(`الدفعة٥: AB1 (غائب · منشور · كمية زد 7) كميته المُصدَّرة ${q.AB1} لا 0`);
  if (Number(q.AB2) !== 0) fails.push(`الدفعة٥: AB2 (غائب · مربوط يدوياً) كميته المُصدَّرة ${q.AB2} لا 0`);
  // (ج) الغائب البسيط المنشور ⇒ published=No في الأسعار
  if (String(p.AB1 || "").toLowerCase() !== "no") fails.push(`الدفعة٥: AB1 لم يُخفَ في ملف الأسعار (published=${p.AB1})`);
  if (String(p.AB2 || "").toLowerCase() !== "no") fails.push(`الدفعة٥: AB2 لم يُخفَ في ملف الأسعار (published=${p.AB2})`);
  // (د) lastAbsent يحوي الغائبين، ولا يدخلون «يحتاج ربط»
  for (const k of ["AB1", "AB2"]) {
    if (!AB.absent.includes(k)) fails.push(`الدفعة٥: ${k} ليس في lastAbsent`);
    if (AB.unmatched.some(u => u.sku === k)) fails.push(`الدفعة٥: ${k} دخل «يحتاج ربط» (يجب أن يبقى غائباً)`);
  }
  // (هـ) المصفَّر أصلاً في زد يُسقطه stripNoChangeQty — لا استيراد عبثي
  if (AB.qtySkus.includes("ABZ")) fails.push("الدفعة٥: ABZ (كمية زد 0 أصلاً) دخل ملف الكميات — stripNoChangeQty لم يُسقطه");
  // (و) المتغيّر الغائب: يُصفَّر لكن لا published على صفّه (النشر يُدار من الأب)
  if (Number(q.ABV) !== 0) fails.push(`الدفعة٥: ABV (متغيّر غائب) كميته ${q.ABV} لا 0`);
  if (String(p.ABV || "").toLowerCase() === "yes") fails.push("الدفعة٥: ABV المتغيّر حمل published=Yes (النشر يُدار من الأب)");
  notes.push(`الدفعة٥ الغائب: qty=[${AB.qtySkus}] · AB1=${q.AB1}/pub=${p.AB1} · AB2=${q.AB2}/pub=${p.AB2} · ABV=${q.ABV} · lastAbsent=[${AB.absent}]`);

  // ===== أسنان الدفعة ٥: على النسخة قبل التغيير (absent:keep فعّال) لا تصفير =====
  const ABOLD = await bootRead(browser, showAt("079e39e"), absentCfg());
  const oldZeroed = ABOLD.qtySkus.includes("AB1");
  if (oldZeroed) fails.push("أسنان الدفعة٥: النسخة القديمة صفّرت AB1 أيضاً — الفحص بلا أسنان");
  notes.push(`أسنان الدفعة٥ (079e39e): AB1 في الكميات=${oldZeroed} (يجب false — keep كان يعمل)`);

  // ===== أسنان ج-٣: على 917989d (قبل نقل العودة) W1 يُطابَق تلقائياً ⇒ «تم تحديثه» لا «يحتاج قرار» =====
  const OLD = await bootRead(browser, showAt("917989d"), masterCfg());
  const oldW1Updated = OLD.updated.some(u => u.sku === "W1");
  const oldW1Reap = OLD.unmatched.some(u => u.sku === "W1" && u.reappeared);
  if (!oldW1Updated || oldW1Reap) fails.push(`أسنان ج-٣: على 917989d توقّعنا W1 في «تم تحديثه» بلا reappeared (السلوك القديم)، فوجدنا updated=${oldW1Updated} reappeared=${oldW1Reap} — الاختبار بلا أسنان`);
  notes.push(`أسنان ج-٣ (917989d): W1 في updated=${oldW1Updated} · unmatched-reappeared=${oldW1Reap} (يؤكّد اختلاف السلوك عن الحالي)`);
} finally { await browser.close(); }

console.log(notes.map(n => "  · " + n).join("\n"));
if (fails.length) { console.error("\n✗ فشل المشغّل السلوكي:\n" + fails.map(f => "  ✗ " + f).join("\n")); process.exit(1); }
console.log("\n✅ المشغّل السلوكي: كل الادّعاءات (ج-١ حياد · ٤ فورية · ٥ إجماع · صمام التخفيض · ٣+١ العودة) مثبتة سلوكياً، وأسنان ج-٣ مؤكَّدة على 917989d.");
