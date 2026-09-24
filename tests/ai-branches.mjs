// ============================================================================
// G-AI-BRANCHES — قيمة الموقع الجديدة «branches» (كل الفروع بلا المستودع) — القيمة، لا الشكل:
//   ① location="branches" ⇒ قيمة المخزون = الفروع فقط (المستودع مستبعَد) · لا يتسرّب wh.
//   ② «all» يبقى يشمل المستودع (قيمة المخزون = wh + الفروع).
//   ③ 🚨 صفر انحدار: قيَم المخزون لـ all/wh/<فرع> **لم تتغيّر** بإضافة branches.
//   ④ 🚨 المبيعات ثابتة: sales(branches) == sales(all) (كلاهما فروع، wh مستبعَد أصلاً) — لا رقم مبيعات تغيّر.
//   ⑤ scopeLabel(branches) صريح «بلا المستودع» ولا وسم «(يشمل المستودع)» على مقياسه · scopeLabel(all,inv) «كل المواقع».
// --broken: يجعل branches يشمل wh في invLocsShown ⇒ قيمة مخزون الفروع تنتفخ بالمستودع ⇒ يرسب (تسرّب wh).
// ============================================================================
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const AIDIR = join(root, "supabase", "functions", "ai-assistant");
const BROKEN = process.argv.includes("--broken");

let computeSrc = join(AIDIR, "sales_compute.mjs"), intentsSrc = join(AIDIR, "intents.mjs");
const tmps = [];
if (BROKEN) {
  let s = readFileSync(computeSrc, "utf8");
  const A = 'const invLocsShown = location === "all" ? locsAll : (location === "branches" ? branchLocs : [location]);';
  if (!s.includes(A)) { console.error("✗ (--broken) لم أجد invLocsShown"); process.exit(2); }
  s = s.replace(A, 'const invLocsShown = location === "all" ? locsAll : (location === "branches" ? locsAll : [location]);');   // تسرّب wh إلى branches
  computeSrc = join(AIDIR, "_broken_compute.mjs"); writeFileSync(computeSrc, s); tmps.push(computeSrc);
  let it = readFileSync(intentsSrc, "utf8").replace('from "./sales_compute.mjs"', 'from "./_broken_compute.mjs"');
  intentsSrc = join(AIDIR, "_broken_intents.mjs"); writeFileSync(intentsSrc, it); tmps.push(intentsSrc);
}
const { computeScope, scopeLabel } = await import(pathToFileURL(computeSrc).href).then(async (m) => ({ computeScope: m.computeScope, scopeLabel: (await import(pathToFileURL(intentsSrc).href)).scopeLabel }));
const { runIntent } = await import(pathToFileURL(intentsSrc).href);

// تجهيزة: wh + فرعان. قيَم مخزون معروفة: wh=10*100=1000 · az=5*20=100 · kh=8*30=240
const branches = [{ id: "az", name: "العزيزية" }, { id: "kh", name: "الخضرة" }];
const now = new Date().toISOString();
const stock = [
  { location: "wh", sku: "W", name: "W", qty: 10, price_incl: 100, price_excl: 87 },
  { location: "az", sku: "A", name: "A", qty: 5, price_incl: 20, price_excl: 17 },
  { location: "kh", sku: "K", name: "K", qty: 8, price_incl: 30, price_excl: 26 },
];
const mv = (loc, q, v) => ({ kind: "estimated_sale", delta: -q, value_est: v, unit_price_incl: v / q, unit_price_excl: Math.round(v / q / 1.15), location: loc, sku: loc + "s", sku_name: loc, upload_id: "U_" + loc, captured_at: now, period_days: 5 });
const movements = [mv("az", 3, 300), mv("kh", 4, 400), mv("wh", 5, 500)];   // wh حركة سحب — مستبعَدة من المبيعات
const uploads = ["az", "kh", "wh"].map((l) => ({ id: "U_" + l, location: l, captured_at: now, suspect: false }));
const data = { movements, uploads, stock, branches };
const nowMs = Date.parse(now);
const inv = (loc) => Math.round(computeScope({ ...data, period: "all", location: loc, nowMs }).invScope.inv);
const sales = (loc) => Math.round(computeScope({ ...data, period: "all", location: loc, nowMs }).scope.val);

const WH = 1000, AZ = 100, KH = 240;
const invAll = inv("all"), invBranches = inv("branches"), invWh = inv("wh"), invAz = inv("az");
const salesAll = sales("all"), salesBranches = sales("branches");
// وسم/نوت مقياس المخزون لـbranches
const invResBranches = runIntent("inventory_value", { params: { period: "all", location: "branches" }, data, nowMs, observedDays: 5 });
const invResAll = runIntent("inventory_value", { params: { period: "all", location: "all" }, data, nowMs, observedDays: 5 });
const branchLabel = scopeLabel("branches", branches, false);
const allInvLabel = scopeLabel("all", branches, true);
for (const t of tmps) unlinkSync(t);

if (BROKEN) {
  if (invBranches === invAll || invBranches > (AZ + KH)) { console.log(`✅ (--broken) G-AI-BRANCHES مسك تسرّب wh: مخزون branches=${invBranches} (يشمل المستودع) بدل ${AZ + KH}.`); process.exit(0); }
  console.error(`✗ (--broken) لم يتسرّب wh (branches=${invBranches}) — لا أسنان.`); process.exit(1);
}
const fails = [];
// ① branches = الفروع فقط
if (invBranches !== AZ + KH) fails.push(`① مخزون branches ليس ${AZ + KH} (az+kh بلا wh): ${invBranches}`);
// ② all يشمل المستودع
if (invAll !== WH + AZ + KH) fails.push(`② مخزون all ليس ${WH + AZ + KH} (wh+az+kh): ${invAll}`);
// ③ صفر انحدار للقيم القائمة
if (invWh !== WH) fails.push(`③ انحدار: مخزون wh تغيّر (${invWh} ≠ ${WH})`);
if (invAz !== AZ) fails.push(`③ انحدار: مخزون az تغيّر (${invAz} ≠ ${AZ})`);
// ④ المبيعات ثابتة (branches == all، wh مستبعَد)
if (salesBranches !== salesAll) fails.push(`④ 🚨 مبيعات branches (${salesBranches}) ≠ all (${salesAll}) — تغيّر رقم مبيعات!`);
if (salesAll !== 700) fails.push(`④ مبيعات all ليست 700 (az300+kh400، wh مستبعَد): ${salesAll}`);
// ⑤ الوسوم
if (!/بلا المستودع/.test(branchLabel)) fails.push(`⑤ scopeLabel(branches) بلا «بلا المستودع»: «${branchLabel}»`);
if (!/كل المواقع/.test(allInvLabel)) fails.push(`⑤ scopeLabel(all,inv) ليس «كل المواقع»: «${allInvLabel}»`);
if ((invResBranches.metrics || []).some((m) => /يشمل المستودع/.test(m.label))) fails.push(`⑤ 🚨 مقياس مخزون branches يحمل «يشمل المستودع» (خطأ — wh مستبعَد)`);
if (!(invResAll.metrics || []).some((m) => /يشمل المستودع/.test(m.label))) fails.push(`⑤ مقياس مخزون all بلا وسم «يشمل المستودع»`);
if (invResBranches.includes_warehouse !== false) fails.push("⑤ includes_warehouse لـbranches ليس false");
if (fails.length) { console.error("✗ G-AI-BRANCHES:\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`✅ G-AI-BRANCHES: branches=${invBranches} (فروع فقط) · all=${invAll} (يشمل wh) · wh/az ثابتان · مبيعات branches==all==${salesAll} · الوسوم صريحة · لا تسرّب wh.`);
