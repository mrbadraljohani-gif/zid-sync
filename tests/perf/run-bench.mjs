// ============================================================================
// مقياس أداء قائمة «بدون ربط» الموحّدة (الدفعة ب-١) — headless بلا puppeteer.
// يستعمل Google Chrome النظامي عبر --headless=new --dump-dom (لا تنزيل Chromium،
// لا node_modules). صفحة تقيس نفسها تزامنياً وتكتب JSON في #R، والسائق يقرأه.
//
// تشغيل:  node tests/perf/run-bench.mjs            (تقرير)
//         node tests/perf/run-bench.mjs --assert   (يرسب إن تجاوز السقوف)
//
// يقيس تزامنياً (زمن حائط حقيقي — لا وقت افتراضي): بناء السلسلة · حقن+إعادة
// تخطيط (offsetHeight) · تمرير 60 خطوة كلٌّ يفرض إعادة تخطيط · عدد العقد · بايتات.
// ⚠️ فكّ ديكود الصور غير متزامن فلا يُقاس هنا (الصور أصلاً loading=lazy + كثير 📦):
//    قياسه يتطلّب CDP/Performance (puppeteer). القرار الهيكلي (عقد/تخطيط) هو الفارق.
// ============================================================================
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const html = readFileSync(join(root, "index.html"), "utf8").replace(/\r\n/g, "\n");
const css = (html.match(/<style>([\s\S]*?)<\/style>/) || [, ""])[1];   // نفس CSS الحقيقي (تخطيط أمين)

function findChrome() {
  const cands = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium", "/usr/bin/chromium-browser",
    process.env.CHROME_PATH || "",
  ];
  for (const c of cands) { try { if (c && existsSync(c)) return c; } catch {} }
  // آخر محاولة: which
  for (const n of ["google-chrome-stable", "google-chrome", "chromium", "chromium-browser"]) {
    try { return execFileSync("bash", ["-lc", "command -v " + n]).toString().trim() || ""; } catch {}
  }
  return "";
}

// ---- كود الصفحة (يعمل داخل Chrome) — يبني ويقيس حسب ?s=SCENARIO ----
const PAGE_JS = String.raw`
const P = new URLSearchParams(location.search);
const S = P.get('s') || 'baseline300';
const IMG = i => (i % 3 === 0)   // ثلث بلا صورة (📦) — كواقع منتجات زد
  ? '<span class="thumb thumb-ph">📦</span>'
  : '<span class="thumb"><img src="https://cdn.example.com/products/thumb_'+i+'.jpg" loading="lazy" referrerpolicy="no-referrer" alt=""></span>';
// بطاقة كاملة مطابِقة لبنية batchCardHTML (صورة · نصّان · combo input · checkbox · زرّان)
function fullCard(i){
  return '<div class="mcard batch-card'+(i%7===0?' lost':'')+'">'
    + '<div class="mc-zid"><span class="mc-tag zid">ZID PRODUCT</span>'
    +   '<div class="mc-row">'+IMG(i)+'<div class="mc-txt">'
    +     '<div class="mc-name">جلسة الفخامة مع تكاية م75 لون '+i+'</div>'
    +     '<div class="mc-sku">SKU: <span dir="ltr">4510'+(70+i)+'.'+(i%4)+'</span>'+(i%7===0?'<span class="lost-tag">🔗 سبق ربطه</span>':'')+'</div>'
    +     '<div class="mc-sub">سعر زد: 125 ر.س · الكمية: <b>'+(i%9)+'</b></div>'
    +   '</div></div></div>'
    + '<div class="mc-wh"><span class="mc-tag whs">WAREHOUSE</span>'
    +   '<div id="whd-'+i+'"><div class="mc-name">مباخر مكس '+i+'</div>'
    +     '<div class="mc-sku">باركود المستودع: <span dir="ltr">4512'+(100+i)+'</span></div>'
    +     '<div class="mc-sub">سعر المستودع: 30 ر.س · الكمية: <b>'+(i%20)+'</b></div></div>'
    +   '<div class="bt-combo"><input class="bt-search" placeholder="غيّر/ابحث في المستودع بالكود أو الاسم…"></div>'
    + '</div>'
    + '<div class="mc-actions">'
    +   '<label class="bt-card-chk"><input type="checkbox" checked><span>اعتماد</span></label>'
    +   '<button class="mc-btn wait">⏳ غير متوفر</button>'
    +   '<button class="mc-btn ignore">✕ تجاهل</button>'
    + '</div></div>';
}
// صفّ خفيف لقرار متّخذ (خيار أ): بلا combo/صورة/checkbox — شارة حالة ＋ إجراء واحد
function lightRow(i){
  return '<div class="mcard batch-card light">'
    + '<div class="mc-zid"><span class="mc-tag zid">ZID</span>'
    +   '<div class="mc-row"><div class="mc-txt">'
    +     '<div class="mc-name">صنف مُدار '+i+' <span class="cat-badge cat-mng">✓ مُدار</span></div>'
    +     '<div class="mc-sku">SKU: <span dir="ltr">4510'+(70+i)+'</span></div>'
    +   '</div></div></div>'
    + '<div class="mc-actions"><button class="mc-btn">↩ تراجع</button></div></div>';
}
function build(){
  if (S === 'baseline300') return Array.from({length:300},(_,i)=>fullCard(i)).join('');
  if (S === 'eager300')    return Array.from({length:300},(_,i)=>fullCard(i)).join('').replace(/loading="lazy"/g,'loading="eager"');
  if (S === 'mixed')       return Array.from({length:36},(_,i)=>fullCard(i)).join('') + Array.from({length:264},(_,i)=>lightRow(i)).join('');
  if (S === 'progressive') return Array.from({length:50},(_,i)=>fullCard(i)).join('');   // دفعة أولى فقط
  if (S === 'virtual')     return Array.from({length:40},(_,i)=>fullCard(i)).join('');    // نافذة مرئية فقط
  return '';
}
const host = document.getElementById('host');
const t0 = performance.now();
const s = build();
const t1 = performance.now();
host.innerHTML = s;
void host.offsetHeight;                 // فرض إعادة تخطيط
const t2 = performance.now();
const nodes = host.querySelectorAll('*').length;
const inputs = host.querySelectorAll('input').length;
const imgs = host.querySelectorAll('img').length;
// تمرير: 60 خطوة، كلٌّ يضبط scrollTop ويقرأ خاصية تخطيط (يفرض reflow) — يقيس كلفة التمرير
const steps = 60, max = Math.max(1, host.scrollHeight - host.clientHeight);
const sc0 = performance.now();
for (let k=0;k<steps;k++){ host.scrollTop = (max*k/steps)|0; const c=host.children[Math.min(host.children.length-1,k)]; if(c) void c.offsetTop; }
const sc1 = performance.now();
const hoverflow = document.documentElement.scrollWidth > window.innerWidth + 1;   // تجاوز أفقي عند العرض الفعلي
// بروكسي تجاوز أفقي عند 360/390 (Chrome headless يثبّت innerWidth≥500، فنقيس بحاوية ثابتة —
// ⚠️ قواعد @media للـviewport لا تُطبَّق هنا؛ الحارس الأمين للعرض الحقيقي يتطلّب puppeteer-core/CDP).
function proxyOverflow(px){ host.style.width=px+'px'; void host.offsetHeight; const o=host.scrollWidth>host.clientWidth+1; host.style.width=''; return o; }
const hoverflow360_proxy = proxyOverflow(360);
const hoverflow390_proxy = proxyOverflow(390);
const out = {
  s: S, w: window.innerWidth,
  build_ms:+(t1-t0).toFixed(2),
  inject_ms:+(t2-t1).toFixed(2),
  time_to_laid_out_ms:+t2.toFixed(2),   // من بدء الملاحة حتى اكتمال التخطيط (تقريب «الرسم الأول»)
  scroll_ms:+(sc1-sc0).toFixed(2),
  scroll_per_step_ms:+((sc1-sc0)/steps).toFixed(3),
  nodes, inputs, imgs,
  html_kb:+(s.length/1024).toFixed(1),
  hoverflow, hoverflow360_proxy, hoverflow390_proxy
};
document.body.innerHTML = '';
document.body.setAttribute('data-r', btoa(unescape(encodeURIComponent(JSON.stringify(out)))));   // base64: بلا هروب/التفاف
`;

function pageHTML(scenario) {
  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><style>${css}
  #host{height:640px;overflow:auto;}</style></head><body class="app-shell">
  <div id="host" class="mcards"></div>
  <script>${PAGE_JS.replace("location.search", JSON.stringify("?s=" + scenario) + "/*sw*/")}</script>
  </body></html>`;
}

const CHROME = findChrome();
if (!CHROME) { console.error("✗ لم يُعثر على Google Chrome/Chromium. ثبّته أو اضبط CHROME_PATH."); process.exit(2); }

const dir = mkdtempSync(join(tmpdir(), "zidbench-"));
const SCENARIOS = ["baseline300", "eager300", "mixed", "progressive", "virtual"];
const WIDTHS = [500, 1200];   // Chrome headless يثبّت innerWidth≥500؛ نبلّغ العرض الفعلي (لا 360/390 الوهميين)

const rows = [];
for (const w of WIDTHS) {
  for (const s of SCENARIOS) {
    const f = join(dir, `bench-${s}-${w}.html`);
    writeFileSync(f, pageHTML(s));
    let dom = "";
    try {
      dom = execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--no-sandbox",
        "--allow-file-access-from-files", "--hide-scrollbars", `--window-size=${w},840`,
        "--dump-dom", "file://" + f], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 60000, stdio: ["ignore", "pipe", "ignore"] });
    } catch (e) { console.error(`✗ فشل تشغيل Chrome لـ ${s}@${w}: ${e.message}`); process.exit(2); }
    const m = dom.match(/data-r="([^"]*)"/);
    if (!m) { console.error(`✗ لا نتيجة لـ ${s}@${w} (الصفحة لم تقِس).`); process.exit(2); }
    rows.push(JSON.parse(Buffer.from(m[1], "base64").toString("utf8")));
  }
}

// ---- طباعة جدول ----
const cols = ["s", "w", "nodes", "inputs", "imgs", "html_kb", "inject_ms", "time_to_laid_out_ms", "scroll_ms", "hoverflow360_proxy"];
const W = { s: 13, w: 6, nodes: 7, inputs: 8, imgs: 6, html_kb: 9, inject_ms: 11, time_to_laid_out_ms: 20, scroll_ms: 10, hoverflow360_proxy: 18 };
const pad = (v, n) => String(v).padEnd(n);
console.log("\n📊 مقياس قائمة «بدون ربط» — Chrome headless (زمن حائط حقيقي، ms)\n");
console.log(cols.map(c => pad(c, W[c])).join("| "));
console.log(cols.map(c => "-".repeat(W[c])).join("+-"));
for (const r of rows) console.log(cols.map(c => pad(r[c], W[c])).join("| "));

// ---- تأكيدات اختيارية (تُشدَّد في ب-٢ بعد اعتماد الحلّ) ----
if (process.argv.includes("--assert")) {
  const fails = [];
  const get = (s, w) => rows.find(r => r.s === s && r.w === w);
  // سلامة تنفيذية عامة + رتب متوقّعة (لا سقوف نهائية بعد — تُضبط في ب-٢):
  for (const w of WIDTHS) {
    const base = get("baseline300", w), mixed = get("mixed", w), virt = get("virtual", w);
    if (!(virt.nodes < mixed.nodes && mixed.nodes < base.nodes)) fails.push(`ترتيب العقد غير متوقّع @${w}`);
    if (base.hoverflow) fails.push(`تجاوز أفقي في baseline @${w}`);
    // ملاحظة: hoverflow360_proxy إعلامي فقط (غير أمين: بلا @media) — الحارس الأمين يأتي في ب-٢ عبر puppeteer-core.
  }
  if (fails.length) { console.error("\n✗ فشل التأكيد:\n" + fails.map(f => "  ✗ " + f).join("\n")); process.exit(1); }
  console.log("\n✅ تأكيدات ب-١ سليمة.");
}
