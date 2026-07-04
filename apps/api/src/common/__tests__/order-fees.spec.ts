import { Decimal } from '@prisma/client/runtime/library';
import { computeOrderTotal } from '../order-fees';

describe('computeOrderTotal', () => {
  it('adds service charge and tax when enabled', () => {
    const total = computeOrderTotal(new Decimal('10.00'), true);
    expect(total.toFixed(2)).toBe('11.91');
  });

  it('applies tax only when service charge is disabled', () => {
    const total = computeOrderTotal(new Decimal('10.00'), false);
    expect(total.toFixed(2)).toBe('10.83');
  });
});
