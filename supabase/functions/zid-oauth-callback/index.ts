// ============================================================================
// zid-oauth-callback — Redirection URL المسجَّل في زد.
//   GET ?code=…&state=…
//   ① استهلاك state ذرّياً (UPDATE واحد: used_at IS NULL و< 10 دقائق)
//   ② تبادل الكود: POST oauth.zid.sa/oauth/token
//   ③ التحقّق: store_id موجود في الاستجابة ويساوي المتجر المتوقَّع
//   ④ upsert في zid_tokens على store_id
//   ⑤ صفحة نجاح عربية — بلا أي توكن
//
// تُنشر بـ --no-verify-jwt (متصفّح التاجر يصلها من زد بلا جلسة Supabase). state هو الحماية.
// 🚨 لا يُطبع جسم استجابة زد في أي سجلّ — قد يحمل توكنات.
// ============================================================================
import {
  adminClient, EXPECTED_STORE_ID, failPage, logSafe, newRef,
  REDIRECT_URI, SCOPES, STATE_TTL_MIN, textPage, ZID_OAUTH,
} from "../_shared/zid.ts";

// سجلّ تشخيصي بلا أسرار: أسماء الحقول فقط — لا قيمها.
// يكشف شكل استجابة زد الحقيقي عند أول تشغيل (غير موثّق بالكامل).
async function recordDiag(db: ReturnType<typeof adminClient>, ref: string, kind: string, extra: Record<string, unknown>) {
  try {
    await db.from("zid_app_events").insert({
      event_type: kind,
      store_id: null,
      payload: { ref, ...extra },
      headers: null,
    });
  } catch { /* التشخيص لا يُفشل الاستجابة */ }
}

Deno.serve(async (req) => {
  const ref = newRef();
  if (req.method !== "GET") return failPage(ref, 405);

  let db: ReturnType<typeof adminClient>;
  try { db = adminClient(); } catch { logSafe("cb:env", ref); return failPage(ref, 500); }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");

    // زد قد تعيد ?error=… عند رفض التاجر — لا نطبع قيمته
    if (url.searchParams.has("error")) { logSafe("cb:denied", ref); return failPage(ref, 400); }
    if (!code || !state) { logSafe("cb:missing-params", ref); return failPage(ref, 400); }

    // ① استهلاك state ذرّياً — UPDATE واحد بثلاثة شروط، فالاستهلاك المزدوج مستحيل:
    //    الطلب الثاني بنفس state لا يجد صفّاً used_at فيه NULL.
    const notBefore = new Date(Date.now() - STATE_TTL_MIN * 60_000).toISOString();
    const { data: claimed, error: stErr } = await db
      .from("zid_oauth_state")
      .update({ used_at: new Date().toISOString() })
      .eq("state", state)
      .is("used_at", null)
      .gt("created_at", notBefore)
      .select("state");
    if (stErr) { logSafe("cb:state-db", ref); return failPage(ref, 500); }
    if (!claimed || claimed.length !== 1) { logSafe("cb:state-invalid", ref); return failPage(ref, 400); }

    // ② تبادل الكود
    const clientId = Deno.env.get("ZID_CLIENT_ID");
    const clientSecret = Deno.env.get("ZID_CLIENT_SECRET");
    if (!clientId || !clientSecret) { logSafe("cb:no-secrets", ref); return failPage(ref, 500); }

    const tokenRes = await fetch(`${ZID_OAUTH}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });

    if (!tokenRes.ok) {
      // رمز HTTP فقط — الجسم قد يعكس الكود أو السرّ
      logSafe("cb:token-http", ref, tokenRes.status);
      await recordDiag(db, ref, "oauth_token_error", { http: tokenRes.status });
      return failPage(ref, 502);
    }

    let tok: Record<string, unknown>;
    try { tok = await tokenRes.json(); } catch { logSafe("cb:token-json", ref); return failPage(ref, 502); }

    const accessToken = typeof tok.access_token === "string" ? tok.access_token : null;
    const authorization = typeof tok.authorization === "string" ? tok.authorization : null;
    const refreshToken = typeof tok.refresh_token === "string" ? tok.refresh_token : null;
    const expiresIn = Number(tok.expires_in);
    const storeRaw = tok.store_id;
    const storeId = storeRaw != null && storeRaw !== "" ? String(storeRaw) : null;
    const scopes = typeof tok.scope === "string" && tok.scope ? tok.scope : SCOPES;

    // ③ اكتمال الاستجابة — ناقص ⇒ لا تخزين. نسجّل **أسماء** الحقول فقط لنعرف الشكل الحقيقي.
    const missing = [
      !accessToken && "access_token",
      !authorization && "authorization",
      !refreshToken && "refresh_token",
      !Number.isFinite(expiresIn) && "expires_in",
      !storeId && "store_id",
    ].filter(Boolean);
    if (missing.length) {
      logSafe("cb:token-incomplete", ref);
      await recordDiag(db, ref, "oauth_token_incomplete", { missing, keys: Object.keys(tok) });
      return failPage(ref, 502);
    }

    // المتجر الوحيد المقبول — يمنع تخزين تفويض متجر آخر (ولو بدأ أحدٌ التدفّق وأكمله بمتجره)
    if (storeId !== EXPECTED_STORE_ID) {
      logSafe("cb:store-mismatch", ref);
      await recordDiag(db, ref, "oauth_store_mismatch", { got: storeId, expected: EXPECTED_STORE_ID });
      return failPage(ref, 403);
    }

    // ④ التخزين — UPDATE/INSERT واحد (upsert) على store_id: لا حالة نصفية
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    const { error: upErr } = await db.from("zid_tokens").upsert(
      {
        store_id: storeId,
        access_token: accessToken,
        authorization_token: authorization,
        refresh_token: refreshToken,
        expires_at: expiresAt,
        scopes,
      },
      { onConflict: "store_id" },
    );
    if (upErr) { logSafe("cb:upsert", ref); return failPage(ref, 500); }

    // سجل النشاط — بلا أي توكن
    await db.from("activity_log").insert({
      event_type: "zid_connected",
      zid_sku: null,
      details: { store_id: storeId, scopes, expires_at: expiresAt },
    }).then(() => {}, () => logSafe("cb:activity", ref));

    // ⑤ النجاح
    const days = Math.round(expiresIn / 86400);
    return textPage(
      `✓ تمّ ربط متجرك في زد بنجاح.\n\n` +
      `المتجر: ${storeId}\n` +
      `الصلاحيات: ${scopes} (قراءة فقط)\n` +
      `الصلاحية تنتهي بعد نحو ${days} يوماً.\n\n` +
      `يمكنك إغلاق هذه الصفحة.`,
    );
  } catch {
    logSafe("cb:unexpected", ref);
    return failPage(ref, 500);
  }
});
