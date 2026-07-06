-- Drop classic POS models no longer used by the expense-management web app.

DROP TABLE IF EXISTS "Payment" CASCADE;
DROP TABLE IF EXISTS "OrderItem" CASCADE;
DROP TABLE IF EXISTS "Order" CASCADE;
DROP TABLE IF EXISTS "StockMovement" CASCADE;
DROP TABLE IF EXISTS "StockItem" CASCADE;
DROP TABLE IF EXISTS "MenuItem" CASCADE;

DROP TYPE IF EXISTS "OrderStatus";
DROP TYPE IF EXISTS "PaymentMethod";
DROP TYPE IF EXISTS "PaymentStatus";
DROP TYPE IF EXISTS "StockDirection";
