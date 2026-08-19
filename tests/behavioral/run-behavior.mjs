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
const curHtml = readFileSync(join(root, "index.html"), "utf8");
const showAt = ref => execFileSync("git", ["show", ref + ":index.html"], { cwd: root, maxBuffer: 64 * 1024 * 1024 }).toString();

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
    Z("IG1", "2", "300"),                                   // انتظار + متجاهَل عاد
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
    ignored: ["IG1"], history: [], opts: { price: "incl", absent: "keep", lowzero: "off", split: "equal" },
    uploaded: true, callHook: true,
  };
}

// مشهد ج-١ الأدنى: عنصر لا-محدود + مطابَق ضابط — بلا انتظار/خطاف (يعمل على النسخ القديمة)
function infCfg() {
  const rows = [HEADER, Z("A1", "5", "100"), Z("INF1", "infinite", "50")];
  return {
    stData: { sheetName: "P", header: HEADER, rows },
    whRows: [WH("A1", 9, 100)], lastMerge: merge(["A1"]),
    manualMap: {}, waiting: [], ignored: [], history: [],
    opts: { price: "incl", absent: "keep", lowzero: "off", split: "equal" },
    uploaded: false, callHook: false,
  };
}

// دالّة داخل الصفحة: تهيّئ الحالة، تستدعي الخطاف+run (＋قرار اختياري)، وتُعيد القراءات (دفاعية للنسخ القديمة)
async function inpage(cfg) {
  const mk = () => { const c = { select() { return c; }, upsert: async () => ({ error: null }), delete() { return c; }, insert: async () => ({ error: null }), eq: async () => ({ error: null }), in: async () => ({ error: null }), order() { return c; }, range: async () => ({ data: [], error: null }) }; return c; };
  try { sb = { from: mk, auth: { getSession: async () => ({ data: { session: null } }) } }; } catch (e) {}
  try { dbOnline = true; } catch (e) {}
  // SheetJS محجوب (CDN) — بديل وهمي فقط لتوليد Blob في wireDl (نقارن الصفوف لا البايتات؛ بدونه يرمي wireDl فيُجهِض run قبل ضبط lastUpdated/lastUnmatchedRaw)
  window.XLSX = { utils: { aoa_to_sheet: () => ({}), book_new: () => ({}), book_append_sheet: () => {}, sheet_to_json: () => [] }, write: () => new Uint8Array(0), read: () => ({}) };
  stData = cfg.stData; whRows = cfg.whRows; lastMerge = cfg.lastMerge;
  manualMap = cfg.manualMap || {};
  waitingSet = new Set((cfg.waiting || []).map(w => w.skuN));
  try { waitingMeta = new Map((cfg.waiting || []).map(w => [w.skuN, { sku: w.sku, name: "", missed: 0, lastSeen: null }])); } catch (e) {}
  ignoredSet = new Set(cfg.ignored || []);
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
  const H = stData.header;
  const iSku = H.indexOf("sku"), iPub = H.indexOf("published"), iPrice = H.indexOf("price");
  const pr = lastPriceRows || [], qr = lastQtyRows || [];
  const qtySku = r => String(r[0]);
  return {
    err, snap,
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

  // العائد (٣+١)
  const uW1 = M.unmatched.find(u => u.sku === "W1"), upW2 = M.updated.find(u => u.sku === "W2");
  if (!(uW1 && uW1.reappeared)) fails.push("٣: W1 (غير مربوط عاد) ليس في «يحتاج قرار» بوسم reappeared");
  if (M.updated.some(u => u.sku === "W1")) fails.push("٣: W1 دخل «تم تحديثه» (يجب ألا يُطابَق تلقائياً)");
  if (!(upW2 && upW2.reappeared)) fails.push("١: W2 (مربوط عاد) ليس في «تم تحديثه» بوسم reappeared");
  if (M.unmatched.some(u => u.sku === "W2" && u.reappeared)) fails.push("١: W2 المربوط ظهر كـ«يحتاج قرار» (يجب أن يستأنف رابطه)");
  if (M.unmatched.some(u => u.sku === "IG1" && u.reappeared)) fails.push("٢: IG1 المتجاهَل ظهر كعائد يحتاج قرار (يجب أن يبقى متجاهَلاً)");
  if (!M.waitingLeft.includes("W3")) fails.push("٢: W3 (غائب) خرج من الانتظار خطأً");
  if (M.waitingLeft.includes("W1") || M.waitingLeft.includes("W2")) fails.push("٣: العائد لم يُزَل من الانتظار");
  if (!(M.reappearedSet.includes("W1") && M.reappearedSet.includes("W2"))) fails.push("٣: reappearedSet لا يشمل W1/W2 (كشف العودة — يشمل المربوط بالكود المُحَلّ)");

  // A1 المطابَق العادي
  if (!(M.qtyOf.A1 === 9 || M.qtyOf.A1 === "9")) fails.push(`A1 المطابَق: كمية ${M.qtyOf.A1} ≠ 9`);

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
    whRows: [], lastMerge: merge([]), manualMap: {}, waiting: [], ignored: [], history: [],
    opts: { price: "incl", absent: "keep", lowzero: "off", split: "equal" }, uploaded: false, callHook: false,
    decision: { type: "wait", raw: "ZP", skuN: "ZP" },
  });
  if (Z0.qtySkus.includes("ZP")) fails.push("عطل١-تشخيص: ZP (زد=0) دخل ملف الكميات — كان يجب أن يُسقطه stripNoChangeQty");
  if (!Z0.priceSkus.includes("ZP")) fails.push("عطل١-تشخيص: ZP المنشور البسيط لم يُخفَ (published=No) — مسار الإخفاء معطّل");
  notes.push(`عطل١ تشخيص: ZP(زد qty 0، منشور بسيط) بعد wait ⇒ كميات=${Z0.qtySkus.includes("ZP") ? "موجود(خطأ)" : "غائب(صحيح — 0==0)"} · أسعار=${Z0.priceSkus.includes("ZP") ? "published=No (يُخفى)" : "لا صفّ"}`);

  // ===== ج-١ حياد: before(1a036f4، فيه isInf) == after(8bb0486) =====
  const before = await bootRead(browser, showAt("8bb0486^"), infCfg());
  const after = await bootRead(browser, showAt("8bb0486"), infCfg());
  if (before.err) notes.push("before pageerr: " + (before._pageerrors || []).join(" | "));
  const b = { qty: before.qtyRows, price: before.priceRows }, a = { qty: after.qtyRows, price: after.priceRows };
  if (!eq(b, a)) fails.push("ج-١: الملفّان اختلفا قبل/بعد حذف isInf (ليسا متطابقين!)");
  if (before.qtyRows.length <= 1) fails.push("ج-١: مقارنة عابثة — ملف الكميات فارغ (A1 الضابط مفقود)");
  if (before.qtySkus.includes("INF1") || after.qtySkus.includes("INF1")) fails.push("ج-١: INF1 دخل الكميات في إحدى النسختين");
  notes.push(`ج-١ حياد: before.qty=[${before.qtySkus}] == after.qty=[${after.qtySkus}] ⇒ ${eq(b, a)}`);

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
