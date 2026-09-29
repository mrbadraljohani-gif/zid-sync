// ⚠ ملف مُولَّد — لا تحرّره يدوياً. المصدر: zid-oauth-start/index.ts ＋ _shared/zid.ts
//   أعِد التوليد: node supabase/functions/build-zid-bundles.mjs
// الصقه كاملاً في محرّر الدالّة بلوحة Supabase.

// ───────── _shared/zid.ts (مدمج) ─────────
// ============================================================================
// مشترك بين دوالّ تكامل زد — مصدر واحد للثوابت فلا تنحرف بين start وcallback.
//
// 🚨 لا يُطبع هنا توكن ولا سرّ ولا جسم استجابة من زد — في أي سجلّ أو رسالة.
//    سجلّات Supabase مقروءة؛ المسموح في console: الرمز المرجعي واسم المرحلة ورمز HTTP فقط.
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// 🚨 مطابق **حرفياً** لـ Redirection URL المسجَّل في لوحة الشريك (بلا شرطة مائلة أخيرة).
//    أي اختلاف — ولو حرف — يرفضه خادم OAuth عند التبادل برسالة مبهمة.
const REDIRECT_URI =
  "https://pfbcyxciqrttukayskkg.supabase.co/functions/v1/zid-oauth-callback";

const ZID_OAUTH = "https://oauth.zid.sa";

// نطاقات قراءة فقط — المرحلة الأولى. لا نطاق كتابة إطلاقاً.
const SCOPES = "products.read inventories.read";

// المتجر الوحيد المقبول. أي تفويض لمتجر آخر يُرفض ولا يُخزَّن.
const EXPECTED_STORE_ID = "28494";

// عمر state ومهلة تنظيفه
const STATE_TTL_MIN = 10;     // صلاحية state للاستهلاك
const STATE_PURGE_MIN = 60;   // حذف ما تجاوز ساعة عند كل توليد

// عميل service_role — RLS يمنع كل من سواه على الجداول الثلاثة.
function adminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("env-missing");   // رسالة ثابتة بلا قيم
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// رمز مرجعي قصير يُعاد للمستخدم ويُطبع وحده في السجلّ — للربط بين البلاغ والسجلّ بلا تفاصيل.
function newRef(): string {
  const b = new Uint8Array(5);
  crypto.getRandomValues(b);
  return Array.from(b, x => x.toString(16).padStart(2, "0")).join("");
}

// سجلّ آمن: المرحلة ＋ الرمز ＋ رمز HTTP اختياري ＋ رمز خطأ القاعدة اختياري.
// لا يقبل كائن خطأ عمداً (رسالة الخطأ قد تحمل جسم استجابة فيه توكن).
function logSafe(stage: string, ref: string, httpStatus?: number, dbCode?: string) {
  console.error(`[zid] stage=${stage} ref=${ref}${httpStatus != null ? ` http=${httpStatus}` : ""}${dbCode ? ` db=${dbCode}` : ""}`);
}

// رمز خطأ القاعدة وحده — SQLSTATE من 5 خانات (42501 صلاحية · 42P01 جدول · 42703 عمود
// · 23502 NOT NULL) أو PGRST### من PostgREST (PGRST301 مفتاح مرفوض). الرسالة لا تُطبع أبداً.
// أي قيمة لا تطابق الشكلين تُطبع «other» — فلا يتسرّب نصّ حرّ من الخطأ.
function dbCode(err: unknown): string {
  const c = err && typeof err === "object" ? (err as Record<string, unknown>).code : null;
  if (typeof c === "string" && /^([0-9A-Z]{5}|PGRST\d{3})$/.test(c)) return c;
  return "other";
}

// نوع المفتاح لا قيمته: JWT قديم (eyJ…) · مفتاح جديد (sb_secret_…) · غيره · مفقود.
// يحسم «هل المفتاح المحقون معطَّل؟» بلا كشف أي حرف منه.
function keyKind(): string {
  const k = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!k) return "missing";
  if (k.startsWith("eyJ")) return "jwt";
  if (k.startsWith("sb_secret_")) return "sb_secret";
  return "other";
}

// ⚠ نصّ عادي لا HTML: نطاق *.supabase.co قد يقدّم استجابات HTML للدوالّ كنصّ خام
//    (تُعرض الوسوم حرفياً). النصّ العادي يُقرأ صحيحاً في الحالتين.
function textPage(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function failPage(ref: string, status = 400): Response {
  return textPage(
    `تعذّر إكمال الربط مع زد.\n\nالرمز المرجعي: ${ref}\n\nأعِد المحاولة من البداية، وإن تكرّر الخطأ فاحتفظ بالرمز.`,
    status,
  );
}

// ───────── zid-oauth-start/index.ts ─────────
// ============================================================================
// zid-oauth-start — بداية الربط مع زد.
//   ① تحذف ما تجاوز ساعة من zid_oauth_state
//   ② تولّد state عشوائياً (32 بايت) وتخزّنه
//   ③ توجّه (302) إلى oauth.zid.sa/oauth/authorize
//
// تُنشر بـ --no-verify-jwt (يفتحها المالك من المتصفّح مباشرةً بلا جلسة Supabase).
// لا تكتب شيئاً في زد — توجيه فقط.
// ============================================================================

function randomState(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  // base64url بلا حشو — آمن في الرابط
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

Deno.serve(async (req) => {
  const ref = newRef();
  if (req.method !== "GET") return failPage(ref, 405);

  try {
    const clientId = Deno.env.get("ZID_CLIENT_ID");
    if (!clientId) { logSafe("start:no-client-id", ref); return failPage(ref, 500); }

    const db = adminClient();

    // ① تنظيف: ما تجاوز ساعة (مستهلَكاً كان أم لا)
    const purgeBefore = new Date(Date.now() - STATE_PURGE_MIN * 60_000).toISOString();
    const { error: purgeErr } = await db.from("zid_oauth_state").delete().lt("created_at", purgeBefore);
    // غير حاجب — التنظيف لا يمنع الربط. ⚠ هذا السطر يُطبع **عند الفشل وحده** (لا نجاح يُسجَّل).
    if (purgeErr) logSafe("start:purge-failed:key=" + keyKind(), ref, undefined, dbCode(purgeErr));

    // ② state جديد
    const state = randomState();
    const { error: insErr } = await db.from("zid_oauth_state").insert({ state });
    if (insErr) { logSafe("start:insert-state-failed:key=" + keyKind(), ref, undefined, dbCode(insErr)); return failPage(ref, 500); }

    // ③ التوجيه
    const u = new URL(`${ZID_OAUTH}/oauth/authorize`);
    u.searchParams.set("client_id", clientId);
    u.searchParams.set("redirect_uri", REDIRECT_URI);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("scope", SCOPES);
    u.searchParams.set("state", state);

    return new Response(null, {
      status: 302,
      headers: { Location: u.toString(), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
    });
  } catch {
    logSafe("start:unexpected", ref);
    return failPage(ref, 500);
  }
});
