export type PaymentRiskInput = {
  amountCents: number;
  billingCountry?: string | null;
  shippingCountry?: string | null;
  billingPostalCode?: string | null;
  shippingPostalCode?: string | null;
  avsPostalMatch?: boolean | null;
  cvcCheck?: "pass" | "fail" | "unavailable" | null;
};

export function scorePaymentRisk(input: PaymentRiskInput): { score: number; flags: string[]; reviewRequired: boolean } {
  const flags: string[] = [];
  let score = 0;
  if (input.amountCents >= 100000) { score += 25; flags.push("high_value_order"); }
  if (input.billingCountry && input.shippingCountry && input.billingCountry.toUpperCase() !== input.shippingCountry.toUpperCase()) {
    score += 20; flags.push("billing_shipping_country_mismatch");
  }
  if (input.billingPostalCode && input.shippingPostalCode && input.billingPostalCode.trim().toLowerCase() !== input.shippingPostalCode.trim().toLowerCase()) {
    score += 10; flags.push("billing_shipping_postal_mismatch");
  }
  if (input.avsPostalMatch === false) { score += 25; flags.push("avs_postal_mismatch"); }
  if (input.cvcCheck === "fail") { score += 40; flags.push("cvc_check_failed"); }
  if (input.cvcCheck === "unavailable") { score += 5; flags.push("cvc_check_unavailable"); }
  return { score: Math.min(score, 100), flags, reviewRequired: score >= 40 };
}
