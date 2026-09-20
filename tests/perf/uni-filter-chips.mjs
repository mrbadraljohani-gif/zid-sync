// ============================================================================
// G-UNI-CHIPS — شرائح فلتر «يحتاج ربط» قابلة للنقر (all/need/nocand/absent/waiting):
//   ① النقر على شريحة يفلتر القسم المعروض فعلاً (setBtMode ⇒ renderUnifiedList).
//   ② الشريحة النشطة تُبرَز (class .on)؛ الصفرية معطّلة (disabled) لا مخفيّة.
//   ③ «بلا مرشّح» يعرض بطاقات «يحتاج قرار» بلا مرشّح (best=null) فقط.
//   ④ waitAllShown يضع كل المعروض «غير متوفر» دفعةً (bulkUpsert + waitingSet).
// --broken: يجعل setBtMode لا يفلتر (btMode ثابت "all") ⇒ العدّ لا يتغيّر ⇒ يرسب.
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import puppeteer from "puppeteer-core";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BROKEN = process.argv.includes("--broken");
let html = readFileSync(process.env.HTML_PATH || join(root, "index.html"), "utf8").replace(/\r\n/g, "\n");
if (BROKEN) {
  const ANCHOR = 'function setBtMode(m) {\n  btMode = (btMode === m && m !== "all") ? "all" : m;';
  if (!html.includes(ANCHOR)) { console.error("✗ (--broken) لم أجد setBtMode"); process.exit(2); }
  html = html.replace(ANCHOR, 'function setBtMode(m) {\n  btMode = "all";');
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
const errs = []; p.on("pageerror", e => errs.push(String(e)));
const server = createServer((req, res) => { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(html); });
await new Promise(r => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("http://127.0.0.1:" + port)) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.goto("http://127.0.0.1:" + port + "/", { waitUntil: "load" });
const res = await p.evaluate(async () => {
  try { window.confirm = () => true; } catch (e) {}
  dbOnline = true; myRole = "owner"; famIndex = null; waitingSet = new Set(); waitingMeta = new Map();
  let bulkRows = null;
  db.waiting = { bulkUpsert: async (rows) => { bulkRows = rows; }, upsert: async () => {} };
  db.activity = { insert: async () => {} };
  // بطاقتان «يحتاج قرار»: واحدة بمرشّح، واحدة بلا مرشّح؛ ＋ صنف انتظار (light)
  batchData = {
    green: [], yellow: [
      { z: { sku: "Z1", skuN: "Z1", qty: 5, price: 100, name: "بمرشّح", img: "", published: "Yes" }, best: { code: "W1", name: "w" }, scored: [{ code: "W1" }], isAbsent: false, wasLinked: false },
    ], red: [
      { z: { sku: "Z2", skuN: "Z2", qty: 5, price: 100, name: "بلا مرشّح", img: "", published: "Yes" }, best: null, scored: [], isAbsent: false, wasLinked: false },
    ],
    lostCount: 0, absentCount: 0, needCount: 2, absentCount: 0,
  };
  lastUnmatchedRaw = [{ sku: "Z9", skuN: "Z9", qty: 0, name: "منتظر", img: "", published: "No" }];
  waitingSet.add(normCode("Z9"));   // ⇒ managed (qty 0)
  // المسار الحقيقي: currentFilter="unmatched" ثم renderDetail (كما يستدعيه setBtMode)
  currentFilter = "unmatched"; activeCard = "unmatched";
  const drawReal = () => { renderDetail(); flushUnified && flushUnified(); };
  const un = () => document.getElementById("detailTable");
  const cards = () => un().querySelectorAll("#unBody .batch-card").length;
  const lights = () => un().querySelectorAll("#unBody .uni-light").length;
  const activeChip = () => { const el = un().querySelector(".uni-chip.on"); return el ? el.textContent.replace(/\s+/g, " ").trim() : ""; };

  btMode = "all"; drawReal();
  const allCards = cards(), allLights = lights();
  const absDisabled = !!un().querySelector('.uni-chip.abs[disabled]');   // absentN=0 ⇒ معطّلة
  const ncEnabled = !un().querySelector('.uni-chip.nc[disabled]');       // nocand=1 ⇒ فاعلة

  setBtMode("nocand"); flushUnified && flushUnified();
  const ncCards = cards(), ncLights = lights(), ncActive = activeChip();
  const ncName = un().querySelector("#unBody .batch-card")?.textContent || "";

  setBtMode("waiting"); flushUnified && flushUnified();
  const waitCards = cards(), waitLights = lights();

  setBtMode("need"); flushUnified && flushUnified();
  const needCards = cards();

  // ④ bulk «غير متوفر للمعروض» على nocand
  setBtMode("nocand"); flushUnified && flushUnified();
  waitingSet = new Set(); bulkRows = null;
  await waitAllShown();
  return {
    errs: [], allCards, allLights, absDisabled, ncEnabled, ncCards, ncLights, ncActive, ncName,
    waitCards, waitLights, needCards, bulkCount: bulkRows ? bulkRows.length : 0, bulkSku: bulkRows && bulkRows[0] && bulkRows[0].zid_sku,
  };
});
await b.close(); server.close();
const fails = [];
if (errs.length) fails.push("أخطاء JS: " + errs.join(" | "));
if (res.allCards !== 2) fails.push("«الكل»: توقّعت بطاقتين، وجدت " + res.allCards);
if (res.allLights !== 1) fails.push("«الكل»: توقّعت صفّاً خفيفاً واحداً، وجدت " + res.allLights);
if (!res.absDisabled) fails.push("② شريحة «غائب» الصفرية غير معطّلة");
if (!res.ncEnabled) fails.push("② شريحة «بلا مرشّح» غير الصفرية معطّلة خطأً");
if (res.ncCards !== 1) fails.push("③ «بلا مرشّح»: توقّعت بطاقة واحدة (بلا best)، وجدت " + res.ncCards);
if (res.ncLights !== 0) fails.push("③ «بلا مرشّح» أظهر صفوفاً خفيفة (يجب لا)");
if (!res.ncName.includes("بلا مرشّح")) fails.push("③ بطاقة «بلا مرشّح» ليست الصنف الصحيح: " + res.ncName);
if (!res.ncActive.includes("بلا مرشّح")) fails.push("② الشريحة النشطة ليست «بلا مرشّح»: " + res.ncActive);
if (res.waitCards !== 0 || res.waitLights !== 1) fails.push("«غير متوفر»: توقّعت 0 بطاقة + صفّاً خفيفاً، وجدت " + res.waitCards + "/" + res.waitLights);
if (res.needCards !== 2) fails.push("«يحتاج ربط»: توقّعت بطاقتين، وجدت " + res.needCards);
if (res.bulkCount !== 1) fails.push("④ waitAllShown على nocand لم يضع صنفاً واحداً (وجد " + res.bulkCount + ")");
if (res.bulkSku !== "Z2") fails.push("④ waitAllShown وضع الصنف الخطأ: " + res.bulkSku + " (توقّعت Z2 بلا مرشّح)");
if (BROKEN) {
  if (fails.length) { console.log("✅ (--broken) G-UNI-CHIPS مسك العطل: " + fails[0]); process.exit(0); }
  console.error("✗ (--broken) لم يرسب بعد تثبيت btMode='all' — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ G-UNI-CHIPS:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("✅ G-UNI-CHIPS: الشرائح تفلتر (need/nocand/absent/waiting) ＋ النشطة مُبرَزة ＋ الصفرية معطّلة ＋ «بلا مرشّح» يعزل بلا best ＋ waitAllShown دفعيّ.");
