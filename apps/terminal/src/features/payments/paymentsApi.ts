import { apiFetch } from "@/features/api-client";
import { requireAccessToken } from "@/features/api-client/auth";

export async function processPaymentOnApi(body: {
  orderId: string;
  method: "CASH" | "CARD_STRIPE" | "CARD_ADYEN" | "SPLIT";
  amount: number;
}): Promise<{ id: string }> {
  const token = requireAccessToken();
  return apiFetch<{ id: string }>("/payments", {
    method: "POST",
    token,
    body: JSON.stringify(body),
  });
}
