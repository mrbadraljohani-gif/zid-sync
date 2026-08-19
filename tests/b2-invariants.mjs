// ============================================================================
// حراس الدفعة (ب-٢) الثابتة — القائمة الموحّدة «بدون ربط».
// (الحارسان الديناميكيان: overflow-guard.mjs [تجاوز أفقي + لاصق معتم] و
//  progressive-search.mjs [الرسم التدريجي لا يكسر البحث] — كلاهما puppeteer.)
// هنا: حارس «إيموجي» (مؤشّرات الثقة SVG لا إيموجي ملوّنة) + «لا أرقام قبل المطابقة» + التوصيل.
// ============================================================================
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "index.html"), "utf8");
const script = html.slice(html.lastIndexOf("\n<script>\n"), html.lastIndexOf("\n</script>"));
const fails = [], ok = [];
const check = (c, m) => (c ? ok : fails).push(m);
function fnSrc(name) {
  const re = new RegExp("(?:async\\s+)?function\\s+" + name + "\\s*\\([^)]*\\)\\s*\\{");
  const m = re.exec(script); if (!m) return "";
  let i = m.index + m[0].length, d = 1;
  for (; i < script.length && d > 0; i++) { if (script[i] === "{") d++; else if (script[i] === "}") d--; }
  return script.slice(m.index, i);
}

// (1) التوصيل: القائمة الموحّدة هي مسار «بدون ربط»
check(/renderUnifiedList\(title, wrap\)/.test(script), "renderDetailBody يستدعي renderUnifiedList لفلتر «بدون ربط»");
check(/function renderUnifiedList\b/.test(script), "renderUnifiedList معرّفة");
check(/batchData = null;\s*\/\/ بيانات «بدون ربط»/.test(script), "refreshUnmatchedUI يبطل batchData (إعادة تحليل الثقة)");

// (2) حارس «إيموجي»: مؤشّرات الثقة في الشريط الموحّد SVG (DOT_*) لا إيموجي ملوّنة 🟢🟡🔴
const bar = fnSrc("unifiedBar");
check(bar.includes("DOT_OK") && bar.includes("DOT_MID") && bar.includes("DOT_BAD"), "unifiedBar يستعمل نقاط SVG (DOT_*) للثقة");
check(!bar.includes("🟢") && !bar.includes("🟡") && !bar.includes("🔴"), "unifiedBar بلا إيموجي ثقة ملوّنة (🟢/🟡/🔴)");

// (3) الرسم تدريجي + البحث عبر flush
const uni = fnSrc("renderUnifiedList");
const runSrc = fnSrc("run");
check(uni.includes("UNI_CHUNK") && uni.includes("scheduleUnifiedChunk"), "renderUnifiedList رسم تدريجي (UNI_CHUNK + scheduleUnifiedChunk)");
check(fnSrc("filterUnmatched").includes("flushUnified"), "filterUnmatched يستدعي flushUnified (بحث فوق الكل)");

// (4) الصفّ الخفيف تفاعلي (تراجع مباشر بلا تحويله لبطاقة كاملة)
const light = fnSrc("unifiedLightRow");
check(light.includes("undoWaitDecision") && light.includes("undoIgnoreDecision"), "الصفّ الخفيف فيه تراجع مباشر (undo*)");

// (4ب) فصل «غائب» عن «يحتاج قرار» + إصلاح «سبق ربطه» (الدفعة ب-٢ التصحيحية)
const ab = fnSrc("analyzeBatch");
check(/wasLinked\s*=\s*isAbsent\s*&&\s*!!\s*manualMap\[/.test(ab), "«سبق ربطه» = isAbsent && manualMap (لا matchedHistory المتشبّع)");
check(!/wasLinked\s*=\s*matchedHistory\.has/.test(ab), "wasLinked لم يعد يعتمد matchedHistory.has");
check(ab.includes("needCount") && ab.includes("absentCount"), "analyzeBatch يفصل needCount عن absentCount");
check(bar.includes("غائب") && bar.includes("يحتاج قرار"), "unifiedBar يعرض «غائب» منفصلاً عن «يحتاج قرار»");
check(uni.includes("isAbsent") && uni.includes("uni-sec"), "renderUnifiedList يرتّب: يحتاج قرار ثم غائب (قسم مستقلّ)");

// (4ج) مسار القرارات الموحّد (الدفعة ج، البند ٤): كل إجراء ⇒ run(true)
const ad = fnSrc("applyDecision");
check(ad.includes("run(true)"), "applyDecision يستدعي run(true) (يعكس القرار في الملفّين فوراً)");
check(/const ok = await applyDecision\(/.test(fnSrc("batchExclude")), "batchExclude يمرّ عبر applyDecision (إصلاح عطل run(true))");
check(fnSrc("batchApply").includes("run(true)"), "batchApply يعكس الربط فوراً بـrun(true)");
check(fnSrc("undoLastBatch").includes("run(true)"), "undoLastBatch يمرّ بـrun(true)");
check(script.includes("undoWaitDecision(rawSku, skuN) { await applyDecision") && script.includes("undoIgnoreDecision(rawSku, skuN) { await applyDecision"), "تراجع الصفوف الخفيفة عبر applyDecision");

// (1ج) الدفعة ج البند ١: unpublishSet/toggleUnpublish أُزيلا (دُمجا في «غير متوفر» = qty0+published No)
check(!script.includes("unpublishSet") && !/function\s+toggleUnpublish/.test(script), "unpublishSet/toggleUnpublish محذوفان");

// (2ج) الدفعة ج البند ٢: «غير متوفر» يخرج من القائمة ما دام غائباً (الصفوف الخفيفة = المتجاهَل فقط)
check(/const light = \[\.\.\.ignored\.map\(u => unifiedLightRow\(u, "ignored"\)\)\];/.test(uni), "الصفوف الخفيفة = المتجاهَل فقط (waiting يخرج من القائمة)");
check(!/pending\.map\(u => unifiedLightRow/.test(uni) && !/managed\.map\(u => unifiedLightRow/.test(uni), "waiting (pending/managed) لا يُرسَم صفوفاً");
check(fnSrc("unifiedBar").includes("pending") || uni.includes("pending.length"), "عدّاد «سيُصفَّر/مُدار» يبقى في الشريط (مُحتسَب لا مُخفى)");
// (2ج-ب) خطاف الرفع (missed_rounds): مُوصّل ومحكوم بعَلَم الرفع الفعلي (لا عدّ لتحميل القاعدة)
check(fnSrc("autoAdopt").includes("processWaitingOnUpload()"), "autoAdopt يستدعي خطاف الرفع قبل المطابقة");
const hook = fnSrc("processWaitingOnUpload");
check(/const uploaded = whWasUploaded; whWasUploaded = false;/.test(hook) && /else if \(uploaded && meta\)/.test(hook), "missed++ محكوم بعَلَم الرفع (يُستهلَك) — لا عدّ لتحميل القاعدة");
check(hook.includes("missed_rounds") && hook.includes("bumpMeta"), "الخطاف يكتب missed_rounds عبر db.waiting.bumpMeta");
check(fnSrc("onMergeWh").includes("whWasUploaded = true") && fnSrc("onMergeBranch").includes("whWasUploaded = true"), "onMergeWh/onMergeBranch يرفعان عَلَم الرفع الفعلي");

// (3ج) الدفعة ج البند ٣: العودة من الانتظار في خطاف الرفع (لا run) — «يحتاج قرار» بوسم «توفّر» بلا مطابقة تلقائية
check(hook.includes("reappearedSet") && hook.includes("bulkRemove"), "الخطاف يكتشف العودة دائماً (reappearedSet + إزالة من القاعدة)");
check(/if \(reappearedSet\.has\(skuN\) && !mapped && !ignoredSet\.has\(skuN\)\)/.test(runSrc) && /reappeared: true/.test(runSrc), "run يوجّه العائد غير المربوط/المتجاهَل إلى «يحتاج قرار» (reappeared) بلا مطابقة");
check(!/waitingSet\.delete\(skuN\); waitChanged/.test(runSrc) && !runSrc.includes("reactivated.push"), "run لم يعد يحذف الانتظار/يعيد التفعيل تلقائياً (نُقل للخطاف)");
check(fnSrc("analyzeBatch").includes("reappeared: !!z.reappeared"), "analyzeBatch يحمل وسم «توفّر» (reappeared)");
check(script.includes("↩ توفّر"), "شارة «↩ توفّر» معرّفة في lostTag");

// (5ج) الدفعة ج البند ٥: إخفاء الأب بالإجماع لا لمساً مباشراً
check(runSrc.includes("hasVarYesSet.forEach(rk => parentRaws.add(rk))") && runSrc.includes("if (parentRaws.has(rawKey)) continue"), "الآباء مُستبعدون من حلقة الكميات (لا صفّ كمية للأب)");
check(runSrc.includes("kids.find(c => childQ(c) > 0)") && runSrc.includes("if (live == null)"), "إخفاء الأب بالإجماع (كل الأبناء 0) وابن حيّ يحميه");
check(!/finalQtyByRaw\[(P|parent|pSku)\b/.test(runSrc), "لا تصفير مباشر لكمية الأب (finalQtyByRaw[child] فقط)");

// (5) حارس «لا أرقام قبل المطابقة»: العدّادات تبدأ 0 والكتلة مخفيّة حتى المطابقة
check(/id="sUn">0</.test(html), "عدّاد «بدون ربط» يبدأ 0 في الترميز");
check(/id="sUpd"[^>]*>0</.test(html) || /id="sUpd">0</.test(html), "عدّاد «تم تحديثه» يبدأ 0");
check(/id="unBlock"[^>]*style="display:none"/.test(html), "كتلة القائمة (#unBlock) مخفيّة حتى المطابقة");

// النتيجة
console.log(`✓ ${ok.length} تحقّق ناجح`);
if (fails.length) { console.error(`\n✗ ${fails.length} فشل:\n` + fails.map(f => "  ✗ " + f).join("\n")); process.exit(1); }
console.log("✅ حراس ب-٢ الثابتة سليمة.");
