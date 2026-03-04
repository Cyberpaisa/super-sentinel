-- CreateEnum
CREATE TYPE "TRACERTier" AS ENUM ('VERIFIED', 'PASS', 'PARTIAL', 'FAIL');

-- CreateTable
CREATE TABLE "tracer_scores" (
    "id" TEXT NOT NULL,
    "agent_address" TEXT NOT NULL,

    -- Composite score
    "total_score" INTEGER NOT NULL,

    -- TRACER dimensions (0-100)
    "trust" INTEGER NOT NULL DEFAULT 0,
    "reliability" INTEGER NOT NULL DEFAULT 0,
    "autonomy" INTEGER NOT NULL DEFAULT 0,
    "capability" INTEGER NOT NULL DEFAULT 0,
    "economics" INTEGER NOT NULL DEFAULT 0,
    "reputation" INTEGER NOT NULL DEFAULT 0,

    -- Tier classification
    "tier" "TRACERTier" NOT NULL DEFAULT 'FAIL',

    -- Raw sentinel results for auditability
    "sentinel_results" JSONB,

    -- Timestamps
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tracer_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE INDEX "tracer_scores_agent_address_idx" ON "tracer_scores"("agent_address");
CREATE INDEX "tracer_scores_total_score_idx" ON "tracer_scores"("total_score" DESC);
CREATE INDEX "tracer_scores_tier_idx" ON "tracer_scores"("tier");
CREATE INDEX "tracer_scores_created_at_idx" ON "tracer_scores"("created_at");

-- AddForeignKey
ALTER TABLE "tracer_scores" ADD CONSTRAINT "tracer_scores_agent_address_fkey" FOREIGN KEY ("agent_address") REFERENCES "agents"("address") ON DELETE CASCADE ON UPDATE CASCADE;
