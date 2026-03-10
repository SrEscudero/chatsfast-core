-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'OPERATOR', 'CLIENT');

-- CreateEnum
CREATE TYPE "InstanceStatus" AS ENUM ('PENDING', 'CONNECTING', 'CONNECTED', 'DISCONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "ConnectionType" AS ENUM ('BAILEYS', 'WHATSAPP_CLOUD');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('CONNECTION_UPDATE', 'MESSAGE_RECEIVED', 'MESSAGE_SENT', 'QR_CODE', 'ERROR', 'WEBHOOK');

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "role" "Role" NOT NULL DEFAULT 'CLIENT',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Instance" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "evolutionApiId" TEXT,
    "clientId" TEXT NOT NULL,
    "status" "InstanceStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "connectionType" "ConnectionType" NOT NULL DEFAULT 'BAILEYS',
    "webhookUrl" TEXT,
    "apiKey" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "lastSeen" TIMESTAMP(3),
    "qrCode" TEXT,
    "config" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Instance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstanceMetrics" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "messagesIn" INTEGER NOT NULL DEFAULT 0,
    "messagesOut" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstanceMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "type" "EventType" NOT NULL,
    "payload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Client_email_key" ON "Client"("email");

-- CreateIndex
CREATE INDEX "Client_email_idx" ON "Client"("email");

-- CreateIndex
CREATE INDEX "Client_role_idx" ON "Client"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Instance_name_key" ON "Instance"("name");

-- CreateIndex
CREATE INDEX "Instance_clientId_idx" ON "Instance"("clientId");

-- CreateIndex
CREATE INDEX "Instance_status_idx" ON "Instance"("status");

-- CreateIndex
CREATE INDEX "Instance_evolutionApiId_idx" ON "Instance"("evolutionApiId");

-- CreateIndex
CREATE INDEX "InstanceMetrics_instanceId_timestamp_idx" ON "InstanceMetrics"("instanceId", "timestamp");

-- CreateIndex
CREATE INDEX "Event_instanceId_createdAt_idx" ON "Event"("instanceId", "createdAt");

-- CreateIndex
CREATE INDEX "Event_processed_createdAt_idx" ON "Event"("processed", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_token_idx" ON "Session"("token");

-- AddForeignKey
ALTER TABLE "Instance" ADD CONSTRAINT "Instance_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstanceMetrics" ADD CONSTRAINT "InstanceMetrics_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
