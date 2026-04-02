-- CreateTable
CREATE TABLE "TutorialCategory" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TutorialCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TutorialVideo" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "duration" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "outcomes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "videoUrl" TEXT NOT NULL,
    "videoFileKey" TEXT NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TutorialVideo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TutorialCategory_slug_key" ON "TutorialCategory"("slug");

-- CreateIndex
CREATE INDEX "TutorialCategory_isActive_displayOrder_idx" ON "TutorialCategory"("isActive", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "TutorialVideo_slug_key" ON "TutorialVideo"("slug");

-- CreateIndex
CREATE INDEX "TutorialVideo_isPublished_displayOrder_idx" ON "TutorialVideo"("isPublished", "displayOrder");

-- CreateIndex
CREATE INDEX "TutorialVideo_categoryId_displayOrder_idx" ON "TutorialVideo"("categoryId", "displayOrder");

-- AddForeignKey
ALTER TABLE "TutorialVideo" ADD CONSTRAINT "TutorialVideo_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TutorialCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Bootstrap initial categories
INSERT INTO "TutorialCategory" ("id", "createdAt", "updatedAt", "slug", "label", "description", "displayOrder", "isActive")
VALUES
  (gen_random_uuid()::text, NOW(), NOW(), 'primeros-pasos', 'Primeros pasos', 'Configura tu cuenta y deja la plataforma lista para operar.', 1, true),
  (gen_random_uuid()::text, NOW(), NOW(), 'ventas', 'Ventas', 'Aprende a vender, facturar y cobrar sin fricciones.', 2, true),
  (gen_random_uuid()::text, NOW(), NOW(), 'inventario', 'Inventario', 'Controla productos, stock y movimientos clave.', 3, true),
  (gen_random_uuid()::text, NOW(), NOW(), 'compras', 'Compras', 'Registra compras y manten trazabilidad del abastecimiento.', 4, true),
  (gen_random_uuid()::text, NOW(), NOW(), 'configuracion', 'Configuracion', 'Ajusta permisos, tickets y parametros del negocio.', 5, true)
ON CONFLICT ("slug") DO NOTHING;