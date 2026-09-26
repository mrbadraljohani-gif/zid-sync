// ============================================================================
// G-RUN-LOG — ٣-ب: تسجيل تحوّلات run() في activity_log (القيمة، لا الشكل):
//   ① تصفير الكمية (باب «غائب») ⇒ qty_zeroed بـ before≠0 وبعد=0 والسبب.
//   ② المصفَّر أصلاً (before=0) 🚫 لا يُسجَّل (تحوّلات فقط لا حالات).
//   ③ تغيّر السعر ⇒ price_changed بـ before←after.
//   ④ إعادة النشر (No→Yes) ⇒ republished.
//   ⑤ العودة للمخزن ⇒ returned_stock.
//   ⑥ تغيّر كمية عاديّ (غير صفر) 🚫 لا يُسجَّل (ليس من التحوّلات المرصودة).
//   ⑦ run لا يرمي (إضافيّ محض) · ⑧ الربط الدفعيّ صفّ لكلّ صنف بـzid_sku (لا null).
//   ⑨ فشل الكتابة (insert يرمي) لا يُفشل run — الملفّان يُبنيان.
// --broken: حذف حارس «before===0 continue» ⇒ المصفَّر أصلاً يُسجَّل ⇒ يرسب (②).
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BROKEN = process.argv.includes("--broken");
const BROKEN_SILENT = process.argv.includes("--broken-silent");
const BROKEN_DEDUP = process.argv.includes("--broken-dedup");
let html = readFileSync(process.env.HTML_PATH || join(root, "index.html"), "utf8").replace(/\r\n/g, "\n");
if (BROKEN) {
  const A = "if (before === 0 || before == null) continue;";
  if (!html.includes(A)) { console.error("✗ (--broken) لم أجد حارس «before===0» في تسجيل التصفير"); process.exit(2); }
  html = html.replace(A, "if (before == null) continue;");   // يسمح بتسجيل المصفَّر أصلاً (حالة لا تحوّل)
}
if (BROKEN_SILENT) {
  const A = 'db.activity.bulkInsert(fresh).catch(e => console.warn("run-log bulkInsert فشل (لا يمسّ المطابقة):", e))';
  if (!html.includes(A)) { console.error("✗ (--broken-silent) لم أجد .catch مع الأثر"); process.exit(2); }
  html = html.replace(A, "db.activity.bulkInsert(fresh).catch(() => {})");   // .catch صامت بلا أثر (البند ١ المكسور)
}
if (BROKEN_DEDUP) {
  const A = "const fresh = keyed.filter(e => !runLogSentKeys.has(e.dedup_key));";
  if (!html.includes(A)) { console.error("✗ (--broken-dedup) لم أجد درع الجلسة"); process.exit(2); }
  html = html.replace(A, "const fresh = keyed;");   // بلا درع الجلسة ⇒ إعادة إرسال نفس التحوّل كل تشغيلة
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}

const HEADER = ["sku", "name_ar", "name_en", "quantity", "price", "barcode", "sale_price", "published", "has_variants", "parent_ref"];
const Z = (sku, qty, price, o = {}) => [sku, "زد " + sku, sku, qty, price, "", o.sale || "", o.pub || "Yes", o.hv || "No", o.par || ""];
const WH = (code, qty, incl) => ({ "رقم الصنف": code, "الكمية": qty, "سعر البيع شامل الضريبة": incl, "سعر البيع قبل الضريبة": incl, "اسم الصنف": "مخزن " + code, "باركود المستودع": "" });
const merge = codes => ({ unified: codes.map(c => ({ code: c })), noPrice: [] });

const cfg = {
  stData: { sheetName: "P", header: HEADER, rows: [HEADER,
    Z("AB0", "3", "500"),                    // مطابَق: كمية 3→9 (تحوّل كمية عاديّ) ⇒ 🚫 لا يُسجَّل (⑥)
    Z("AB1", "7", "500"),                    // غائب بتاريخ · كمية زد 7 ⇒ qty_zeroed before7 (①)
    Z("ABZ", "0", "500"),                    // غائب بتاريخ لكن كمية زد 0 أصلاً ⇒ 🚫 لا يُسجَّل (②)
    Z("PC", "5", "100"),                     // مطابَق سعره 100→150 ⇒ price_changed (③)
    Z("RP", "5", "100", { pub: "No" }),      // غير منشور + مخزون ⇒ republished (④)
    Z("W1", "2", "300"),                     // انتظار عاد كوده ⇒ returned_stock (⑤)
  ] },
  whRows: [WH("AB0", 9, 500), WH("PC", 9, 150), WH("RP", 9, 100), WH("W1", 4, 300)],
  codes: ["AB0", "PC", "RP", "W1"],
  history: ["AB1", "ABZ"],
  waiting: [{ skuN: "W1", sku: "W1" }],
};

async function inpage(cfg) {
  const captured = [];
  const cap = (table, payload) => { if (table === "activity_log") (Array.isArray(payload) ? payload : [payload]).forEach(r => captured.push(r)); };
  const mk = (table) => { const c = {
    select() { return c; }, delete() { return c; },
    upsert: async (payload) => { cap(table, payload); return { error: null }; },   // مسار dedup: upsert(onConflict) — لا بدّ من التقاطه
    insert: async (payload) => { cap(table, payload); return { error: null }; },
    eq: async () => ({ error: null }), in: async () => ({ error: null }), order() { return c; }, range: async () => ({ data: [], error: null }),
  }; return c; };
  try { window.confirm = () => true; } catch (e) {}
  try { sb = { from: mk, auth: { getSession: async () => ({ data: { session: null } }) } }; } catch (e) {}
  try { dbOnline = true; myRole = "owner"; histIncomplete = false; zidSyncedAt = 1700000000000; runLogSentKeys = new Set(); } catch (e) {}
  window.XLSX = { utils: { aoa_to_sheet: () => ({}), book_new: () => ({}), book_append_sheet: () => {}, sheet_to_json: () => [] }, write: () => new Uint8Array(0), read: () => ({}) };
  stData = cfg.stData; whRows = cfg.whRows; lastMerge = merge_(cfg.codes);
  manualMap = {}; matchedHistory = new Set(cfg.history || []);
  waitingSet = new Set((cfg.waiting || []).map(w => w.skuN));
  try { waitingMeta = new Map((cfg.waiting || []).map(w => [w.skuN, { sku: w.sku, name: "", missed: 0, lastSeen: null }])); } catch (e) {}
  try { opts = Object.assign(opts, { price: "incl", absent: "keep", lowzero: "off", split: "equal" }); } catch (e) {}
  try { whWasUploaded = true; } catch (e) {}
  function merge_(codes) { return { unified: codes.map(c => ({ code: c })), noPrice: [] }; }

  let err = null;
  try { if (typeof processWaitingOnUpload === "function") processWaitingOnUpload(); } catch (e) { err = "hook:" + e; }
  try { run(false); } catch (e) { err = (err ? err + " | " : "") + "run:" + e; }
  await new Promise(r => setTimeout(r, 120));   // انتظار bulkInsert (fire-and-forget)
  const filesAfterRun = { qty: (lastQtyRows || []).length, price: (lastPriceRows || []).length };
  const afterRun1 = captured.length;
  const hasDedupKey = captured.some(r => r.event_type === "qty_zeroed" && r.dedup_key && String(r.dedup_key).includes("|1700000000000"));   // dedup_key يحمل mirror_ts
  const hasMirrorTs = captured.some(r => r.event_type === "qty_zeroed" && r.details && r.details.mirror_ts === "1700000000000");
  // منع التكرار (البند أ): تشغيلة ثانية بنفس المرآة ⇒ درع الجلسة يمنع أي إرسال جديد
  try { run(false); } catch (e) {}
  await new Promise(r => setTimeout(r, 120));
  const afterRun2 = captured.length;   // يجب == afterRun1 (لا تكرار)
  // تغيّر المرآة ⇒ mirror_ts جديد ⇒ يُسجَّل من جديد
  try { zidSyncedAt = 1800000000000; run(false); } catch (e) {}
  await new Promise(r => setTimeout(r, 120));
  const afterMirrorChange = captured.length;   // يجب > afterRun2

  // ⑧ الربط الدفعيّ: صفّ لكلّ صنف بـzid_sku
  const beforeLink = captured.length;
  try { await dbSetMappings([{ sku: "L1", code: "C1" }, { sku: "L2", code: "C2" }], "manual"); } catch (e) { err = (err ? err + " | " : "") + "link:" + e; }
  await new Promise(r => setTimeout(r, 60));
  const linkRows = captured.slice(beforeLink).filter(r => r.event_type === "link_added");

  // ⑨ فشل الكتابة لا يُفشل run: الكتابة ترمي ⇒ run يبني الملفّين (mirror_ts جديد ليتجاوز درع الجلسة فتُحاوَل الكتابة فعلاً)
  let err2 = null, files2 = null;
  try {
    zidSyncedAt = 1900000000000;
    sb = { from: (t) => { const c = { select() { return c; }, upsert: async () => { throw new Error("boom"); }, delete() { return c; }, insert: async () => { throw new Error("boom"); }, eq: async () => ({ error: null }), in: async () => ({ error: null }), order() { return c; }, range: async () => ({ data: [], error: null }) }; return c; }, auth: { getSession: async () => ({ data: { session: null } }) } };
    run(false);
    await new Promise(r => setTimeout(r, 120));
    files2 = { qty: (lastQtyRows || []).length, price: (lastPriceRows || []).length };
  } catch (e) { err2 = String(e); }

  const byType = t => captured.filter(r => r.event_type === t);
  const find = (t, sku) => captured.find(r => r.event_type === t && String(r.zid_sku) === sku) || null;
  return {
    err, filesAfterRun, err2, files2, afterRun1, afterRun2, afterMirrorChange, hasDedupKey, hasMirrorTs,
    zeroed: byType("qty_zeroed").map(r => ({ sku: r.zid_sku, before: r.details && r.details.before, after: r.details && r.details.after, reason: r.details && r.details.reason })),
    priceChanged: byType("price_changed").map(r => ({ sku: r.zid_sku, before: r.details && r.details.before, after: r.details && r.details.after })),
    republished: byType("republished").map(r => String(r.zid_sku)),
    returned: byType("returned_stock").map(r => String(r.zid_sku)),
    anyAB0: captured.filter(r => String(r.zid_sku) === "AB0").map(r => r.event_type),
    linkRows: linkRows.map(r => ({ sku: r.zid_sku, code: r.details && r.details.code })),
    linkNull: linkRows.some(r => r.zid_sku == null),
  };
}

const server = createServer((req, res) => { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(html); });
await new Promise(r => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox", "--disable-gpu"] });
const p = await b.newPage();
const perr = []; p.on("pageerror", e => perr.push(String(e).slice(0, 160)));
const warns = []; p.on("console", m => { const t = m.type(); if (t === "warn" || t === "warning" || t === "error") warns.push(m.text()); });
await p.setRequestInterception(true);
p.on("request", req => { const u = req.url(); if (u.startsWith("http://127.0.0.1:" + port)) return req.continue(); if (/^https?:/.test(u)) return req.abort(); req.continue(); });
await p.goto("http://127.0.0.1:" + port + "/", { waitUntil: "load" });
const res = await p.evaluate(inpage, cfg);
await new Promise(r => setTimeout(r, 250));   // تفريغ أحداث console (الأثر من .catch يصل node بعد عودة evaluate)
await b.close(); server.close();

const abz = res.zeroed.find(z => z.sku === "ABZ");
if (BROKEN) {
  if (abz) { console.log("✅ (--broken) G-RUN-LOG مسك العطل: المصفَّر أصلاً (ABZ before=0) سُجّل qty_zeroed — حالة لا تحوّل."); process.exit(0); }
  console.error("✗ (--broken) لم يُسجَّل ABZ — لا أسنان. " + JSON.stringify(res.zeroed)); process.exit(1);
}
if (BROKEN_SILENT) {
  if (!warns.some(w => /run-log/.test(w))) { console.log("✅ (--broken-silent) G-RUN-LOG مسك العطل: .catch صامت بلا أثر في الكونسول."); process.exit(0); }
  console.error("✗ (--broken-silent) ظهر أثر رغم .catch الصامت — لا أسنان. " + JSON.stringify(warns)); process.exit(1);
}
if (BROKEN_DEDUP) {
  if (res.afterRun2 > res.afterRun1) { console.log(`✅ (--broken-dedup) G-RUN-LOG مسك العطل: تشغيلة ثانية بنفس المرآة أعادت الإرسال (${res.afterRun1}→${res.afterRun2}).`); process.exit(0); }
  console.error("✗ (--broken-dedup) لم تتكرّر رغم إلغاء الدرع — لا أسنان. " + JSON.stringify(res)); process.exit(1);
}
const fails = [];
if (perr.length) fails.push("أخطاء JS: " + perr.join(" | "));
if (res.err) fails.push("⑦ run رمى: " + res.err);
const ab1 = res.zeroed.find(z => z.sku === "AB1");
if (!ab1) fails.push("① AB1 (غائب كمية 7) لم يُسجَّل qty_zeroed");
else { if (Number(ab1.before) !== 7) fails.push(`① AB1.before ليس 7: ${ab1.before}`); if (Number(ab1.after) !== 0) fails.push(`① AB1.after ليس 0: ${ab1.after}`); if (!/غائب/.test(String(ab1.reason))) fails.push(`① AB1.reason لا يذكر السبب: ${ab1.reason}`); }
if (abz) fails.push("② ABZ (مصفَّر أصلاً before=0) سُجّل qty_zeroed — يجب ألّا يُسجَّل (تحوّلات فقط)");
const pc = res.priceChanged.find(x => x.sku === "PC");
if (!pc) fails.push("③ PC لم يُسجَّل price_changed");
else { if (Number(pc.before) !== 100) fails.push(`③ PC.before ليس 100: ${pc.before}`); if (Number(pc.after) !== 150) fails.push(`③ PC.after ليس 150: ${pc.after}`); }
if (!res.republished.includes("RP")) fails.push("④ RP لم يُسجَّل republished");
if (!res.returned.includes("W1")) fails.push("⑤ W1 لم يُسجَّل returned_stock");
if (res.anyAB0.length) fails.push(`⑥ AB0 (تغيّر كمية عاديّ) سُجّل خطأً: ${res.anyAB0}`);
if (res.linkRows.length !== 2) fails.push(`⑧ الربط الدفعيّ لم يُسجَّل صفّين: ${JSON.stringify(res.linkRows)}`);
if (res.linkNull) fails.push("⑧ صفّ ربط دفعيّ بـzid_sku=null (يجب صفّ لكلّ صنف)");
if (!(res.linkRows.some(r => String(r.sku) === "L1") && res.linkRows.some(r => String(r.sku) === "L2"))) fails.push("⑧ صفّا الربط لا يحملان L1/L2");
if (res.err2) fails.push("⑨ فشل الكتابة أفشل run: " + res.err2);
if (!res.files2 || res.files2.qty < 1) fails.push("⑨ الملفّان لم يُبنيا رغم رمي insert (fire-and-forget مكسور)");
if (!warns.some(w => /run-log/.test(w))) fails.push("⑨ فشل الكتابة لم يترك أثراً في الكونسول (البند ١: .catch صامت — يجب console.warn)");
// ⑩ منع التكرار (البند أ): dedup_key ＋ mirror_ts · تشغيلة ثانية بنفس المرآة لا تُعيد الإرسال · تغيّر المرآة يُعيده
if (!res.hasDedupKey) fails.push("⑩ dedup_key لا يحمل mirror_ts");
if (!res.hasMirrorTs) fails.push("⑩ details.mirror_ts غائب");
if (res.afterRun2 !== res.afterRun1) fails.push(`⑩ تشغيلة ثانية بنفس المرآة كرّرت التسجيل (${res.afterRun1}→${res.afterRun2}) — درع الجلسة لا يعمل`);
if (!(res.afterMirrorChange > res.afterRun2)) fails.push(`⑩ تغيّر المرآة لم يُعِد التسجيل (${res.afterRun2}→${res.afterMirrorChange}) — mirror_ts لا يفكّ التكرار`);
if (fails.length) { console.error("✗ G-RUN-LOG:\n  " + fails.join("\n  ") + "\n  dump: " + JSON.stringify(res)); process.exit(1); }
console.log("✅ G-RUN-LOG: تصفير/سعر/نشر/عودة مسجَّلة بـbefore←after · المصفَّر أصلاً والكمية العاديّة لا تُسجَّل · الربط الدفعيّ صفّ/صنف · فشل الكتابة لا يُفشل run.");
