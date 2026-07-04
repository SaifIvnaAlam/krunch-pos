import { Decimal } from '@prisma/client/runtime/library';

/** Keep in sync with `apps/terminal/src/features/orders/orderFees.ts`. */
export const SERVICE_CHARGE_RATE = 0.1;
export const TAX_RATE = 0.0825;

export function roundMoney(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Order total in dollars (subtotal + optional service charge + tax). */
export function computeOrderTotal(
  subtotal: Decimal,
  applyServiceCharge: boolean,
): Decimal {
  const base = roundMoney(Decimal.max(subtotal, 0));
  const serviceCharge = applyServiceCharge
    ? roundMoney(base.mul(SERVICE_CHARGE_RATE))
    : new Decimal(0);
  const tax = roundMoney(base.add(serviceCharge).mul(TAX_RATE));
  return roundMoney(base.add(serviceCharge).add(tax));
}
