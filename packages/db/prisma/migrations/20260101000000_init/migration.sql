-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SourceKey" AS ENUM ('GREENHOUSE', 'LEVER', 'HN_HIRING', 'REMOTEOK', 'GITHUB', 'SEC_EDGAR', 'WEBSITE');

-- CreateEnum
CREATE TYPE "SignalType" AS ENUM ('HIRING', 'FILING', 'OSS_ACTIVITY', 'FUNDING', 'WEBSITE_TECH');

-- CreateEnum
CREATE TYPE "PipelineStage" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SourceHealth" AS ENUM ('HEALTHY', 'DEGRADED', 'DOWN', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "CompanySize" AS ENUM ('STARTUP', 'SMB', 'MID_MARKET', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER');

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "key" "SourceKey" NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL DEFAULT '{}',
    "rateLimitMax" INTEGER NOT NULL DEFAULT 1,
    "rateLimitDurationMs" INTEGER NOT NULL DEFAULT 1000,
    "health" "SourceHealth" NOT NULL DEFAULT 'UNKNOWN',
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "lastSuccessAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "industry" TEXT,
    "region" TEXT,
    "size" "CompanySize",
    "description" TEXT,
    "techHints" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Signal" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "SignalType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL,
    "scrapedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "stage" "PipelineStage" NOT NULL DEFAULT 'NEW',
    "industry" TEXT,
    "region" TEXT,
    "signalTypes" "SignalType"[] DEFAULT ARRAY[]::"SignalType"[],
    "signalCount" INTEGER NOT NULL DEFAULT 0,
    "seq" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadEvent" (
    "seq" BIGSERIAL NOT NULL,
    "leadId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'lead.upserted',
    "payload" JSONB NOT NULL,
    "source" "SourceKey" NOT NULL,
    "scrapedAt" TIMESTAMP(3) NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "LeadEvent_pkey" PRIMARY KEY ("seq")
);

-- CreateTable
CREATE TABLE "ScrapingJob" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "itemsFound" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB NOT NULL DEFAULT '[]',
    "params" JSONB NOT NULL DEFAULT '{}',
    "bullJobId" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScrapingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "refreshTokenHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "industries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "regions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "signalTypes" "SignalType"[] DEFAULT ARRAY[]::"SignalType"[],
    "minScore" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Source_key_key" ON "Source"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Company_domain_key" ON "Company"("domain");

-- CreateIndex
CREATE INDEX "Company_industry_idx" ON "Company"("industry");

-- CreateIndex
CREATE INDEX "Company_region_idx" ON "Company"("region");

-- CreateIndex
CREATE INDEX "Signal_companyId_detectedAt_idx" ON "Signal"("companyId", "detectedAt" DESC);

-- CreateIndex
CREATE INDEX "Signal_type_detectedAt_idx" ON "Signal"("type", "detectedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Signal_sourceId_externalId_key" ON "Signal"("sourceId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_companyId_key" ON "Lead"("companyId");

-- CreateIndex
CREATE INDEX "Lead_score_id_idx" ON "Lead"("score" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Lead_updatedAt_id_idx" ON "Lead"("updatedAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Lead_industry_score_idx" ON "Lead"("industry", "score" DESC);

-- CreateIndex
CREATE INDEX "Lead_region_score_idx" ON "Lead"("region", "score" DESC);

-- CreateIndex
CREATE INDEX "Lead_stage_idx" ON "Lead"("stage");

-- CreateIndex
CREATE INDEX "Lead_signalTypes_idx" ON "Lead" USING GIN ("signalTypes");

-- CreateIndex
CREATE INDEX "LeadEvent_leadId_seq_idx" ON "LeadEvent"("leadId", "seq" DESC);

-- CreateIndex
CREATE INDEX "LeadEvent_ingestedAt_idx" ON "LeadEvent"("ingestedAt");

-- CreateIndex
CREATE INDEX "ScrapingJob_status_createdAt_idx" ON "ScrapingJob"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ScrapingJob_sourceId_createdAt_idx" ON "ScrapingJob"("sourceId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ScrapingJob_createdAt_id_idx" ON "ScrapingJob"("createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Subscription_userId_idx" ON "Subscription"("userId");

-- CreateIndex
CREATE INDEX "Subscription_active_idx" ON "Subscription"("active");

-- AddForeignKey
ALTER TABLE "Signal" ADD CONSTRAINT "Signal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signal" ADD CONSTRAINT "Signal_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadEvent" ADD CONSTRAINT "LeadEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapingJob" ADD CONSTRAINT "ScrapingJob_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

