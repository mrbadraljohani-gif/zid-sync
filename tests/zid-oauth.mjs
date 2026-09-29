// تجهيزة سلوكية لدوالّ OAuth الثلاث — قاعدة وهمية في الذاكرة ＋ fetch وهمي. لا شبكة إطلاقاً.
// ============================================================================
// حارس دوالّ OAuth لزد (zid-oauth-start · zid-oauth-callback · zid-app-callback)
// سلوكي بلا شبكة: قاعدة وهمية في الذاكرة ＋ fetch وهمي. يُشغّل كود الدوالّ الحقيقي
// بعد تجريد أنواع TypeScript (node:module.stripTypeScriptTypes — Node ≥ 22.13).
//
// يثبت: state ذرّي (إعادة/انتهاء/مستهلَك ⇒ رفض بلا تبادل) · redirect_uri حرفي · النطاقان
// · متجر 28494 وحده · استجابة ناقصة لا تُخزَّن · 🚨 لا توكن ولا سرّ في صفحة أو سجلّ
// · 🚫 app-callback لا تمسّ zid_tokens إطلاقاً وتعيد 200 دائماً.
//
// تشغيل:  node tests/zid-oauth.mjs
//         node tests/zid-oauth.mjs --broken   (تحقّق ذاتي: أربع طفرات على الحمايات ⇒ كلٌّ يجب أن يرسب)
// ============================================================================
import { readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const stripTypeScriptTypes = nodeModule.stripTypeScriptTypes;
if (typeof stripTypeScriptTypes !== "function") {
  // لا تخطٍّ صامتاً: حارس يُتخطّى بلا إعلان أخطر من حارس غائب
  console.error("✗ يتطلّب Node ≥ 22.13 (node:module.stripTypeScriptTypes). الحالي: " + process.version);
  process.exit(1);
}
const FN = join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "functions") + "/";
let OVERRIDE = null;   // --broken: مصادر مُطفَّرة تحلّ محلّ الملفّات
const read = rel => (OVERRIDE && OVERRIDE[rel] != null) ? OVERRIDE[rel] : readFileSync(FN + rel, "utf8");

// ---------- قاعدة وهمية ----------
function makeDb() {
  const db = { tables: { zid_tokens: [], zid_oauth_state: [], zid_app_events: [], activity_log: [] }, fail: new Set(), seq: 1, touched: new Set() };
  class Q {
    constructor(t) { this.t = t; this.op = null; this.f = []; this.p = null; this.sel = false; this.one = false; this.oc = null; }
    delete() { this.op = "delete"; return this; }
    insert(p) { this.op = "insert"; this.p = p; return this; }
    update(p) { this.op = "update"; this.p = p; return this; }
    upsert(p, o) { this.op = "upsert"; this.p = p; this.oc = o && o.onConflict; return this; }
    eq(c, v) { this.f.push(r => String(r[c]) === String(v)); return this; }
    is(c, v) { this.f.push(r => (r[c] ?? null) === v); return this; }
    gt(c, v) { this.f.push(r => r[c] > v); return this; }
    lt(c, v) { this.f.push(r => r[c] < v); return this; }
    select() { this.sel = true; return this; }
    single() { this.one = true; return this; }
    then(res, rej) { return Promise.resolve().then(() => this.exec()).then(res, rej); }
    exec() {
      db.touched.add(this.t + ":" + this.op);
      if (db.fail.has(this.t)) return { data: null, error: db.failErr || { message: "fail" } };
      const T = db.tables[this.t];
      const m = r => this.f.every(fn => fn(r));
      const now = new Date().toISOString();
      if (this.op === "delete") { const keep = T.filter(r => !m(r)); const n = T.length - keep.length; db.tables[this.t] = keep; return { data: null, error: null, count: n }; }
      if (this.op === "insert") {
        const rows = (Array.isArray(this.p) ? this.p : [this.p]).map(x => ({ id: db.seq++, created_at: now, used_at: null, ...x }));
        T.push(...rows);
        return { data: this.sel ? (this.one ? rows[0] : rows) : null, error: null };
      }
      if (this.op === "update") { const hit = T.filter(m); hit.forEach(r => Object.assign(r, this.p)); return { data: this.sel ? hit.map(r => ({ ...r })) : null, error: null }; }
      if (this.op === "upsert") {
        const k = this.oc; const ex = T.find(r => String(r[k]) === String(this.p[k]));
        if (ex) Object.assign(ex, this.p, { updated_at: now }); else T.push({ id: db.seq++, created_at: now, ...this.p });
        return { data: null, error: null };
      }
      return { data: null, error: { message: "unsupported" } };
    }
  }
  db.client = { from: t => new Q(t) };
  return db;
}

// ---------- تحميل الوحدات بعد تجريد الأنواع ----------
function load(env, db, fetchImpl, logs) {
  const shSrc = stripTypeScriptTypes(read("_shared/zid.ts"))
    .replace(/^\s*import[\s\S]*?from\s+["'][^"']+["'];/gm, "")
    .replace(/^export\s+/gm, "");
  const names = ["REDIRECT_URI", "ZID_OAUTH", "SCOPES", "EXPECTED_STORE_ID", "STATE_TTL_MIN", "STATE_PURGE_MIN", "adminClient", "newRef", "logSafe", "dbCode", "keyKind", "logAuthorizeUrl", "textPage", "failPage"];
  const Deno = { env: { get: k => env[k] }, serve: h => { Deno._h = h; } };
  const fakeConsole = { error: (...a) => logs.push(a.join(" ")), log: (...a) => logs.push(a.join(" ")), warn: (...a) => logs.push(a.join(" ")) };
  const shared = new Function("Deno", "console", "createClient", shSrc + "\nreturn {" + names.join(",") + "};")(Deno, fakeConsole, () => db.client);
  const mk = rel => {
    const src = stripTypeScriptTypes(read(rel))
      .replace(/^\s*import[\s\S]*?from\s+["'][^"']+["'];/gm, "")
      .replace(/^export\s+/gm, "");
    new Function("Deno", "console", "fetch", "__s", "const {" + names.join(",") + "} = __s;\n" + src)(Deno, fakeConsole, fetchImpl, shared);
    return Deno._h;
  };
  return {
    start: mk("zid-oauth-start/index.ts"),
    callback: mk("zid-oauth-callback/index.ts"),
    app: mk("zid-app-callback/index.ts"),
    shared,
  };
}

// ---------- الحالات ----------
const SECRET = "SUPER-SECRET-CLIENT-SECRET-XYZ";
const TOK = { access_token: "ACCESS-TOKEN-AAAA", authorization: "AUTH-TOKEN-BBBB", refresh_token: "REFRESH-TOKEN-CCCC", expires_in: 31536000, store_id: 28494 };
const ENV = { ZID_CLIENT_ID: "7908", ZID_CLIENT_SECRET: SECRET, SUPABASE_URL: "x", SUPABASE_SERVICE_ROLE_KEY: "SERVICE-ROLE-KEY-DDDD" };
const SECRETS = [SECRET, TOK.access_token, TOK.authorization, TOK.refresh_token, ENV.SUPABASE_SERVICE_ROLE_KEY];
const results = [];
const check = (name, ok, extra = "") => results.push([ok, name, extra]);
const leaks = (texts) => SECRETS.filter(s => texts.some(t => String(t).includes(s)));

async function runSuite() {
  results.length = 0;
  const B = "https://pfbcyxciqrttukayskkg.supabase.co/functions/v1/";

  // ① start
  {
    const db = makeDb(), logs = [];
    db.tables.zid_oauth_state.push({ state: "OLD", created_at: new Date(Date.now() - 2 * 3600e3).toISOString(), used_at: null });
    db.tables.zid_oauth_state.push({ state: "RECENT", created_at: new Date(Date.now() - 5 * 60e3).toISOString(), used_at: null });
    const h = load(ENV, db, async () => { throw new Error("no fetch expected"); }, logs);
    const r = await h.start(new Request(B + "zid-oauth-start"));
    const loc = new URL(r.headers.get("Location") || "http://x/");
    const st = db.tables.zid_oauth_state.map(x => x.state);
    check("start: 302", r.status === 302, "status=" + r.status);
    check("start: يوجّه إلى oauth.zid.sa/oauth/authorize", loc.origin + loc.pathname === "https://oauth.zid.sa/oauth/authorize", loc.origin + loc.pathname);
    check("start: client_id=7908 · response_type=code", loc.searchParams.get("client_id") === "7908" && loc.searchParams.get("response_type") === "code");
    check("start: redirect_uri مطابق حرفياً", loc.searchParams.get("redirect_uri") === B + "zid-oauth-callback", loc.searchParams.get("redirect_uri"));
    // حادثة: إرسال scope بأسماء مخمَّنة أسقط صفحة تفويض زد («Oops! Something broke»).
    // مثال زد الرسمي: client_id · redirect_uri · response_type فقط — والنطاقات من لوحة الشريك.
    check("start: لا يرسل scope (النطاقات من لوحة الشريك)", !loc.searchParams.has("scope"), "scope=" + loc.searchParams.get("scope"));
    check("start: المعاملات الأربعة بالضبط (client_id · redirect_uri · response_type · state)",
      [...loc.searchParams.keys()].sort().join(",") === "client_id,redirect_uri,response_type,state", [...loc.searchParams.keys()].join(","));
    const urlLog = logs.find(l => l.includes("start:authorize-url")) || "";
    check("start: سطر التشخيص يطبع رابط التفويض", urlLog.includes("oauth.zid.sa/oauth/authorize") && urlLog.includes("client_id=7908") && urlLog.includes(encodeURIComponent(B + "zid-oauth-callback")), urlLog.slice(0, 120));
    check("🚨 start: state محجوب في سطر التشخيص (لا القيمة كاملة)", !!loc.searchParams.get("state") && !urlLog.includes(loc.searchParams.get("state")));
    check("🚨 start: لا client_secret في السجلّ", !logs.join("\n").includes(SECRET));
    check("start: state في الرابط مُخزَّن", st.includes(loc.searchParams.get("state")));
    check("start: state طويل عشوائي (≥40 حرفاً)", (loc.searchParams.get("state") || "").length >= 40);
    check("start: حُذف ما تجاوز ساعة · بقي الحديث", !st.includes("OLD") && st.includes("RECENT"));
    check("start: لا كتابة في zid_tokens", ![...db.touched].some(t => t.startsWith("zid_tokens")));
  }

  // ①ب تشخيص فشل القاعدة (حادثة التفويض الأول: purge وinsert فشلا معاً)
  //     رمز الخطأ يُطبع · الرسالة لا تُطبع أبداً ولو حملت سرّاً · نوع المفتاح لا قيمته
  {
    const db = makeDb(), logs = [];
    db.fail.add("zid_oauth_state");
    db.failErr = { code: "42501", message: "permission denied — LEAK-IN-ERROR-MSG-GGGG", details: "LEAK-IN-ERROR-MSG-GGGG" };
    const h = load(ENV, db, async () => { throw new Error("no fetch"); }, logs);
    const r = await h.start(new Request(B + "zid-oauth-start"));
    const all = logs.join("\n");
    check("تشخيص: فشل الإدراج ⇒ 500 برمز مرجعي", r.status === 500);
    check("تشخيص: رمز الخطأ 42501 ظاهر في السجلّ", /insert-state-failed[^\n]* db=42501/.test(all), all.slice(0, 160));
    check("تشخيص: فشل الحذف يُسجَّل برمزه أيضاً", /purge-failed[^\n]* db=42501/.test(all));
    check("تشخيص: نوع المفتاح ظاهر (key=other) لا قيمته", /key=other/.test(all));
    check("🚨 تشخيص: رسالة الخطأ لا تُطبع أبداً", !all.includes("LEAK-IN-ERROR-MSG-GGGG"));
    const L = leaks([all]);
    check("🚨 تشخيص: لا مفتاح service_role في السجلّ", L.length === 0, L.join(","));

    const db2 = makeDb(), logs2 = [];
    db2.fail.add("zid_oauth_state");
    db2.failErr = { code: "free text with spaces", message: "x" };
    const h2 = load(ENV, db2, async () => {}, logs2);
    await h2.start(new Request(B + "zid-oauth-start"));
    check("تشخيص: رمز بشكل غير معياري ⇒ «other» لا نصّ حرّ", logs2.join("\n").includes("db=other") && !logs2.join("\n").includes("free text"));
  }

  // أداة مشتركة لتشغيل callback
  async function runCb({ tokenResp = TOK, tokenStatus = 200, stateAge = 60e3, used = false, replay = false, dbFail = [] } = {}) {
    const db = makeDb(), logs = [];
    dbFail.forEach(t => db.fail.add(t));
    db.tables.zid_oauth_state.push({ state: "S1", created_at: new Date(Date.now() - stateAge).toISOString(), used_at: used ? new Date().toISOString() : null });
    let calls = 0, sentBody = null;
    const fetchImpl = async (url, init) => {
      calls++; sentBody = init && init.body ? String(init.body) : "";
      return new Response(JSON.stringify(tokenResp), { status: tokenStatus, headers: { "Content-Type": "application/json" } });
    };
    const h = load(ENV, db, fetchImpl, logs);
    const r1 = await h.callback(new Request(B + "zid-oauth-callback?code=CODE123&state=S1"));
    const t1 = await r1.text();
    let r2 = null, t2 = "";
    if (replay) { r2 = await h.callback(new Request(B + "zid-oauth-callback?code=CODE123&state=S1")); t2 = await r2.text(); }
    return { db, logs, r1, t1, r2, t2, calls, sentBody };
  }

  // ② المسار الناجح
  {
    const x = await runCb();
    const row = x.db.tables.zid_tokens[0] || {};
    const sb = new URLSearchParams(x.sentBody || "");
    check("callback: نجاح 200", x.r1.status === 200, "status=" + x.r1.status);
    check("callback: تبادل واحد بـgrant_type=authorization_code", x.calls === 1 && sb.get("grant_type") === "authorization_code");
    check("callback: redirect_uri في التبادل مطابق حرفياً", sb.get("redirect_uri") === B + "zid-oauth-callback");
    check("callback: التوكنات الثلاثة مخزَّنة بأسماء الأعمدة", row.access_token === TOK.access_token && row.authorization_token === TOK.authorization && row.refresh_token === TOK.refresh_token);
    check("callback: store_id = 28494 نصّاً", row.store_id === "28494", JSON.stringify(row.store_id));
    check("callback: expires_at بعد ~سنة", Math.abs(new Date(row.expires_at) - Date.now() - 31536000e3) < 60e3);
    check("callback: state استُهلك (used_at مملوء)", !!x.db.tables.zid_oauth_state[0].used_at);
    check("callback: صفحة النجاح عربية", /تمّ ربط متجرك/.test(x.t1));
    check("callback: activity_log سُجِّل بلا توكن", x.db.tables.activity_log.length === 1 && leaks([JSON.stringify(x.db.tables.activity_log)]).length === 0);
    const L = leaks([x.t1, ...x.logs]);
    check("🚨 callback: لا توكن ولا سرّ في الصفحة أو السجلّ", L.length === 0, L.join(","));
  }

  // ③ إعادة استعمال state
  {
    const x = await runCb({ replay: true });
    check("callback: إعادة نفس state ⇒ رفض", x.r2 && x.r2.status === 400, "status=" + (x.r2 && x.r2.status));
    check("callback: إعادة state لا تستدعي التبادل ثانيةً", x.calls === 1, "calls=" + x.calls);
    check("callback: الرفض يحمل رمزاً مرجعياً", /الرمز المرجعي: [0-9a-f]{10}/.test(x.t2));
  }

  // ④ state منتهٍ (11 دقيقة)
  {
    const x = await runCb({ stateAge: 11 * 60e3 });
    check("callback: state منتهٍ ⇒ رفض بلا تبادل", x.r1.status === 400 && x.calls === 0, "status=" + x.r1.status + " calls=" + x.calls);
    check("callback: state منتهٍ ⇒ لا تخزين", x.db.tables.zid_tokens.length === 0);
  }

  // ⑤ state مستهلَك مسبقاً
  {
    const x = await runCb({ used: true });
    check("callback: state مستهلَك ⇒ رفض بلا تبادل", x.r1.status === 400 && x.calls === 0);
  }

  // ⑥ متجر آخر
  {
    const x = await runCb({ tokenResp: { ...TOK, store_id: 99999 } });
    check("callback: متجر غير 28494 ⇒ رفض 403", x.r1.status === 403, "status=" + x.r1.status);
    check("callback: متجر آخر ⇒ لا تخزين", x.db.tables.zid_tokens.length === 0);
    const L = leaks([x.t1, ...x.logs, JSON.stringify(x.db.tables.zid_app_events)]);
    check("🚨 callback: التشخيص بلا توكن", L.length === 0, L.join(","));
  }

  // ⑦ استجابة بلا store_id
  {
    const { store_id, ...noStore } = TOK;
    const x = await runCb({ tokenResp: noStore });
    const ev = x.db.tables.zid_app_events[0] || {};
    check("callback: بلا store_id ⇒ رفض ولا تخزين", x.r1.status === 502 && x.db.tables.zid_tokens.length === 0);
    check("callback: التشخيص يسجّل أسماء الحقول", ev.payload && Array.isArray(ev.payload.keys) && ev.payload.keys.includes("access_token"));
    const L = leaks([JSON.stringify(x.db.tables.zid_app_events), ...x.logs, x.t1]);
    check("🚨 callback: أسماء الحقول لا قيمها", L.length === 0, L.join(","));
  }

  // ⑧ خطأ من نقطة التوكن
  {
    const x = await runCb({ tokenStatus: 400, tokenResp: { error: "invalid_grant", echo: SECRET } });
    check("callback: 400 من زد ⇒ رفض ولا تخزين", x.r1.status === 502 && x.db.tables.zid_tokens.length === 0);
    const L = leaks([x.t1, ...x.logs, JSON.stringify(x.db.tables.zid_app_events)]);
    check("🚨 callback: جسم خطأ زد لا يُطبع (حتى لو عكس السرّ)", L.length === 0, L.join(","));
    check("callback: السجلّ فيه رمز HTTP", x.logs.some(l => /http=400/.test(l)));
  }

  // ⑨ app-callback
  {
    const db = makeDb(), logs = [];
    const h = load(ENV, db, async () => { throw new Error("no fetch"); }, logs);
    db.tables.zid_tokens.push({ store_id: "28494", access_token: "KEEP", refresh_token: "KEEP" });
    const body = JSON.stringify({ event: "app.uninstall", store_id: 28494, secret_in_payload: "PAYLOAD-SECRET-EEEE" });
    const r = await h.app(new Request(B + "zid-app-callback", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer HEADER-SECRET-FFFF" }, body }));
    const ev = db.tables.zid_app_events[0] || {};
    const act = db.tables.activity_log[0] || {};
    check("app: 200", r.status === 200);
    check("app: الخام في zid_app_events", ev.payload && ev.payload.body && ev.payload.body.event === "app.uninstall");
    check("app: event_type/store_id مفهرسان", ev.event_type === "app.uninstall" && ev.store_id === "28494");
    check("app: ترويسة Authorization محجوبة", ev.headers && ev.headers.authorization === "[redacted]");
    check("app: activity_log بلا الحمولة", act.event_type === "zid_app_event" && !JSON.stringify(act).includes("PAYLOAD-SECRET-EEEE"));
    check("🚫 app: التوكنات لم تُمسّ (حدث إلغاء تثبيت)", db.tables.zid_tokens.length === 1 && db.tables.zid_tokens[0].access_token === "KEEP");
    check("🚫 app: لا عملية على zid_tokens إطلاقاً", ![...db.touched].some(t => t.startsWith("zid_tokens")), [...db.touched].join(","));

    const db2 = makeDb(); db2.fail.add("zid_app_events");
    const h2 = load(ENV, db2, async () => {}, []);
    const r2 = await h2.app(new Request(B + "zid-app-callback", { method: "POST", body: "not json" }));
    check("app: 200 حتى عند فشل القاعدة", r2.status === 200);

    const db3 = makeDb();
    const h3 = load(ENV, db3, async () => {}, []);
    await h3.app(new Request(B + "zid-app-callback", { method: "POST", body: "plain text body" }));
    check("app: جسم غير JSON يُخزَّن نصّاً", db3.tables.zid_app_events[0] && db3.tables.zid_app_events[0].payload.body._raw_text === "plain text body");
  }

  return results.map(r => r.slice());
}

// ---------- الطفرات: كلٌّ يكسر حماية حرجة، والحارس يجب أن يرسب عليها ----------
const MUTATIONS = [
  ["إسقاط شرط used_at IS NULL (يسمح بإعادة state)", "zid-oauth-callback/index.ts", '      .is("used_at", null)\n', ""],
  ["طباعة استجابة التوكن في السجلّ", "zid-oauth-callback/index.ts", "try { tok = await tokenRes.json(); }", "try { tok = await tokenRes.json(); console.error(JSON.stringify(tok)); }"],
  ["إسقاط فحص المتجر المتوقَّع", "zid-oauth-callback/index.ts", "if (storeId !== EXPECTED_STORE_ID) {", "if (false) {"],
  ["app-callback تُبطل التوكنات عند الحدث", "zid-app-callback/index.ts", "    return ok(ref);\n  } catch {", '    await db.from("zid_tokens").delete().eq("store_id", "28494");\n    return ok(ref);\n  } catch {'],
];

(async () => {
  if (process.argv.includes("--broken")) {
    let toothless = 0;
    for (const [name, file, from, to] of MUTATIONS) {
      const src = readFileSync(FN + file, "utf8").replace(/\r\n/g, "\n");
      if (!src.includes(from)) { console.error("✗ الطفرة لم تُطبَّق (تغيّر الكود؟): " + name); process.exit(1); }
      OVERRIDE = { [file]: src.replace(from, to) };
      const res = await runSuite();
      OVERRIDE = null;
      const failed = res.filter(r => !r[0]);
      if (!failed.length) { toothless++; console.error("✗ بلا أسنان: " + name); }
      else console.log("✅ رسب على الطفرة: " + name + "  ⇐ " + failed[0][1]);
    }
    if (toothless) process.exit(1);
    console.log("\n✅ تحقّق ذاتي: الطفرات الأربع كلها أُمسكت — للحارس أسنان.");
    process.exit(0);
  }
  // انحراف الحزم: الحزمة المنشورة يجب أن تساوي مصدرها حرفياً (وإلا نُشر كود قديم بصمت)
  const { ZID_FUNCTIONS, buildBundle, bundlePath } = await import("../supabase/functions/build-zid-bundles.mjs");
  const drift = ZID_FUNCTIONS.filter(n => { try { return readFileSync(bundlePath(n), "utf8").replace(/\r\n/g, "\n") !== buildBundle(n); } catch { return true; } });
  const res = await runSuite();
  res.push([drift.length === 0, "الحزم .bundle.ts مطابقة لمصادرها (لا نشر لكود قديم)", drift.length ? "منحرفة: " + drift.join(",") + " — شغّل build-zid-bundles.mjs" : ""]);
  const pass = res.filter(r => r[0]).length, fail = res.length - pass;
  for (const [ok, name, extra] of res) console.log((ok ? "  ✅ " : "  ❌ ") + name + (!ok && extra ? "   ⇐ " + extra : ""));
  console.log(`\nالنتيجة: ${pass} ناجح · ${fail} راسب`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("خطأ في التجهيزة: " + e.message); process.exit(2); });
