// ============================================================================
// انحدار run() بعد جراحة البند ٣ (نقل العودة من run إلى خطاف الرفع).
// حارس بنيوي: يثبت أن تعديلات run() لم تُسقِط أياً من ثوابتها الحرجة، وأن اعتراض
// «العودة» محايد تماماً حين reappearedSet فارغ (الحالة العادية = صفر تغيير سلوك).
// (run() دالّة ضخمة مقترنة بالـDOM/Supabase — لا يوجد مشغّل شامل؛ هذا الحارس يمنع
//  الحذف العرضي للثوابت وهو الخطر الفعلي من جراحة البند ٣.)
//
// تشغيل:  node tests/b3-run-regression.mjs
//         node tests/b3-run-regression.mjs --broken  (تحقّق ذاتي: حذف ثابت ⇒ يجب أن يرسب)
// ============================================================================
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "index.html"), "utf8");
const script = html.slice(html.lastIndexOf("\n<script>\n"), html.lastIndexOf("\n</script>"));
const BROKEN = process.argv.includes("--broken");

function fnSrc(name) {
  const re = new RegExp("(?:async\\s+)?function\\s+" + name + "\\s*\\([^)]*\\)\\s*\\{");
  const m = re.exec(script); if (!m) throw new Error("لم تُوجد الدالّة " + name);
  let i = m.index + m[0].length, d = 1;
  for (; i < script.length && d > 0; i++) { if (script[i] === "{") d++; else if (script[i] === "}") d--; }
  return script.slice(m.index, i);
}

let run = fnSrc("run");
if (BROKEN) run = run.replace("matchedWhCodes.add(normCode(whCode))", "/* حُذف عمداً */");   // إسقاط ثابت مطابقة للتحقّق الذاتي

const fails = [], ok = [];
const check = (c, m) => (c ? ok : fails).push(m);

// ① المطابقة سليمة
check(run.includes("resolveWhCode(rawSku, skuN)"), "المطابقة: resolveWhCode موحّدة (توزيع + حلقة)");
check(run.includes("matchedWhCodes.add(normCode(whCode))"), "المطابقة: تسجيل كود المستودع المأخوذ");
check(run.includes("matchedHistory.add(skuN)"), "المطابقة: تراكم تاريخ المطابقة");

// ② الأب/المتغيّر سليمان
check(/if \(parentRaws\.has\(rawKey\)\) \{[^}]*continue;/.test(run) || run.includes("if (parentRaws.has(rawKey)) continue"), "الأب: مُستبعد من حلقة الكميات");
// [مرساة الأب] إثبات أن مطابقة regex (بعد التحوّل عن النصّ الحرفي) تُرصد إزالة الاستبعاد فعلاً — لم تُرخَ المرساة
{
  const stripped = run.replace(/if \(parentRaws\.has\(rawKey\)\) \{[^}]*continue;\s*\}/, "/*أُزيل*/").replace("if (parentRaws.has(rawKey)) continue;", "/*أُزيل*/");
  const stillMatches = /if \(parentRaws\.has\(rawKey\)\) \{[^}]*continue;/.test(stripped) || stripped.includes("if (parentRaws.has(rawKey)) continue");
  check(!stillMatches, "[مرساة الأب] regex الاستبعاد يرسب عند إزالة الاستبعاد (اسمح للأب بدخول qtyRows) — لم يُرخَ بالتحوّل نصّ→regex");
}
check(run.includes("parentsToPublish"), "الأب: نقل النشر إلى صف الأب");
check(run.includes("kids.find(c => childQ(c) > 0)") && run.includes("if (live == null)"), "الأب: إخفاء بالإجماع + حماية الابن الحيّ");
check(run.includes("shareByRaw") && run.includes("distByRaw"), "المتغيّر: توزيع كمية الكود على المتغيّرات");

// ③ صمام تعارض التخفيض سليم
check(run.includes("saleConflicts.push"), "التخفيض: تجميع صفوف التعارض (sale ≥ price)");
check(/sv\s*>=\s*pv/.test(run), "التخفيض: شرط الاستبعاد sv ≥ pv حاضر");

// ④ العدّادات لم تتغيّر
check(/getElementById\("sUpd"\)\.textContent = updatedList\.length/.test(run), "العدّاد: تم تحديثه = updatedList.length");
check(/getElementById\("sUn"\)\.textContent = unmatched\.length/.test(run), "العدّاد: بدون ربط = unmatched.length");
check(/getElementById\("sTot"\)\.textContent = rows0\.length - 1/.test(run), "العدّاد: إجمالي الأسطر = rows0.length-1");

// ⑤ حياد البند ٣: الاعتراض محكوم بـreappearedSet (فارغ ⇒ لا يقع) + لا عودة تلقائية داخل run
check(/if \(reappearedSet\.has\(skuN\) && !mapped\)/.test(run), "العودة: الاعتراض محكوم بـreappearedSet (فارغ = حياد تامّ)");
check(!run.includes("reactivated.push") && !/waitingSet\.delete\(skuN\); waitChanged/.test(run), "العودة: أُزيل الحذف/إعادة التفعيل التلقائي من run (نُقل للخطاف)");

// النتيجة
if (BROKEN) {
  if (fails.length) { console.log(`✅ تحقّق ذاتي: رسب بعد إسقاط ثابت المطابقة (${fails.length} فشل) — كما يجب.`); process.exit(0); }
  console.error("\n✗ خلل منهجي: لم يرسب رغم حذف ثابت من run!"); process.exit(1);
}
console.log(`✓ ${ok.length} ثابت run() سليم`);
if (fails.length) { console.error(`\n✗ ${fails.length} انحدار:\n` + fails.map(f => "  ✗ " + f).join("\n")); process.exit(1); }
console.log("✅ انحدار run() (البند ٣): كل الثوابت سليمة والعودة محايدة عند الفراغ.");
