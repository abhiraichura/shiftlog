-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('TRIAL', 'SOLO', 'TEAM', 'AGENCY');

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('OWNER', 'MANAGER', 'STAFF');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('REFUND_ISSUED', 'ORDER_EDITED', 'ORDER_CANCELLED', 'PRODUCT_PRICE_CHANGED', 'PRODUCT_STOCK_CHANGED', 'DISCOUNT_APPLIED', 'CUSTOMER_TAGGED', 'NOTE_ADDED', 'FULFILLMENT_UPDATED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'NORMAL', 'URGENT');

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "ownerEmail" TEXT NOT NULL,
    "ownerName" TEXT,
    "planTier" "PlanTier" NOT NULL DEFAULT 'TRIAL',
    "trialEndsAt" TIMESTAMP(3),
    "billingId" TEXT,
    "billingStatus" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "digestTime" TEXT NOT NULL DEFAULT '09:00',
    "digestEnabled" BOOLEAN NOT NULL DEFAULT true,
    "slackWebhookUrl" TEXT,
    "whatsappNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Store_shop_key" ON "Store"("shop");

-- (rest of tables follow from schema.prisma — run `prisma migrate dev --name init` to generate)
