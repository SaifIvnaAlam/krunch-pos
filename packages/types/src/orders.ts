export enum OrderStatus {
  OPEN = 'OPEN',
  SENT_TO_KITCHEN = 'SENT_TO_KITCHEN',
  READY = 'READY',
  PAID = 'PAID',
  VOIDED = 'VOIDED',
  HELD = 'HELD',
}

export enum PaymentMethod {
  CASH = 'CASH',
  CARD_STRIPE = 'CARD_STRIPE',
  CARD_ADYEN = 'CARD_ADYEN',
  SPLIT = 'SPLIT',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
  VOIDED = 'VOIDED',
}

export interface CreateOrderRequest {
  branchId: string;
  tableNumber?: string;
  items: CreateOrderItemRequest[];
}

export interface CreateOrderItemRequest {
  menuItemId: string;
  quantity: number;
  modifiers?: Record<string, unknown>;
  notes?: string;
}

export interface OrderDto {
  id: string;
  branchId: string;
  staffId: string;
  tableNumber: string | null;
  status: OrderStatus;
  items: OrderItemDto[];
  payments: PaymentDto[];
  totalAmount: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItemDto {
  id: string;
  orderId: string;
  menuItemId: string;
  quantity: number;
  unitPrice: string;
  modifiers: Record<string, unknown> | null;
  notes: string | null;
  voidedAt: string | null;
  voidedBy: string | null;
}

export interface PaymentDto {
  id: string;
  orderId: string;
  method: PaymentMethod;
  amount: string;
  status: PaymentStatus;
  stripeId: string | null;
  adyenId: string | null;
  idempotencyKey: string;
  createdAt: string;
}

export interface DiscountRequest {
  type: 'percentage' | 'fixed';
  value: number;
  reason: string;
  overrideToken?: string;
}

export interface SplitBillRequest {
  splits: Array<{
    items: string[];
    paymentMethod: PaymentMethod;
  }>;
}

export interface VoidOrderRequest {
  reason: string;
  overrideToken?: string;
}
