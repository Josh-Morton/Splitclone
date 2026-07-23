// Supabase Edge Function: notify-removed
//
// Sends a "you've been removed from <space>" email to a member the owner just
// removed. The removed user's email is looked up server-side (service role) —
// the client never sees other members' emails. Sends via Resend if a
// RESEND_API_KEY secret is set; otherwise it no-ops gracefully (returns
// {sent:false}) so removal still works before email is configured.
//
// Auth: requires a signed-in user who is the OWNER of the group in question.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

const FROM = Deno.env.get("RESEND_FROM") ?? "Tally <onboarding@resend.dev>";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
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

    const { removed_user_id, group_id } = await req.json().catch(() => ({}));
    if (!removed_user_id || !group_id) return json({ error: "Missing parameters" }, 400);

    // Service-role client for the cross-user lookups the caller can't do.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // The caller must be the owner of this group.
    const { data: ownerRow } = await admin
      .from("group_member")
      .select("id")
      .eq("group_id", group_id)
      .eq("user_id", user.id)
      .eq("role", "owner")
      .is("deleted_at", null)
      .maybeSingle();
    if (!ownerRow) return json({ error: "Only the owner can notify" }, 403);

    const { data: grp } = await admin.from("group").select("name").eq("id", group_id).maybeSingle();
    const groupName = grp?.name ?? "the space";
    const { data: ownerProfile } = await admin
      .from("profile")
      .select("display_name")
      .eq("user_id", user.id)
      .maybeSingle();
    const ownerName = ownerProfile?.display_name || "The space owner";

    const { data: target } = await admin.auth.admin.getUserById(removed_user_id);
    const toEmail = target?.user?.email;
    if (!toEmail) return json({ sent: false, reason: "no email on file" });

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) return json({ sent: false, reason: "email not configured" });

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: [toEmail],
        subject: `You've been removed from "${groupName}" on Tally`,
        text:
          `Hi,\n\n${ownerName} has removed you from the shared space "${groupName}" on Tally. ` +
          `You no longer have access to its expenses.\n\n` +
          `If you think this was a mistake, ask ${ownerName} to invite you again.\n\n— Tally`,
      }),
    });
    if (!res.ok) {
      return json({ sent: false, reason: `resend ${res.status}`, detail: (await res.text()).slice(0, 200) });
    }
    return json({ sent: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
