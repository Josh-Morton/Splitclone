// Supabase Edge Function: send-push (Phase 9, ADR-0014)
//
// Sends VAPID-signed Web Push messages. Two entry paths:
//
//  1. From Postgres triggers via pg_net — authenticated by the `x-shared-secret`
//     header (pg_net calls carry no Supabase session). Body:
//     { messages: [{ user_id, title, body, url }, ...] }
//     One message per recipient so each person can see THEIR OWN share.
//
//  2. From the app, "Send a test notification" — authenticated by the caller's
//     JWT like every other function here. Body: { test: true }. Pushes only to
//     the caller's own devices.
//
// Dead subscriptions (404/410 from the push service) are deleted as we go, so
// the table self-cleans without a separate job.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-shared-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

interface PushMessage {
  user_id: string;
  title: string;
  body: string;
  url?: string;
}

const admin = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const subject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:noreply@tally.app";
    if (!publicKey || !privateKey) return json({ error: "Push not configured" }, 500);
    webpush.setVapidDetails(subject, publicKey, privateKey);

    const payload = await req.json().catch(() => ({}));
    let messages: PushMessage[] = [];

    if (payload?.test) {
      // Path 2: a signed-in user testing their own devices.
      const authHeader = req.headers.get("Authorization") ?? "";
      const asUser = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const {
        data: { user },
      } = await asUser.auth.getUser();
      if (!user) return json({ error: "Not signed in" }, 401);
      messages = [
        {
          user_id: user.id,
          title: "Tally-ho! Test notification",
          body: "If you can see this, push is working on this device.",
          url: "/",
        },
      ];
    } else {
      // Path 1: a Postgres trigger. Shared secret only.
      const expected = Deno.env.get("PUSH_SHARED_SECRET");
      if (!expected || req.headers.get("x-shared-secret") !== expected) {
        return json({ error: "Unauthorized" }, 401);
      }
      messages = Array.isArray(payload?.messages) ? payload.messages : [];
    }

    if (messages.length === 0) return json({ sent: 0, reason: "no messages" });

    const sb = admin();
    const userIds = [...new Set(messages.map((m) => m.user_id).filter(Boolean))];
    const { data: subs, error } = await sb
      .from("push_subscription")
      .select("id, user_id, endpoint, p256dh, auth_key")
      .in("user_id", userIds);
    if (error) return json({ error: error.message }, 500);
    if (!subs || subs.length === 0) return json({ sent: 0, reason: "no subscriptions" });

    const byUser = new Map<string, typeof subs>();
    for (const s of subs) {
      const list = byUser.get(s.user_id) ?? [];
      list.push(s);
      byUser.set(s.user_id, list);
    }

    let sent = 0;
    const dead: string[] = [];

    await Promise.all(
      messages.flatMap((msg) =>
        (byUser.get(msg.user_id) ?? []).map(async (s) => {
          try {
            await webpush.sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } },
              JSON.stringify({ title: msg.title, body: msg.body, url: msg.url ?? "/" })
            );
            sent++;
          } catch (e) {
            const status = (e as { statusCode?: number }).statusCode;
            // 404/410 = the browser unsubscribed or the endpoint expired.
            if (status === 404 || status === 410) dead.push(s.id);
          }
        })
      )
    );

    if (dead.length > 0) await sb.from("push_subscription").delete().in("id", dead);

    return json({ sent, pruned: dead.length });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
