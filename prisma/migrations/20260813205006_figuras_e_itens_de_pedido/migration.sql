/*
  Warnings:

  - You are about to drop the `FigureState` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "orderItemId" TEXT;

-- AlterTable
ALTER TABLE "GenerationJob" ADD COLUMN     "orderItemId" TEXT;

-- DropTable
DROP TABLE "FigureState";

-- CreateTable
CREATE TABLE "Figure" (
    "slug" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "figureLabel" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "subheadline" TEXT NOT NULL,
    "ctaLabel" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "compareAtCents" INTEGER,
    "bundlePriceCents" INTEGER,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "notice" TEXT,
    "loraUrl" TEXT,
    "loraTrigger" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Figure_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "FigureAddon" (
    "principalSlug" TEXT NOT NULL,
    "adicionalSlug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FigureAddon_pkey" PRIMARY KEY ("principalSlug","adicionalSlug")
);

-- CreateTable
CREATE TABLE "Scene" (
    "id" TEXT NOT NULL,
    "figureSlug" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "hint" TEXT NOT NULL,
    "aspectRatio" TEXT NOT NULL DEFAULT '3:4',
    "setting" TEXT NOT NULL,
    "sampleImage" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Scene_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FigureReference" (
    "id" TEXT NOT NULL,
    "figureSlug" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'image/jpeg',
    "bytes" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FigureReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bonus" (
    "id" TEXT NOT NULL,
    "figureSlug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Bonus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Testimonial" (
    "id" TEXT NOT NULL,
    "figureSlug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Testimonial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "figureSlug" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "sceneRef" TEXT,
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "failureReason" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readyAt" TIMESTAMP(3),

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FigureAddon_principalSlug_sortOrder_idx" ON "FigureAddon"("principalSlug", "sortOrder");

-- CreateIndex
CREATE INDEX "Scene_figureSlug_sortOrder_idx" ON "Scene"("figureSlug", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Scene_figureSlug_sceneId_key" ON "Scene"("figureSlug", "sceneId");

-- CreateIndex
CREATE UNIQUE INDEX "FigureReference_objectKey_key" ON "FigureReference"("objectKey");

-- CreateIndex
CREATE INDEX "FigureReference_figureSlug_sortOrder_idx" ON "FigureReference"("figureSlug", "sortOrder");

-- CreateIndex
CREATE INDEX "Bonus_figureSlug_sortOrder_idx" ON "Bonus"("figureSlug", "sortOrder");

-- CreateIndex
CREATE INDEX "Testimonial_figureSlug_sortOrder_idx" ON "Testimonial"("figureSlug", "sortOrder");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_sortOrder_idx" ON "OrderItem"("orderId", "sortOrder");

-- CreateIndex
CREATE INDEX "OrderItem_status_createdAt_idx" ON "OrderItem"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrderItem_orderId_figureSlug_key" ON "OrderItem"("orderId", "figureSlug");

-- CreateIndex
CREATE INDEX "GenerationJob_orderItemId_idx" ON "GenerationJob"("orderItemId");

-- AddForeignKey
ALTER TABLE "FigureAddon" ADD CONSTRAINT "FigureAddon_principalSlug_fkey" FOREIGN KEY ("principalSlug") REFERENCES "Figure"("slug") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FigureAddon" ADD CONSTRAINT "FigureAddon_adicionalSlug_fkey" FOREIGN KEY ("adicionalSlug") REFERENCES "Figure"("slug") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scene" ADD CONSTRAINT "Scene_figureSlug_fkey" FOREIGN KEY ("figureSlug") REFERENCES "Figure"("slug") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FigureReference" ADD CONSTRAINT "FigureReference_figureSlug_fkey" FOREIGN KEY ("figureSlug") REFERENCES "Figure"("slug") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bonus" ADD CONSTRAINT "Bonus_figureSlug_fkey" FOREIGN KEY ("figureSlug") REFERENCES "Figure"("slug") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Testimonial" ADD CONSTRAINT "Testimonial_figureSlug_fkey" FOREIGN KEY ("figureSlug") REFERENCES "Figure"("slug") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_figureSlug_fkey" FOREIGN KEY ("figureSlug") REFERENCES "Figure"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_sceneRef_fkey" FOREIGN KEY ("sceneRef") REFERENCES "Scene"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
