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
const html = readFileSync(join(root, "index.html"), "utf8").replace(/\r\n/g, "\n");
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
// §دفعة٣: الثقة انتقلت من الشريط إلى بطاقة الصنف (matchLine) — النصّ صريح لا نقاط ملوّنة.
const ml = fnSrc("matchLine");
check(/CONF_LBL/.test(script) && ml.includes("CONF_LBL"), "الثقة عبر matchLine ＋ CONF_LBL (تسمية نصّية صريحة)");
check(["مطابقة مؤكدة", "مطابقة محتملة", "بلا مرشّح موثوق"].every(t => script.includes(t)), "درجات الثقة الثلاث بتسميات عربية صريحة");
check(!ml.includes("🟢") && !ml.includes("🟡") && !ml.includes("🔴"), "matchLine بلا إيموجي ثقة ملوّنة");
check(fnSrc("batchCardHTML").includes("matchLine(r, chkCls)"), "البطاقة تعرض صفّ المطابقة ظاهراً (لا tooltip — الجوال بلا تحويم)");
check(!bar.includes("🟢") && !bar.includes("🟡") && !bar.includes("🔴"), "unifiedBar بلا إيموجي ثقة ملوّنة");
check(!/DOT_OK|DOT_MID|DOT_BAD/.test(bar), "§دفعة٣: الشريط بلا نقاط ثقة — عدّادان فقط (يحتاج ربط · غير متوفر)");

// (3) الرسم تدريجي + البحث عبر flush
const uni = fnSrc("renderUnifiedList");
const runSrc = fnSrc("run");
check(uni.includes("UNI_CHUNK") && uni.includes("scheduleUnifiedChunk"), "renderUnifiedList رسم تدريجي (UNI_CHUNK + scheduleUnifiedChunk)");
check(fnSrc("filterUnmatched").includes("flushUnified"), "filterUnmatched يستدعي flushUnified (بحث فوق الكل)");

// (4) الصفّ الخفيف تفاعلي (تراجع مباشر بلا تحويله لبطاقة كاملة)
const light = fnSrc("unifiedLightRow");
check(light.includes("undoWaitDecision"), "الصفّ الخفيف فيه تراجع مباشر (undoWaitDecision)");

// (4ب) فصل «غائب» عن «يحتاج قرار» + إصلاح «سبق ربطه» (الدفعة ب-٢ التصحيحية)
const ab = fnSrc("analyzeBatch");
check(/wasLinked\s*=\s*isAbsent\s*&&\s*!!\s*manualMap\[/.test(ab), "«سبق ربطه» = isAbsent && manualMap (لا matchedHistory المتشبّع)");
check(!/wasLinked\s*=\s*matchedHistory\.has/.test(ab), "wasLinked لم يعد يعتمد matchedHistory.has");
check(ab.includes("needCount") && ab.includes("absentCount"), "analyzeBatch يفصل needCount عن absentCount");
// §دفعة٣: «غائب» خرج من الشريط إلى ترويسة قسمه. الثابت المحروس هو **فصل العدّ** في
// renderUnifiedList لا وجود الكلمة في الشريط (كانت تمرّ بالمصادفة من title زرّ الفلتر).
check(uni.includes("const needN = gN + yN + rN") && uni.includes("absentN = isAbs(gAll)"), "renderUnifiedList: needN يستثني الغائب وabsentN مفصول");
check(uni.includes("id=\"uniAbsentSec\"") && uni.slice(uni.indexOf("uniAbsentSec")).slice(0, 220).includes("${absentN}"), "ترويسة قسم «غائب» تعرض العدّ الخام (absentN) لا المُصفّى");
// §تدقيق المراسي: كانت includes("isAbsent")+includes("uni-sec") — وجود لا ترتيب، فقلبُ
// rows = [...absCards] لم يكن يُرسِبها. المرساة الآن على **مواضع** البناء في rows.
const iNeed = uni.indexOf("const rows = [...needCards]"), iAbs = uni.indexOf("...absCards)"), iLight = uni.indexOf("...light)");
check(iNeed >= 0 && iAbs > iNeed && iLight > iAbs, "renderUnifiedList يبني rows بالترتيب: يحتاج ربط ← غائب ← غير متوفر");
check(uni.includes("isAbsent") && uni.includes("uni-sec"), "الغائب قسم مستقلّ (uni-sec) لا مطويّ في «يحتاج ربط»");

// (4ج) مسار القرارات الموحّد (الدفعة ج، البند ٤): كل إجراء ⇒ run(true)
const ad = fnSrc("applyDecision");
check(ad.includes("run(true)"), "applyDecision يستدعي run(true) (يعكس القرار في الملفّين فوراً)");
check(/const ok = await applyDecision\(/.test(fnSrc("batchExclude")), "batchExclude يمرّ عبر applyDecision (إصلاح عطل run(true))");
check(fnSrc("batchApply").includes("run(true)"), "batchApply يعكس الربط فوراً بـrun(true)");
check(fnSrc("undoLastBatch").includes("run(true)"), "undoLastBatch يمرّ بـrun(true)");
check(script.includes("undoWaitDecision(rawSku, skuN) { await applyDecision"), "تراجع الصفوف الخفيفة عبر applyDecision");

// (1ج) الدفعة ج البند ١: unpublishSet/toggleUnpublish أُزيلا (دُمجا في «غير متوفر» = qty0+published No)
check(!script.includes("unpublishSet") && !/function\s+toggleUnpublish/.test(script), "unpublishSet/toggleUnpublish محذوفان");

// (2ج) قرار المستخدم: «غير متوفر» يعود صفّاً خفيفاً (⚠ سيُصفَّر/✓ مُدار) بجانب المتجاهَل — تراجع عن خروجه من القائمة
check(/pending\.map\(u => unifiedLightRow\(u, "pending"\)\)/.test(uni) && /managed\.map\(u => unifiedLightRow\(u, "managed"\)\)/.test(uni), "الصفوف الخفيفة تشمل سيُصفَّر/مُدار");
// (عطل ٢) عدّادات الشريط من غير المُصفّى؛ btFilter للبطاقات المرسومة فقط
check(/const gAll = batchData\.green/.test(uni) && /unifiedBar\(needN, gN, yN, rN, absentN,/.test(uni), "عطل٢: عدّاد الشريط من batchData الخام (needN/absentN)");
check(/const g = btFilter\(gAll\)/.test(uni), "btFilter على البطاقات المرسومة فقط");
// §إصلاح الفلتر: «سبق ربطه» كان يبدو معطّلاً — الأرقام لا تتغيّر وكل نتائجه في قسم «غائب»
// أسفل الصفحة. الآن: رقم دقيق بجوار كل خيار ＋ «يعرض X من Y» ＋ تمرير لأول نتيجة.
check(bar.includes("${needN + absentN}"), "فلتر «الكل» يحمل عدده الدقيق (يحتاج ربط ＋ غائب)");
check(bar.includes("uni-shown") && bar.includes("يعرض"), "مؤشّر «يعرض X من Y» يظهر عند تفعيل الفلتر");
check(bar.includes("uni-chip abs"), "شريحة «غائب عن المخزن» في الشريط (كانت في ترويسة القسم وحدها)");
check(uni.includes("needCards.length + absCards.length"), "shownN = البطاقات المرسومة فعلاً (لا الخام)");
const tl = fnSrc("toggleLostOnly");
check(tl.includes("scrollIntoView") && tl.includes("flushUnified"), "تفعيل الفلتر يمرّر لأول نتيجة (وإلا بدا معطّلاً)");
// (عطل ١أ) تعطيل «غير متوفر» للـno-op — نفس شروط run (مصدر واحد)
const wn = fnSrc("waitNoopReason");
check(wn.includes("curQtyNum(z.qty)") && wn.includes("famIndex") && wn.includes('=== "yes"'), "waitNoopReason بنفس شروط run (curQtyNum + published + famIndex)");
check(fnSrc("batchCardHTML").includes("waitNoopReason(r.z)") && fnSrc("batchCardHTML").includes("disabled") && fnSrc("batchCardHTML").includes("wait-note"), "الزرّ يُعطَّل مع سبب دائم (wait-note لا tooltip)");
// (عطل ١ب) تنبيه المتغيّر عند «غير متوفر»
check(/النشر يُدار من المنتج الأب/.test(fnSrc("batchExclude")), "تنبيه المتغيّر (النشر من الأب) عند «غير متوفر»");
// (2ج-ب) خطاف الرفع (missed_rounds): مُوصّل ومحكوم بعَلَم الرفع الفعلي (لا عدّ لتحميل القاعدة)
check(fnSrc("autoAdopt").includes("processWaitingOnUpload()"), "autoAdopt يستدعي خطاف الرفع قبل المطابقة");
const hook = fnSrc("processWaitingOnUpload");
check(/const uploaded = whWasUploaded; whWasUploaded = false;/.test(hook) && /else if \(uploaded && meta\)/.test(hook), "missed++ محكوم بعَلَم الرفع (يُستهلَك) — لا عدّ لتحميل القاعدة");
check(hook.includes("missed_rounds") && hook.includes("bumpMeta"), "الخطاف يكتب missed_rounds عبر db.waiting.bumpMeta");
check(fnSrc("onMergeWh").includes("whWasUploaded = true") && fnSrc("onMergeBranch").includes("whWasUploaded = true"), "onMergeWh/onMergeBranch يرفعان عَلَم الرفع الفعلي");

// (3ج) الدفعة ج البند ٣: العودة من الانتظار في خطاف الرفع (لا run) — «يحتاج قرار» بوسم «توفّر» بلا مطابقة تلقائية
check(hook.includes("reappearedSet") && hook.includes("bulkRemove"), "الخطاف يكتشف العودة دائماً (reappearedSet + إزالة من القاعدة)");
check(/if \(reappearedSet\.has\(skuN\) && !mapped\)/.test(runSrc) && /reappeared: true/.test(runSrc), "run يوجّه العائد غير المربوط إلى «يحتاج ربط» (reappeared) بلا مطابقة");
check(!/waitingSet\.delete\(skuN\); waitChanged/.test(runSrc) && !runSrc.includes("reactivated.push"), "run لم يعد يحذف الانتظار/يعيد التفعيل تلقائياً (نُقل للخطاف)");
check(fnSrc("analyzeBatch").includes("reappeared: !!z.reappeared"), "analyzeBatch يحمل وسم «توفّر» (reappeared)");
// §تدقيق المراسي: كانت script.includes("↩ توفّر") — والنصّ يرد في تعليقين وفي
// renderReactivated، فحذفُ الشارة من lostTag كان لا يُرسِبها. المرساة الآن على مصدر lostTag نفسه.
const lostSrc = (() => { const k = script.indexOf("const lostTag = "); return k < 0 ? "" : script.slice(k, script.indexOf(String.fromCharCode(10), k)); })();
check(lostSrc.length > 0, "lostTag معرّفة (const سهمي)");
check(lostSrc.includes("r.reappeared") && lostSrc.includes("توفّر") && lostSrc.includes("lost-tag"), "lostTag يبني شارة «↩ توفّر» من r.reappeared (لا نصّ عائم في الملف)");
check(lostSrc.includes("r.wasLinked") && lostSrc.includes("سبق ربطه"), "lostTag يبني شارة «سبق ربطه» من r.wasLinked");
// (١ج) المربوط العائد يستأنف رابطه لكن بوسم «↩ توفّر» ظاهر في «تم تحديثه» للمراجعة
check(runSrc.includes("reappeared: reappearedSet.has(skuN)"), "المربوط العائد يُوسَم reappeared في updatedList (يستأنف بوسم — البند ١)");
check(/reapFlag = u\.reappeared/.test(script) && fnSrc("updatedTableHTML").includes("reapFlag"), "صفّ «تم تحديثه» يعرض شارة «↩ توفّر — راجع» للمربوط العائد");

// (5ج) الدفعة ج البند ٥: إخفاء الأب بالإجماع لا لمساً مباشراً
check(runSrc.includes("hasVarYesSet.forEach(rk => parentRaws.add(rk))") && /if \(parentRaws\.has\(rawKey\)\) \{[^}]*continue;/.test(runSrc), "الآباء مُستبعدون من حلقة الكميات (لا صفّ كمية للأب)");
check(runSrc.includes("kids.find(c => childQ(c) > 0)") && runSrc.includes("if (live == null)"), "إخفاء الأب بالإجماع (كل الأبناء 0) وابن حيّ يحميه");
check(!/finalQtyByRaw\[(P|parent|pSku)\b/.test(runSrc), "لا تصفير مباشر لكمية الأب (finalQtyByRaw[child] فقط)");

// (طلب ٣) شارة حالة النشر في القائمة الموحّدة (منشور/غير منشور + «← سيُخفى»)
const pb = fnSrc("pubBadge");
check(/function pubBadge\(/.test(script), "pubBadge معرّفة");
check(fnSrc("batchCardHTML").includes("pubBadge(r.z)") && fnSrc("unifiedLightRow").includes("pubBadge(u)"), "الشارة في البطاقة الكاملة والصفّ الخفيف معاً");
check(pb.includes("منشور") && pb.includes("غير منشور") && pb.includes("سيُخفى"), "حالات الشارة: منشور/غير منشور/← سيُخفى");
check(pb.includes("z.published"), "المصدر = عمود published (نفس مصدر run)");
check(pb.includes("ICO_EYE") && /const ICO_EYE =[^\n]*<svg class="ico"/.test(script) && !/[\u{1F440}\u{1F6AB}✅❌]/u.test(pb), "أيقونة SVG (ICO_EYE) لا إيموجي");
check(runSrc.includes("lastAutoUnpub = autoUnpub"), "lastAutoUnpub مُصدَّر لشارة «سيُخفى»");
check(/\.pub-badge\.on\s*\{[^}]*var\(--green\)/.test(html) && /\.pub-badge\.off\s*\{[^}]*var\(--muted\)/.test(html), "توكنات --green/--muted");
check(!/\.pub-badge[^{]*\{[^}]*var\(--danger\)/.test(html), "الشارة لا تستعمل --danger (عدم النشر ليس خطأً)");

// (5) حارس «لا أرقام قبل المطابقة»: العدّادات تبدأ 0 والكتلة مخفيّة حتى المطابقة
check(/id="sUn">0</.test(html), "عدّاد «بدون ربط» يبدأ 0 في الترميز");
check(/id="sUpd"[^>]*>0</.test(html) || /id="sUpd">0</.test(html), "عدّاد «تم تحديثه» يبدأ 0");
check(/id="unBlock"[^>]*style="display:none"/.test(html), "كتلة القائمة (#unBlock) مخفيّة حتى المطابقة");
// (5ب) KPI لوحة المخزون تبدأ «—» لا رقماً ملفَّقاً قبل توفّر مصدرها الحيّ (renderInvKPIs يملؤها)
for (const id of ["kpiProducts", "kpiUnified", "kpiUnmatched", "kpiLinks"])
  check(new RegExp('id="' + id + '">—<').test(html), `KPI «${id}» يبدأ «—» في الترميز (لا رقم قبل المصدر)`);
check(/function renderInvKPIs\b/.test(script), "renderInvKPIs معرّفة (تملأ KPI من مصادر حيّة)");

// النتيجة
console.log(`✓ ${ok.length} تحقّق ناجح`);
if (fails.length) { console.error(`\n✗ ${fails.length} فشل:\n` + fails.map(f => "  ✗ " + f).join("\n")); process.exit(1); }
console.log("✅ حراس ب-٢ الثابتة سليمة.");
