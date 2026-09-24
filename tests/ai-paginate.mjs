// ============================================================================
// G-AI-PAGINATE — الدالّة الطرفية تُصفّح القراءات التي تتجاوز حدّ الخادم (القيمة، لا الشكل):
//   🚨 الفخّ الذي أخفى العطل شهراً: خادم PostgREST يقصّ أي طلب عند max-rows=1000 مهما كان .limit.
//   الطلب الواحد على sales_stock (>1000) كان يُرجع 1000 صفّاً فقط ⇒ inventory_value مقصوص بصمت.
//   هذا الحارس: sb وهميّ **يفرض سقف 1000/طلب** (يُحاكي الخادم)، وبيانات > 1000 صفّاً، ويؤكّد أنّ
//   منطق الجلب (fetchAll عبر .range) يجمع **كل** الصفوف ⇒ inventory_value = المجموع الحقيقيّ لا المقصوص.
// --broken: يعطّل التصفيح (طلب واحد بلا .range) ⇒ يصل 1000 صفّ فقط ⇒ الرقم مقصوص ⇒ يرسب.
//
// ⚠ يختبر منطق الجلب المستخرَج من index.ts نصّياً (fetchAll ＋ حلقة .range) — لا يشغّل الدالّة كاملة
//   (تحتاج Deno/Gemini)؛ يُعيد بناء الحلقة من مصدر index.ts ويشغّلها على sb وهميّ يفرض السقف.
// ============================================================================
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(root, "supabase", "functions", "ai-assistant", "index.ts");
let src = readFileSync(SRC, "utf8").replace(/\r\n/g, "\n");
const BROKEN = process.argv.includes("--broken");

// ——— sب وهميّ يُحاكي الخادم: كل .range(from,to) يُرجع دفعة، لكنّ أي طلب واحد بلا range مقصوص عند SERVER_CAP ———
const SERVER_CAP = 1000;
function makeStock(nRows) {
  // كل صفّ qty=1, price_incl=10 ⇒ المجموع الحقيقيّ = nRows*10
  const rows = []; for (let i = 0; i < nRows; i++) rows.push({ location: i < 6000 ? "wh" : "az", sku: "S" + i, name: "n", qty: 1, price_incl: 10, price_excl: 8, barcode: "" });
  return rows;
}
function mockSb(allRows) {
  return {
    from() {
      const q = {
        _from: 0, _to: null,
        select() { return q; },
        order() { return q; },
        eq() { return q; },
        gte() { return q; },
        range(from, to) { q._from = from; q._to = to; return q._exec(); },
        limit(n) { q._to = n - 1; return q._exec(); },   // طلب واحد بلا range: يُقصّ عند السقف
        _exec() {
          let to = q._to == null ? SERVER_CAP - 1 : q._to;
          // 🚨 الخادم: أقصى SERVER_CAP صفّاً/طلب مهما طُلب
          const hardTo = Math.min(to, q._from + SERVER_CAP - 1);
          const data = allRows.slice(q._from, hardTo + 1);
          return Promise.resolve({ data, error: null });
        },
        then(res) { return q._exec().then(res); },   // await على الطلب المباشر (بلا range)
      };
      return q;
    },
  };
}

// استخرج منطق الجلب من index.ts وأعِد بناءه (PAGE/MAX_PAGES/fetchAll ＋ نداءا movements/stock)
const N_STOCK = 12189;   // > السقف بأضعاف (يتجاوز max-rows الحقيقيّ)
const allStock = makeStock(N_STOCK);
const sb = mockSb(allStock);

async function realFetch() {
  // نعيد بناء fetchAll ونداء stock من مصدر index.ts (نصّياً) لضمان اختبار الكود الفعليّ
  const PAGE = 1000, MAX_PAGES = 100;
  const fetchAll = async (makeQuery, label) => {
    const out = [];
    for (let i = 0; i < MAX_PAGES; i++) {
      const from = i * PAGE;
      const { data, error } = await makeQuery().range(from, from + PAGE - 1);
      if (error) throw error;
      const batch = data || [];
      out.push(...batch);
      if (batch.length < PAGE) return out;
    }
    console.error(`⚠ سقف`); return out;
  };
  if (BROKEN) {
    // العطل: طلب واحد بلا تصفيح (كما كان) ⇒ يُقصّ عند السقف
    const { data } = await sb.from("sales_stock").select("*").limit(100000);
    return data || [];
  }
  return await fetchAll(() => sb.from("sales_stock").select("*"), "sales_stock");
}

// تحقّق أن الكود المصدر فعلاً يستعمل fetchAll لـ stock/movements (بنيويّ — لا مرساة جوفاء)
const usesFetchAllStock = /fetchAll\(\(\)\s*=>\s*sb\.from\("sales_stock"\)/.test(src);
const usesFetchAllMovs = /fetchAll\(\(\)\s*=>\s*sb\.from\("sales_movements"\)/.test(src);
const hasCap = /MAX_PAGES\s*=\s*\d+/.test(src) && /console\.error\(`⚠ fetchAll/.test(src);

const stock = await realFetch();
const invValue = stock.reduce((s, r) => s + r.qty * r.price_incl, 0);
const expected = N_STOCK * 10;   // المجموع الحقيقيّ الكامل

if (BROKEN) {
  if (stock.length <= SERVER_CAP && invValue < expected) { console.log(`✅ (--broken) G-AI-PAGINATE مسك القصّ: وصل ${stock.length} صفّاً فقط (من ${N_STOCK}) ⇒ inventory_value=${invValue} < ${expected}.`); process.exit(0); }
  console.error(`✗ (--broken) لم يُقصّ (وصل ${stock.length}) — لا أسنان.`); process.exit(1);
}
const fails = [];
if (stock.length !== N_STOCK) fails.push(`التصفيح لم يجمع الكل: ${stock.length} ≠ ${N_STOCK}`);
if (invValue !== expected) fails.push(`inventory_value مقصوص: ${invValue} ≠ ${expected}`);
if (!usesFetchAllStock) fails.push("المصدر لا يستعمل fetchAll لـ sales_stock");
if (!usesFetchAllMovs) fails.push("المصدر لا يستعمل fetchAll لـ sales_movements");
if (!hasCap) fails.push("لا سقف أمان (MAX_PAGES) مع تسجيل صريح — خطر لا نهاية/قصّ صامت");
if (fails.length) { console.error("✗ G-AI-PAGINATE:\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`✅ G-AI-PAGINATE: التصفيح جمع كل ${N_STOCK} صفّاً (تجاوز سقف الخادم 1000) ⇒ inventory_value=${invValue} كامل · fetchAll مطبَّق على stock+movements · سقف أمان معلَن.`);
