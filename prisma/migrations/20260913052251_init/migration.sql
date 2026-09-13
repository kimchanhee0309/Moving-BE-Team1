-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('CUSTOMER', 'MOVER');

-- CreateEnum
CREATE TYPE "SocialProvider" AS ENUM ('NAVER', 'GOOGLE', 'KAKAO');

-- CreateEnum
CREATE TYPE "MoveRequestStatus" AS ENUM ('WAITING', 'CONFIRMED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('PROPOSED', 'REJECTED', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('NEW_QUOTE', 'QUOTE_CONFIRMED', 'NEW_MOVE_REQUEST', 'MOVE_DAY');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "role" "UserRole" NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "passwordHash" VARCHAR(255),
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(20),
    "socialProvider" "SocialProvider",
    "socialId" VARCHAR(255),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "profileImageUrl" TEXT,
    "regionId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mover" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "profileImageUrl" TEXT,
    "nickname" VARCHAR(50) NOT NULL,
    "careerYears" INTEGER NOT NULL,
    "shortIntroduction" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Mover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceType" (
    "id" UUID NOT NULL,
    "name" VARCHAR(30) NOT NULL,

    CONSTRAINT "ServiceType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Region" (
    "id" UUID NOT NULL,
    "name" VARCHAR(30) NOT NULL,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerServiceType" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "serviceTypeId" UUID NOT NULL,

    CONSTRAINT "CustomerServiceType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoverServiceType" (
    "id" UUID NOT NULL,
    "moverId" UUID NOT NULL,
    "serviceTypeId" UUID NOT NULL,

    CONSTRAINT "MoverServiceType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoverRegion" (
    "id" UUID NOT NULL,
    "moverId" UUID NOT NULL,
    "regionId" UUID NOT NULL,

    CONSTRAINT "MoverRegion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoveRequest" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "serviceTypeId" UUID NOT NULL,
    "moveDate" TIMESTAMPTZ(3) NOT NULL,
    "fromAddress" VARCHAR(255) NOT NULL,
    "toAddress" VARCHAR(255) NOT NULL,
    "status" "MoveRequestStatus" NOT NULL DEFAULT 'WAITING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MoveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesignatedRequest" (
    "id" UUID NOT NULL,
    "moveRequestId" UUID NOT NULL,
    "moverId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DesignatedRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" UUID NOT NULL,
    "moveRequestId" UUID NOT NULL,
    "moverId" UUID NOT NULL,
    "price" INTEGER,
    "comment" TEXT,
    "status" "QuoteStatus" NOT NULL DEFAULT 'PROPOSED',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "moveRequestId" UUID NOT NULL,
    "moverId" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "moverId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "moveRequestId" UUID,
    "quoteId" UUID,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "content" TEXT NOT NULL,
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestRejection" (
    "id" TEXT NOT NULL,
    "moveRequestId" TEXT NOT NULL,
    "moverId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestRejection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "User_socialProvider_socialId_key" ON "User"("socialProvider", "socialId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_userId_key" ON "Customer"("userId");

-- CreateIndex
CREATE INDEX "Customer_regionId_idx" ON "Customer"("regionId");

-- CreateIndex
CREATE UNIQUE INDEX "Mover_userId_key" ON "Mover"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Mover_nickname_key" ON "Mover"("nickname");

-- CreateIndex
CREATE INDEX "Mover_nickname_idx" ON "Mover"("nickname");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceType_name_key" ON "ServiceType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Region_name_key" ON "Region"("name");

-- CreateIndex
CREATE INDEX "CustomerServiceType_serviceTypeId_idx" ON "CustomerServiceType"("serviceTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerServiceType_customerId_serviceTypeId_key" ON "CustomerServiceType"("customerId", "serviceTypeId");

-- CreateIndex
CREATE INDEX "MoverServiceType_serviceTypeId_idx" ON "MoverServiceType"("serviceTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "MoverServiceType_moverId_serviceTypeId_key" ON "MoverServiceType"("moverId", "serviceTypeId");

-- CreateIndex
CREATE INDEX "MoverRegion_regionId_idx" ON "MoverRegion"("regionId");

-- CreateIndex
CREATE UNIQUE INDEX "MoverRegion_moverId_regionId_key" ON "MoverRegion"("moverId", "regionId");

-- CreateIndex
CREATE INDEX "MoveRequest_customerId_status_idx" ON "MoveRequest"("customerId", "status");

-- CreateIndex
CREATE INDEX "MoveRequest_serviceTypeId_moveDate_idx" ON "MoveRequest"("serviceTypeId", "moveDate");

-- CreateIndex
CREATE INDEX "MoveRequest_status_moveDate_idx" ON "MoveRequest"("status", "moveDate");

-- CreateIndex
CREATE INDEX "DesignatedRequest_moverId_idx" ON "DesignatedRequest"("moverId");

-- CreateIndex
CREATE UNIQUE INDEX "DesignatedRequest_moveRequestId_moverId_key" ON "DesignatedRequest"("moveRequestId", "moverId");

-- CreateIndex
CREATE INDEX "Quote_moveRequestId_status_idx" ON "Quote"("moveRequestId", "status");

-- CreateIndex
CREATE INDEX "Quote_moverId_status_idx" ON "Quote"("moverId", "status");

-- CreateIndex
CREATE INDEX "Quote_status_createdAt_idx" ON "Quote"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_moveRequestId_moverId_key" ON "Quote"("moveRequestId", "moverId");

-- CreateIndex
CREATE UNIQUE INDEX "Review_moveRequestId_key" ON "Review"("moveRequestId");

-- CreateIndex
CREATE INDEX "Review_customerId_idx" ON "Review"("customerId");

-- CreateIndex
CREATE INDEX "Review_moverId_createdAt_idx" ON "Review"("moverId", "createdAt");

-- CreateIndex
CREATE INDEX "Favorite_moverId_idx" ON "Favorite"("moverId");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_customerId_moverId_key" ON "Favorite"("customerId", "moverId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_moveRequestId_idx" ON "Notification"("moveRequestId");

-- CreateIndex
CREATE INDEX "Notification_quoteId_idx" ON "Notification"("quoteId");

-- CreateIndex
CREATE INDEX "RequestRejection_moverId_createdAt_idx" ON "RequestRejection"("moverId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RequestRejection_moveRequestId_moverId_key" ON "RequestRejection"("moveRequestId", "moverId");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mover" ADD CONSTRAINT "Mover_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerServiceType" ADD CONSTRAINT "CustomerServiceType_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerServiceType" ADD CONSTRAINT "CustomerServiceType_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "ServiceType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoverServiceType" ADD CONSTRAINT "MoverServiceType_moverId_fkey" FOREIGN KEY ("moverId") REFERENCES "Mover"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoverServiceType" ADD CONSTRAINT "MoverServiceType_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "ServiceType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoverRegion" ADD CONSTRAINT "MoverRegion_moverId_fkey" FOREIGN KEY ("moverId") REFERENCES "Mover"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoverRegion" ADD CONSTRAINT "MoverRegion_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoveRequest" ADD CONSTRAINT "MoveRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoveRequest" ADD CONSTRAINT "MoveRequest_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "ServiceType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignatedRequest" ADD CONSTRAINT "DesignatedRequest_moveRequestId_fkey" FOREIGN KEY ("moveRequestId") REFERENCES "MoveRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignatedRequest" ADD CONSTRAINT "DesignatedRequest_moverId_fkey" FOREIGN KEY ("moverId") REFERENCES "Mover"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_moveRequestId_fkey" FOREIGN KEY ("moveRequestId") REFERENCES "MoveRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_moverId_fkey" FOREIGN KEY ("moverId") REFERENCES "Mover"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_moveRequestId_fkey" FOREIGN KEY ("moveRequestId") REFERENCES "MoveRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_moverId_fkey" FOREIGN KEY ("moverId") REFERENCES "Mover"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_moverId_fkey" FOREIGN KEY ("moverId") REFERENCES "Mover"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_moveRequestId_fkey" FOREIGN KEY ("moveRequestId") REFERENCES "MoveRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestRejection" ADD CONSTRAINT "RequestRejection_moveRequestId_fkey" FOREIGN KEY ("moveRequestId") REFERENCES "MoveRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestRejection" ADD CONSTRAINT "RequestRejection_moverId_fkey" FOREIGN KEY ("moverId") REFERENCES "Mover"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
