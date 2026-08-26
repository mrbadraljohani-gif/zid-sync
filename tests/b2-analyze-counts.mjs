// ============================================================================
// إثبات ميكانيكي (ب-٢ التصحيحية): analyzeBatch الحقيقي يفصل needCount/absentCount
// و«سبق ربطه» (lostCount) صار مقيّداً بـ(غائب ∧ manualMap) — لا matchedHistory المتشبّع.
// يستخرج analyzeBatch الفعلي من index.html ويشغّله ببيانات تركيبية (matchedHistory
// مُشبَّع = كل الأصناف؛ manualMap = قلّة فقط) ويؤكّد أن lostCount << needCount.
// ============================================================================
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const script = readFileSync(join(root, "index.html"), "utf8").replace(/\r\n/g, "\n");
const s = script.slice(script.lastIndexOf("\n<script>\n"), script.lastIndexOf("\n</script>"));
function fnSrc(name){const re=new RegExp("(?:async\\s+)?function\\s+"+name+"\\s*\\([^)]*\\)\\s*\\{");const m=re.exec(s);if(!m)throw new Error("no "+name);let i=m.index+m[0].length,d=1;for(;i<s.length&&d>0;i++){if(s[i]==="{")d++;else if(s[i]==="}")d--;}return s.slice(m.index,i);}

// بيئة تركيبية: 5 «جديد» (بلا manualMap) · 10 «غائب» (3 منها لها manualMap) · matchedHistory مُشبَّع بالكل
const newItems = Array.from({length:5},(_,i)=>({sku:"NEW"+i, skuN:"NEW"+i, name:"جديد "+i, qty:5}));
const absItems = Array.from({length:10},(_,i)=>({sku:"ABS"+i, skuN:"ABS"+i, name:"غائب "+i, qty:0}));
const manualMap = { ABS0:"C0", ABS1:"C1", ABS2:"C2" };   // 3 فقط لها كود يدوي محفوظ
const matchedHistory = new Set([...newItems,...absItems].map(x=>x.skuN));   // مُشبَّع: يحوي الجميع (الحالة المرضية القديمة)
const env = {
  lastUnmatchedRaw: newItems, lastAbsent: absItems, manualMap, matchedHistory,
  boundSet: new Set(), ignoredSet: new Set(), waitingSet: new Set(),
  lastMatchedWhCodes: new Set(), lastWhList: [], famIndex: null,
  normCode: x => String(x),
  extractSize: () => null, coreTokens: () => [], nameTokens: () => [],
  scoreCandidate: () => ({ score: 0 }), classifyBatch: () => "red",
};
const body = Object.keys(env).map(k => `var ${k} = __env.${k};`).join("\n")
  + "\n" + fnSrc("analyzeBatch") + "\nreturn analyzeBatch();";
const res = new Function("__env", body)(env);

const fails = [];
if (res.needCount !== 5) fails.push(`needCount=${res.needCount} ≠ 5`);
if (res.absentCount !== 10) fails.push(`absentCount=${res.absentCount} ≠ 10`);
if (res.lostCount !== 3) fails.push(`lostCount=${res.lostCount} ≠ 3 (غائب∧manualMap)`);
if (!(res.lostCount < res.needCount)) fails.push(`lostCount(${res.lostCount}) ليس < needCount(${res.needCount})`);
console.log(`  needCount=${res.needCount} · absentCount=${res.absentCount} · lostCount=${res.lostCount} (المتشبّع القديم كان سيُعطي ${5+10})`);
if (fails.length) { console.error("✗ فشل:\n"+fails.map(f=>"  ✗ "+f).join("\n")); process.exit(1); }
console.log("✅ الفصل صحيح: needCount=5 · absentCount=10 · lostCount=3 < needCount (لا تشبّع).");
