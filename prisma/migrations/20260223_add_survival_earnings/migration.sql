-- Survival Engine: x402 payment earnings persistence
CREATE TABLE IF NOT EXISTS "survival_earnings" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "tx_hash" TEXT NOT NULL,
    "payer" TEXT NOT NULL,
    "amount_raw" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "survival_earnings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "survival_earnings_tx_hash_key" ON "survival_earnings"("tx_hash");
CREATE INDEX "survival_earnings_created_at_idx" ON "survival_earnings"("created_at");
CREATE INDEX "survival_earnings_payer_idx" ON "survival_earnings"("payer");
