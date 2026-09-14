// ============================================================================
// G-THROUGH (دفعة ١أ) — «حارس النفاذ»: المخزن الموحّد نفسه ⇒ المخرج نفسه مهما انقسم مصدره.
//   تقسيم كود على فرعين بمجموع مطابق لا يغيّر شيئاً في الموحّد (لا كمية ولا سعر).
// يتحقّق عبر المسار الحقيقي loadInventoryFromDB (تجميع بـbranch_id) ⇒ mergeInventory:
//   (أ) كمية الكود المشترك = **مجموع** الفرعين (اتحاد حقيقي لا آخر-غالب).
//   (ب) سعر كود موجود في الفروع فقط = سعر **أقدم** فرع (ترتيب created_at).
//   (ج) فرع واحد (10) ≡ فرعان (6+4) في الموحّد — تطابق تامّ.
// --broken: يعكس ترتيب الفروع في التجميع ⇒ السعر يصير من الأحدث ⇒ (ب) يرسب.
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
  const SRC = "mergeBranches = invBranches.map(b => (byBr.get(b.id) || []).map(invRowToMerge)).filter(list => list.length);";
  if (!html.includes(SRC)) { console.error("✗ (--broken) لم أجد بناء mergeBranches لعكسه"); process.exit(2); }
  html = html.replace(SRC, "mergeBranches = invBranches.slice().reverse().map(b => (byBr.get(b.id) || []).map(invRowToMerge)).filter(list => list.length);");
}
function findChrome(){const c=["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",process.env.CHROME_PATH||"","/usr/bin/google-chrome-stable","/usr/bin/google-chrome"];for(const x of c)if(x&&existsSync(x))return x;for(const n of ["google-chrome-stable","google-chrome","chromium"])try{return execFileSync("bash",["-lc","command -v "+n]).toString().trim();}catch{}return"";}
const b = await puppeteer.launch({ executablePath: findChrome(), headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setRequestInterception(true); p.on("request", r => { const u = r.url(); if (u.startsWith("data:") || u.startsWith("about:")) return r.continue(); if (/^https?:/.test(u)) return r.abort(); r.continue(); });
await p.setContent(html, { waitUntil: "load" });
const res = await p.evaluate(async () => {
  const BA = "older-uuid", BB = "newer-uuid";   // A أقدم (created_at أصغر)
  const run = async (brRows, branchesMeta) => {
    db.inventory = { getAll: async t => (t === "warehouse_items" ? [] : brRows), getMeta: async () => ({}) };
    db.branches = { getAll: async () => branchesMeta };
    await loadInventoryFromDB();
    const m = mergeInventory(mergeWh, mergeBranches);
    const all = [...m.unified, ...m.noPrice];
    const rec = c => all.find(x => x.code === c) || null;
    return { lists: mergeBranches.length, y: rec("Y"), shared: rec("SH") };
  };
  // سيناريو الفرعين: كود SH مشترك (6+4) · كود Y في الفرعين بسعرين (أقدم=100 · أحدث=200)
  const twoBr = [
    { code: "SH", name: "مشترك", qty: 6, price_incl: 50, branch_id: BA },
    { code: "Y", name: "واي", qty: 3, price_incl: 100, branch_id: BA },
    { code: "SH", name: "مشترك", qty: 4, price_incl: 50, branch_id: BB },
    { code: "Y", name: "واي", qty: 7, price_incl: 200, branch_id: BB },
  ];
  const two = await run(twoBr, [{ id: BA, item_count: 2 }, { id: BB, item_count: 2 }]);
  // سيناريو الفرع الواحد المكافئ: نفس المجاميع (SH=10 · Y=10) بسعر أقدم فرع
  const oneBr = [
    { code: "SH", name: "مشترك", qty: 10, price_incl: 50, branch_id: BA },
    { code: "Y", name: "واي", qty: 10, price_incl: 100, branch_id: BA },
  ];
  const one = await run(oneBr, [{ id: BA, item_count: 2 }]);
  return { two, one };
});
await b.close();
const fails = [];
const { two, one } = res;
if (two.lists !== 2) fails.push(`تجميع الفروع أعطى ${two.lists} قائمة (متوقّع 2 — لم تُجمَّع بـbranch_id)`);
// (أ) كمية مشتركة = مجموع
if (!two.shared || Number(two.shared.qty) !== 10) fails.push(`كمية الكود المشترك ${two.shared && two.shared.qty} (متوقّع 10 = 6+4 مجموعاً)`);
if (!two.y || Number(two.y.qty) !== 10) fails.push(`كمية Y ${two.y && two.y.qty} (متوقّع 10 = 3+7)`);
// (ب) سعر = أقدم فرع
if (!two.y || Number(two.y.incl) !== 100) fails.push(`سعر Y ${two.y && two.y.incl} (متوقّع 100 = سعر أقدم فرع، لا 200)`);
// (ج) النفاذ: فرع واحد ≡ فرعان
if (!one.y || Number(one.y.qty) !== 10 || Number(one.y.incl) !== 100) fails.push(`الفرع الواحد المكافئ أعطى Y=${one.y && one.y.qty}/${one.y && one.y.incl} (متوقّع 10/100)`);
if (two.y && one.y && (Number(two.y.qty) !== Number(one.y.qty) || Number(two.y.incl) !== Number(one.y.incl))) fails.push("انقسام المصدر غيّر المخرج (فرعان ≠ فرع واحد مكافئ) — انتهاك النفاذ");
if (BROKEN) {
  if (fails.length) { console.log("✅ (--broken) G-THROUGH مسك عكس الترتيب: " + fails[0]); process.exit(0); }
  console.error("✗ (--broken) لم يرسب بعد عكس ترتيب الفروع — لا أسنان."); process.exit(1);
}
if (fails.length) { console.error("✗ G-THROUGH:\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`✅ G-THROUGH: كمية مشتركة مجموعة (10) · سعر من أقدم فرع (100) · فرعان ≡ فرع واحد مكافئ — انقسام المصدر لا يغيّر المخرج.`);
