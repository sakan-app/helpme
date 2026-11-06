import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function claimWebhookEvent(provider: "stripe" | "paypal" | "klarna", eventId: string, eventType: string): Promise<boolean> {
  if (!eventId || eventId.length > 255) throw new Error("Invalid payment event identifier.");
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("payment_webhook_events").insert({
    provider, event_id: eventId, event_type: eventType
  });
  if (!error) return true;
  if (error.code === "23505") return false;
  throw new Error("Could not persist payment webhook event.");
}
