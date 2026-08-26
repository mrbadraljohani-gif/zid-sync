// ============================================================================
// حارس التباين (WCAG 4.5:1 · 3:1 للنص الكبير) — على الصفحة الحقيقية بالـCSS الفعلي.
// يقيس لون كل نصّ مقابل خلفيته الفعّالة (تركيب طبقات rgba فوق --bg، وأسوأ محطة
// في التدرّجات) عبر مشاهد (صفحات/حالات) × عرضين (360/1200). داكن فقط (أُزيل الفاتح).
//
// تشغيل:  node tests/perf/contrast-guard.mjs
//         node tests/perf/contrast-guard.mjs --broken   (يحقن نصّاً منخفض التباين ⇒ يجب أن يرسب)
//
// ⚠️ منهجية CLAUDE.md: الاختبار الذي لا يرسب على المعطوب لا يثبت شيئاً.
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const html = readFileSync(join(root, "index.html"), "utf8").replace(/\r\n/g, "\n");
const BROKEN = process.argv.includes("--broken");
const WIDTHS = [360, 1200];

function findChrome() {
  const c = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome-stable", "/usr/bin/google-chrome", process.env.CHROME_PATH || ""];
  for (const x of c) if (x && existsSync(x)) return x;
  for (const n of ["google-chrome-stable", "google-chrome", "chromium"]) try { return execFileSync("bash", ["-lc", "command -v " + n]).toString().trim(); } catch {}
  return "";
}

// ---- fixture لملء صفحة النتيجة (نفس نهج المشغّل السلوكي) — يُظهر البطاقات/الشارات/التنبيهات الحقيقية ----
const HEADER = ["sku", "name_ar", "name_en", "quantity", "price", "barcode", "sale_price", "published", "has_variants", "parent_ref"];
const Z = (sku, qty, price, o = {}) => [sku, "زد " + sku, sku, qty, price, "", o.sale || "", o.pub || "Yes", o.hv || "No", o.par || ""];
const WH = (code, qty, incl) => ({ "رقم الصنف": code, "الكمية": qty, "سعر البيع شامل الضريبة": incl, "سعر البيع قبل الضريبة": incl, "اسم الصنف": "مخزن " + code, "باركود المستودع": "" });
const CFG = {
  stData: { sheetName: "P", header: HEADER, rows: [HEADER, Z("A1", "5", "100"), Z("SC1", "10", "100", { sale: "200" }), Z("P1", "3", "1000", { hv: "Yes" }), Z("P1.1", "0", "1000", { par: "P1" }), Z("W1", "2", "300"), Z("N1", "7", "80"), Z("L1", "2", "300")] },
  whRows: [WH("A1", 9, 100), WH("SC1", 8, 150), WH("P1.1", 0, 1000), WH("W1", 4, 300)],
  lastMerge: { unified: [{ code: "A1" }, { code: "SC1" }, { code: "P1.1" }, { code: "W1" }], noPrice: [] },
  manualMap: { L1: "WLX" }, waiting: [{ skuN: "W1", sku: "W1" }], ignored: [], history: ["L1"],
  opts: { price: "incl", absent: "keep", lowzero: "off", split: "equal" }, uploaded: false,
};

// ---- المقياس داخل الصفحة ----
const MEASURE = () => {
  const L = (r, g, b) => { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const parse = s => { const m = String(s).match(/rgba?\(([\d.,\s%]+)\)/i); if (!m) return null; const p = m[1].split(",").map(x => parseFloat(x)); return { r: p[0], g: p[1], b: p[2], a: p[3] == null || isNaN(p[3]) ? 1 : p[3] }; };
  const comp = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
  const base = parse(getComputedStyle(document.documentElement).getPropertyValue("--bg")) || { r: 20, g: 17, b: 12, a: 1 };
  const OP = 0.985;   // عتبة «مُعتِم» (يُغطّي ما تحته)
  // الخلفية الفعّالة: تركيب الطبقات فوق --bg. المُعتِم يستبدل · الشفّاف يُركَّب · التدرّج = متوسّط محطّاته المركّبة (أقرب للبكسل المرسوم من أسوأ محطّة).
  function effBg(el) {
    const chain = []; let n = el;
    while (n && n !== document.documentElement) { chain.push(n); n = n.parentElement; }
    chain.reverse();
    let cur = { ...base, a: 1 };
    for (const e of chain) {
      const cs = getComputedStyle(e);
      const bc = parse(cs.backgroundColor);
      if (bc && bc.a >= OP) cur = { r: bc.r, g: bc.g, b: bc.b, a: 1 };
      else if (bc && bc.a > 0) cur = comp(bc, cur);
      const bi = cs.backgroundImage;
      if (bi && bi !== "none") {
        const stops = (bi.match(/rgba?\([\d.,\s%]+\)/gi) || []).map(parse).filter(Boolean);
        if (stops.length) {
          let R = 0, G = 0, B = 0;
          for (const s of stops) { const o = s.a >= OP ? s : comp(s, cur); R += o.r; G += o.g; B += o.b; }
          cur = { r: R / stops.length, g: G / stops.length, b: B / stops.length, a: 1 };
        }
      }
    }
    return cur;
  }
  const bad = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const txt = (node.nodeValue || "").trim(); if (!txt) continue;
    const el = node.parentElement; if (!el) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || parseFloat(cs.opacity) === 0) continue;
    let p = el, off = false;
    while (p && p !== document.body) { const pcs = getComputedStyle(p); if (pcs.display === "none" || pcs.visibility === "hidden") { off = true; break; } p = p.parentElement; }
    if (off) continue;
    const rect = el.getBoundingClientRect(); if (rect.width < 1 || rect.height < 1) continue;
    const fg = parse(cs.color); if (!fg) continue;
    if (fg.a < 0.05 || (cs.webkitTextFillColor && parse(cs.webkitTextFillColor) && parse(cs.webkitTextFillColor).a < 0.05)) continue;   // نصّ شفّاف (background-clip:text تدرّج) — يُقاس بصرياً لا حسابياً
    const bg = effBg(el);
    const fgc = fg.a < 1 ? comp(fg, bg) : fg;
    const lf = L(fgc.r, fgc.g, fgc.b), lb = L(bg.r, bg.g, bg.b);
    const ratio = (Math.max(lf, lb) + 0.05) / (Math.min(lf, lb) + 0.05);
    const sz = parseFloat(cs.fontSize), bold = (parseInt(cs.fontWeight) || 400) >= 700;
    const large = sz >= 24 || (sz >= 18.66 && bold);
    const thr = large ? 3 : 4.5;
    if (ratio < thr - 0.005) bad.push({ t: txt.slice(0, 28), color: cs.color, ratio: +ratio.toFixed(2), thr, cls: (el.className && el.className.toString ? el.className.toString() : el.tagName).slice(0, 40) });
  }
  // إزالة التكرار (نفس النص/الصنف/النسبة)
  const uniq = []; const seen = new Set();
  for (const b of bad) { const k = b.cls + "|" + b.ratio + "|" + b.t; if (!seen.has(k)) { seen.add(k); uniq.push(b); } }
  return uniq;
};

// ---- تهيئة الصفحة (Supabase/XLSX وهميان، الشبكة محجوبة، خدمة localhost) ----
const SETUP = (cfg) => {
  const mk = () => { const c = { select() { return c; }, upsert: async () => ({ error: null }), delete() { return c; }, insert: async () => ({ error: null }), eq: async () => ({ error: null }), in: async () => ({ error: null }), order() { return c; }, range: async () => ({ data: [], error: null }) }; return c; };
  try { sb = { from: mk, auth: { getSession: async () => ({ data: { session: null } }) } }; dbOnline = true; } catch (e) {}
  window.XLSX = { utils: { aoa_to_sheet: () => ({}), book_new: () => ({}), book_append_sheet: () => {}, sheet_to_json: () => [] }, write: () => new Uint8Array(0), read: () => ({}) };
  stData = cfg.stData; whRows = cfg.whRows; lastMerge = cfg.lastMerge;
  manualMap = cfg.manualMap || {};
  waitingSet = new Set((cfg.waiting || []).map(w => w.skuN));
  try { waitingMeta = new Map((cfg.waiting || []).map(w => [w.skuN, { sku: w.sku, name: "", missed: 0, lastSeen: null }])); } catch (e) {}
  ignoredSet = new Set(cfg.ignored || []); matchedHistory = new Set(cfg.history || []);
  try { priceOffsets = {}; opts = Object.assign(opts, cfg.opts || {}); whWasUploaded = false; } catch (e) {}
  try { if (typeof processWaitingOnUpload === "function") processWaitingOnUpload(); } catch (e) {}
  try { run(false); } catch (e) {}
  try { hideLogin && hideLogin(); } catch (e) {}
};

const exe = findChrome();
if (!exe) { console.error("✗ لا Chrome. اضبط CHROME_PATH."); process.exit(2); }

const server = createServer((req, res) => { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(html); });
await new Promise(r => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const browser = await puppeteer.launch({ executablePath: exe, headless: "new", args: ["--no-sandbox", "--disable-gpu"] });
const fails = [];
try {
  // مشاهد موسّعة — تغطّي المناطق التي تعيش فيها القيم المثبّتة الـ257 فعلاً
  const SCENES = [
    { id: "home", prep: "goPage('home')" },                                                    // نتيجة: KPI · شريط موحّد · بطاقات كاملة · صفوف خفيفة · تنبيهات
    { id: "updated", prep: "goPage('home'); currentFilter='updated'; renderDetail();" },          // جدول «تم تحديثه» + شاراته (pub/reap/zero)
    { id: "explorer", prep: "goPage('home'); currentFilter='explorer'; renderDetail();" },        // المستكشف الشامل + شاراته + فلاتره
    { id: "inventory", prep: "goPage('inventory')" },                                            // المخزون: بطاقات الحالة · الدمج · KPI · بصمة · سجل
    { id: "options", prep: "goPage('options')" },
    { id: "toast", prep: "goPage('home'); showToast('توست اختبار — رسالة تأكيد نسبياً طويلة لقياس التباين على خلفية التوست');" },
    { id: "notif", prep: "goPage('home'); try{ toggleActivityPanel(); }catch(e){}" },             // لوحة الإشعارات المنبثقة
    { id: "ghmenu", prep: "goPage('inventory'); try{ openGhMenu(); }catch(e){}" },                 // قائمة الحفظ في الريبو المنبثقة (في صفحة المخزون)
    { id: "login", prep: "try{ showLogin&&showLogin(); }catch(e){}" },
    { id: "recover", prep: "try{ showRecover(); }catch(e){}" },                                    // نموذج استرجاع كلمة المرور
    { id: "offset", prep: "goPage('home'); try{ openOffset('A1'); }catch(e){}" },   // لوحة زيادة سعر المتغيّر (A1 في lastUpdated)
    { id: "combofloat", prep: "goPage('home'); (function(){ var i=document.getElementById('s-u0'); if(i){ i.value='مخزن'; try{comboOpen('u0')}catch(e){} try{comboSearch('u0')}catch(e){} } })();" },   // قائمة البحث الهجين العائمة (bt-results-float)
  ];
  for (const w of WIDTHS) {
    for (const sc of SCENES) {
      const page = await browser.newPage();
      await page.setViewport({ width: w, height: 900, deviceScaleFactor: 1 });
      await page.setRequestInterception(true);
      page.on("request", req => { const u = req.url(); if (u.startsWith("http://127.0.0.1:" + port)) return req.continue(); if (/^https?:/.test(u)) return req.abort(); req.continue(); });
      await page.goto("http://127.0.0.1:" + port + "/", { waitUntil: "load" });
      await page.evaluate(SETUP, CFG);
      await page.evaluate(p => { try { (0, eval)(p); } catch (e) {} }, sc.prep);
      if (BROKEN && sc.id === "home") await page.evaluate(() => { const s = document.createElement("style"); s.textContent = ".mc-sub, .mc-sub b { color: #4b4b52 !important; }"; document.head.appendChild(s); });
      await new Promise(r => setTimeout(r, 160));
      const bad = await page.evaluate(MEASURE);
      if (bad.length) { for (const b of bad) fails.push(`@${w}px [${sc.id}] «${b.t}» نسبة ${b.ratio}/${b.thr} · ${b.color} · ${b.cls}`); }
      console.log(`  @${w}px · ${sc.id} · مخالفات=${bad.length}`);
      await page.close();
    }
  }
} finally { await browser.close(); server.close(); }

if (BROKEN) {
  if (fails.length) { console.log(`\n✅ تحقّق ذاتي: الحارس رسب على النصّ منخفض التباين (${fails.length} مخالفة) — كما يجب.`); process.exit(0); }
  console.error("\n✗ خلل منهجي: الحارس لم يرسب على المعطوب!"); process.exit(1);
}
if (fails.length) { console.error(`\n✗ ${fails.length} مخالفة تباين (<4.5:1 · <3:1 كبير):\n` + fails.slice(0, 60).map(f => "  ✗ " + f).join("\n")); process.exit(1); }
console.log("\n✅ لا مخالفات تباين — كل النصوص ≥ العتبة عبر المشاهد × العرضين.");
