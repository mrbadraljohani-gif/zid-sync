# تتبّع الحالات الأربع في الصفحة الرئيسية

أسماء الدوالّ والمتغيّرات كما هي في `index.html` حرفياً.

> **اصطلاح العرض:** كتل الكود إنجليزية خالصة LTR (تعليقات `//` وأسهم `->`). النصوص العربية الحرفية من الواجهة (التوستات والعناوين) مذكورة في فقرات خارج الكتل تحتها مباشرةً.

---

# ① «بدون ربط» — وضع التحليل الدفعي

### فتح اللوحة

```
#batchBtn  (onclick, index.html:1239)
  -> openBatchAnalysis()
      -> guard: lastWhList.length          // if empty: showToast() then return
      -> batchData = analyzeBatch()
      -> batchLostOnly = false ; batchMode = true
      -> batchTab = green | yellow | red   // first non-empty tab
      -> hide "#unBlock .unbar" and #unTitle
      -> renderBatchTab()                  // renders inside #detailTable itself, not a separate panel
```

نصّ التوست عند الحارس: «شغّل «طابق وأنشئ» أولاً.»

`analyzeBatch()` يبني مجموعة العمل:

```
analyzeBatch()
  items = lastUnmatchedRaw.filter(okItem)
        + lastAbsent.filter(okItem)              // de-duplicated via the `seen` Set
  okItem drops: boundSet
                ignoredSet
                waitingSet
                u.orphanParent
                famIndex.isParent(u.sku)
  taken = new Set([...lastMatchedWhCodes, ...Object.values(manualMap).map(normCode)])
  avail = lastWhList.filter(w => !taken.has(normCode(w.code)))
  wasLinked = matchedHistory.has(normCode(z.skuN))   // drives the "previously linked" badge
  -> batchData.green / .yellow / .red / .lostCount
  -> every row indexed in batchRowByUid[uid]
```

### Action: اعتماد

```
acceptGreen() (2767) | acceptFamily(fi) (2780) | acceptRed() (2789)
  -> btReadChecked(cls, fam)
      -> querySelectorAll("#batchBody .cls[data-fam=...]")   // checked rows only
      -> batchRowByUid[c.dataset.uid] -> r.chosen || r.best
      -> pairs = [{sku, code}]
  -> batchApply(pairs, tag)
      -> undo = pairs.map(...)                    // snapshot of previous manualMap values
      -> setBusy("batchBody", true)
      -> await dbSetMappings(pairs, tag)          // * on failure: full stop, no local state written
            -> requireOnline() ; requireOwner()
            -> db.mappings.bulkUpsert(rows)       // Supabase first
            -> manualMap[sku] = normCode(code)
            -> localStorage[MAP_KEY]
            -> updateDbBadge()
            -> logActivity("link_added", ..., {count})
      -> boundSet.add / excludedSet.delete / linkTags[sku] = {tag, date}
      -> batchAliases.add(nameRoot(z.name) + "|||" + nameRoot(w.name))
      -> saveAliases() [ALIAS_KEY] ; saveLinkTags() [TAGS_KEY]
      -> renderPills() ; markDirty() ; updateNewCount()
      -> if (currentFilter === "unmatched") renderDetail()
      -> batchData = analyzeBatch() ; renderBatchTab()   // full re-analysis
      -> showToast(...)                                  // success toast, text below
```

نصّ توست النجاح: «✓ اعتُمد N رابط في القاعدة».

### Action: ⏳ غير متوفر / ✕ تجاهل

```
batchExclude(uid, 'wait')   (2757)
  -> r = batchRowByUid[uid]
  -> markWaiting(r.z.sku, skuN, r.z.name)
      -> waitingSet.add + saveWaiting()   [WAIT_KEY]
      -> db.waiting.upsert(...).catch()   // best effort: failure does not block
      -> logActivity("waiting_added")
  -> shared tail (below)
```

```
batchExclude(uid, 'ignore')  (2758)
  -> r = batchRowByUid[uid]
  -> ignoredSet.add(normCode(skuN))
  -> saveIgnored()   [IGN_KEY]
     // x no database
     // x no logActivity
  -> shared tail (below)
```

```
shared tail (both branches)
  -> remove r from batchData.green / .yellow / .red
  -> recompute batchData.lostCount from wasLinked
  -> renderIgnored(lastUnmatchedRaw.filter(u => ignoredSet.has(normCode(u.skuN))))
  -> updateNewCount() ; renderFingerprint() ; renderBatchTab()
```

**فرق جوهري:** `batchExclude` **لا يستدعي** `run(true)` — الملفان (`lastQtyRows` / `lastPriceRows`) لا يتحدثان حتى التشغيل التالي، بخلاف الوضع العادي.

### Action: ↩ تراجع

```
undoLastBatch()  (2701)
  -> lastBatchUndo.entries -> toDel (prev === null) ; toRestore (prev !== null)
  -> requireOnline()
  -> db.mappings.bulkRemove(toDel)
  -> db.mappings.bulkUpsert(toRestore)
  -> delete manualMap[sku]  |  manualMap[sku] = prev
  -> boundSet.delete ; delete linkTags[sku]
  -> localStorage[MAP_KEY] ; updateDbBadge()
  -> lastBatchUndo = null
  -> saveLinkTags() ; renderPills() ; markDirty() ; updateNewCount()
  -> batchData = analyzeBatch() ; renderBatchTab()
```

---

# ② «بدون ربط» — الوضع العادي

مصدر البطاقات:

```
renderDetail() -> f === "unmatched" -> renderUnmatchedCard(bindBtn, title, wrap)
  -> cnt = {new, pending, managed, ignored, all}   // computed from raw0 = lastUnmatchedRaw
       new     : !isIgn && !isWait && !isBound
       pending : isWait && curQtyNum(u.qty) !== 0    // waiting item that drifted
       managed : isWait && curQtyNum(u.qty) === 0    // zeroed and managed
  -> unmatchedSub selects raw   // falls back to "new" when the current tab is empty
  -> items = buildItems(raw)    // suggestFor() + suggCache -> it.suggestion
  -> lastUnmatched = items      // * the index i in every onclick points into this array
  -> wrap.innerHTML = chips + suggestionsCardsHTML(items)
```

### الأزرار (من `cardHtml`, index.html:4847-4860)

| الشرط | الزر المُولَّد |
|---|---|
| `it.bound` | «مربوط ✓» معطّل |
| `reliable && pct >= 85` | <bdi>`bindRow(i)`</bdi> — «ربط المنتج» |
| غير ذلك | <bdi>`startManualLink(it.skuN)`</bdi> — «ربط يدوي» |

```
bindRow(i)  (4850)
  -> it = lastUnmatched[i]
  -> guard: !it.suggestion || it.bound
  -> await dbSetMapping(it.sku, it.suggestion.code, "auto-approved")
        -> requireOnline() ; requireOwner() ; db.mappings.upsert
        -> manualMap ; localStorage[MAP_KEY] ; updateDbBadge()
        -> logActivity("link_added")
  -> applyBindLocal(it)   // boundSet.add ; it.bound = true ; markDirty()
  -> renderPills() ; fadeRemoveRow(i) ; updateBindAllCount() ; updateNewCount()
```

```
startManualLink(skuN)  (4851)     // not a standalone path: it routes into flow (1)
  -> openBatchAnalysis()
  -> #unBlock.scrollIntoView()
  -> look up the matching uid in batchRowByUid -> focus #s-<uid>
  -> comboSearch / comboPick(uid, code) -> r.chosen    // held in memory, not saved
  -> saved later via acceptFamily / acceptRed -> batchApply
```

```
ignoreRow(i)  (4853)
  -> ignoredSet.add(normCode(it.skuN)) ; it.ignored = true
  -> saveIgnored()  [IGN_KEY]      // x no Supabase   // x no logActivity
  -> fadeRemoveRow(i)
  -> renderIgnored(lastUnmatchedRaw.filter(u => ignoredSet.has(normCode(u.skuN))))
  -> updateBindAllCount() ; updateNewCount() ; renderFingerprint()
```

```
waitRow(i)  (4856)
  -> markWaiting(it.sku, it.skuN, it.name)
  -> run(true)   // * immediate reprocess:
                 //   enters the quantity file with 0
                 //   published=No in the price file
```

```
unwaitRow(i)  (4855)
  -> unmarkWaiting(it.sku, it.skuN)
      -> waitingSet.delete + saveWaiting()
      -> db.waiting.remove().catch()
      -> logActivity("waiting_removed")
  -> run(true)
```

وزر جماعي أعلى الجدول:

```
#bindAllBtn -> bindAll90()
  -> targets = lastUnmatched filtered by isConfirmed(it)
  -> confirm(...)                                  // native confirm dialog
  -> await dbSetMappings(targets, "auto-confirmed")  // single bulk write
  -> applyBindLocal(it) ; fadeRemoveRow(i) for each target
  -> renderPills() ; updateBindAllCount() ; updateNewCount()
```

---

# ③ «غير محدود بلا مطابقة»

**البناء داخل `run()`** — ترتيب الفروع حاسم:

```
index.html:3840
  const isInf = String(orig[iQty]).trim().toLowerCase() === "infinite";
...
  if (waiting)                    -> qtyRows.push([..., 0])       // waiting wins first
  else if (hasHistory)            -> absentList.push(...)         // absent wins second
  else if (isInf && !collided)    (3867)
       -> infiniteList.push({ sku: rawKey, skuN, name: orig[iName] || "" })
       -> finalQtyByRaw[rawKey] = Infinity                        // stays live, never hidden
  else                            -> unmatched.push(...)
```

أي أن الصنف يدخل `infiniteList` فقط إذا لم يكن ⏳ ولا له تاريخ مطابقة ولا متصادماً.

**النشر إلى الواجهة:**

```
run()
  -> document.getElementById("sInf").textContent = infiniteList.length   // 4105
  -> lastInfinite = infiniteList                                         // 4114
```

**العرض:**

```
stat card [data-filter="infinite"] -> currentFilter = "infinite" -> renderDetail()
  -> unbar.style.display = "" ; bindBtn.style.display = "none" ; hideBatch()
  -> title.textContent = <heading> + "(" + lastInfinite.length + ")"   // heading text below
  -> wrap.innerHTML = listTableHTML(lastInfinite)   // two columns only: zid SKU | product name
  -> filterUnmatched()
```

نصّ العنوان: «كمية غير محدودة — تُركت كما هي (N)».

`listTableHTML` **لا يولّد أي زر إجراء** — لا `bindRow` ولا `ignoreRow` ولا `waitRow` ولا `toggleUnpublish`. حالة عرض بحتة: صفر كتابة، صفر Supabase، صفر localStorage. الإجراء الوحيد المتاح هو البحث النصي عبر `data-search` ＋ `filterUnmatched()`.

> ملاحظة: غير المحدود **المطابِق** لا يمر من هنا إطلاقاً — يُستبدل بالكمية الحقيقية ويدخل `lastUpdated`.

---

# ④ «متجاهلة سابقاً (9) — اضغط للعرض»

عنصر مستقل تماماً عن `#detailTable`: `<details class="card" id="ignoredCard">` (index.html:1263) — الطيّ سلوك HTML أصلي، لا JS.

```
renderIgnored(list)   (4785)
  -> lastIgnored = list                       // * the index i in unignore(i) points here
  -> #ignoredCount.textContent = list.length
  -> if (!list.length) { card.style.display = "none" ; return }
  -> #ignoredBody.innerHTML = rows: SKU | name | <button onclick="unignore(i)">
```

**المستدعون** — جميعهم يمرّرون نفس التعبير:

```
lastUnmatchedRaw.filter(u => ignoredSet.has(normCode(u.skuN)))

callers: refreshUnmatchedUI()
         ignoreRow(i)
         batchExclude(uid, 'ignore')
         run()
```

```
unignore(i)  (4792)
  -> u = lastIgnored[i]
  -> ignoredSet.delete(normCode(u.skuN))
  -> saveIgnored()  [IGN_KEY]      // x no Supabase   // x no logActivity
  -> refreshUnmatchedUI()
        -> renderIgnored(...) -> updateNewCount() -> updateUnmatchedCard() -> renderDetail()
  -> renderFingerprint()
```

`refreshUnmatchedUI` تعيد الرسم فقط — **لا تعيد** `run()`، فالملفان لا يتغيّران هنا (التجاهل أصلاً خارج كل المخرجات).

الحفظ الدائم لـ`ignoredSet` مساره الوحيد:

```
saveToRepo() -> ignored.json    // GitHub Contents API
```

---

# جدول المقارنة

| | ① دفعي | ② عادي | ③ غير محدود | ④ متجاهلة |
|---|---|---|---|---|
| **مصدر البيانات** | <bdi>`batchData`</bdi> من <bdi>`analyzeBatch()`</bdi> (<bdi>`lastUnmatchedRaw`</bdi> ＋ <bdi>`lastAbsent`</bdi>) | <bdi>`lastUnmatched`</bdi> من <bdi>`buildItems(raw)`</bdi> | <bdi>`lastInfinite`</bdi> من <bdi>`infiniteList`</bdi> في <bdi>`run()`</bdi> | <bdi>`lastIgnored`</bdi> من فلترة <bdi>`lastUnmatchedRaw`</bdi> |
| **الحاوية** | <bdi>`#detailTable`</bdi> (<bdi>`batchMode = true`</bdi>) | <bdi>`#detailTable`</bdi> (<bdi>`renderUnmatchedCard`</bdi>) | <bdi>`#detailTable`</bdi> (<bdi>`listTableHTML`</bdi>) | <bdi>`#ignoredCard`</bdi> مستقل |
| **الفهرس في <bdi>`onclick`</bdi>** | <bdi>`uid`</bdi> ⇐ <bdi>`batchRowByUid`</bdi> | <bdi>`i`</bdi> ⇐ <bdi>`lastUnmatched[i]`</bdi> | — | <bdi>`i`</bdi> ⇐ <bdi>`lastIgnored[i]`</bdi> |
| **الربط** | <bdi>`batchApply`</bdi> ⇐ <bdi>`dbSetMappings`</bdi> <sup>1</sup> | <bdi>`bindRow`</bdi> · <bdi>`bindAll90`</bdi> <sup>2</sup> | ✗ | ✗ |
| **صلاحية** | <bdi>`requireOnline`</bdi> ＋ <bdi>`requireOwner`</bdi> | <bdi>`requireOnline`</bdi> ＋ <bdi>`requireOwner`</bdi> | — | — |
| **⏳ انتظار** | `batchExclude('wait')` | `waitRow` · `unwaitRow` | ✗ | ✗ |
| **✕ تجاهل** | `batchExclude('ignore')` | `ignoreRow` | ✗ | `unignore` <sup>3</sup> |
| **🚫 إلغاء نشر** | ✗ | `toggleUnpublish` <sup>4</sup> | ✗ | ✗ |
| **Supabase** | `mappings` ＋ `waiting_items` | `mappings` ＋ `waiting_items` | ✗ | ✗ |
| **localStorage** | `MAP_KEY` · `WAIT_KEY` · `IGN_KEY` · `ALIAS_KEY` · `TAGS_KEY` | `MAP_KEY` · `WAIT_KEY` · `IGN_KEY` | ✗ | `IGN_KEY` |
| **`logActivity`** | `link_added` · `waiting_added` | `link_added` · `waiting_added` · `waiting_removed` · `unpublish_added` | ✗ | ✗ |
| **يستدعي <bdi>`run(true)`</bdi>** | ✗ | `waitRow` · `unwaitRow` · `toggleUnpublish` <sup>5</sup> | ✗ | ✗ |
| **تراجع** | <bdi>`undoLastBatch`</bdi> (<bdi>`lastBatchUndo`</bdi>) | ✗ | — | — |
| **إعادة الرسم** | <bdi>`analyzeBatch()`</bdi> ＋ <bdi>`renderBatchTab()`</bdi> | <bdi>`fadeRemoveRow(i)`</bdi> ＋ العدّادات | لا شيء | <bdi>`refreshUnmatchedUI()`</bdi> |

### حواشي الجدول

1. كتابة دفعية واحدة (`bulk`) لكل الأزواج المحددة.
2. `bindRow` يكتب رابطاً واحداً عبر `dbSetMapping`؛ و`bindAll90` يكتب دفعة واحدة عبر `dbSetMappings`.
3. `unignore` هو العملية العكسية — يزيل من `ignoredSet` ولا يضيف إليه.
4. للمنتجات الرئيسية فقط (`isMain`)؛ النشر في زد يُدار من المنتج الأب، فالمتغيّرات والآباء يظهر لهم زر معطّل.
5. هذه الثلاث حصراً هي التي تعيد المعالجة فوراً؛ بقية إجراءات الوضع العادي (`bindRow` · `ignoreRow` · `startManualLink`) تكتفي بتحديث العدّادات وإعادة الرسم.

---

# أربع ملاحظات تقنية من التتبّع

1. **`ignoredSet` هو المجموعة الوحيدة بلا أثر سحابي إطلاقاً** — لا `db.*` ولا `logActivity`. `manualMap` قاعدة-أولاً، و`waitingSet` كتابة مزدوجة، بينما `ignoredSet` محلي ＋ `ignored.json` فقط.

2. **تناقض `run(true)` بين المسارين:** `waitRow` يعيد المعالجة فوراً فتتحدث ملفات التنزيل، بينما `batchExclude(uid, 'wait')` يكتفي بإعادة رسم اللوحة. نفس الوسم، نتيجتان مختلفتان على `lastQtyRows` / `lastPriceRows`.

3. **«ربط يدوي» ليس مساراً مستقلاً:** `startManualLink` مجرد جسر يفتح المسار ① ويركّز على الصف — كل الربط اليدوي يمرّ في النهاية عبر `comboPick` ثم `batchApply`.

4. **`dbSetMappings` قاعدة-أولاً بحسم:** السطر `catch { setBusy(false); return; }` في `batchApply` يعني أن فشل Supabase يترك `manualMap` / `boundSet` / `linkTags` سليمة تماماً — لا تشعّب بين المحلي والقاعدة. أما `markWaiting` فمحلي-أولاً مع `.catch(console.warn)`، وهو تشعّب مقصود في المرحلة الانتقالية.
