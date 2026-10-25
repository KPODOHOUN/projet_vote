-- Images importées sans Cloudinary, stockées en base (additif).
CREATE TABLE "StoredImage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "bytes" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoredImage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StoredImage_tenantId_idx" ON "StoredImage"("tenantId");
