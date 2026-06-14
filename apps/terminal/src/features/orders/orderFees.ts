/** Keep in sync with `apps/api/src/common/order-fees.ts`. */
export const SERVICE_CHARGE_RATE = 0.1;
export const TAX_RATE = 0.0825;

export type OrderFeeBreakdown = {
  subtotalCents: number;
  serviceChargeCents: number;
  taxCents: number;
  totalCents: number;
};

export function computeOrderFeesCents(
  subtotalCents: number,
  applyServiceCharge: boolean,
): OrderFeeBreakdown {
  const subtotal = Math.max(0, Math.round(subtotalCents));
  const serviceChargeCents = applyServiceCharge
    ? Math.round(subtotal * SERVICE_CHARGE_RATE)
    : 0;
  const taxCents = Math.round((subtotal + serviceChargeCents) * TAX_RATE);
  const totalCents = subtotal + serviceChargeCents + taxCents;
  return { subtotalCents: subtotal, serviceChargeCents, taxCents, totalCents };
}
