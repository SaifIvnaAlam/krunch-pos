-- Cash In: owner top-up into the cash counter (not sales).
ALTER TABLE "DailyEntry" ADD COLUMN "cashIn" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- Historical opening/closing cascade (bank withdraw + cash in in the cash
-- formula) is applied by scripts/recompute-daily-cash-chain.mjs — not here —
-- so manual opening workarounds are replaced by one consistent chain.
