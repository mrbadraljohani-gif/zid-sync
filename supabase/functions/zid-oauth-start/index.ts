// ============================================================================
// zid-oauth-start — بداية الربط مع زد.
//   ① تحذف ما تجاوز ساعة من zid_oauth_state
//   ② تولّد state عشوائياً (32 بايت) وتخزّنه
//   ③ توجّه (302) إلى oauth.zid.sa/oauth/authorize
//
// تُنشر بـ --no-verify-jwt (يفتحها المالك من المتصفّح مباشرةً بلا جلسة Supabase).
// لا تكتب شيئاً في زد — توجيه فقط.
// ============================================================================
import {
  adminClient, failPage, logSafe, newRef,
  REDIRECT_URI, SCOPES, STATE_PURGE_MIN, ZID_OAUTH,
} from "../_shared/zid.ts";

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
    if (purgeErr) logSafe("start:purge", ref);   // غير حاجب — التنظيف لا يمنع الربط

    // ② state جديد
    const state = randomState();
    const { error: insErr } = await db.from("zid_oauth_state").insert({ state });
    if (insErr) { logSafe("start:insert-state", ref); return failPage(ref, 500); }

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
