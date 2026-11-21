-- CreateEnum
CREATE TYPE "natureza_movimento" AS ENUM ('NORMAL', 'AJUSTE_INVENTARIO');

-- CreateEnum
CREATE TYPE "status_inventario" AS ENUM ('ABERTO', 'CONTADO', 'APROVADO', 'CANCELADO');

-- AlterTable
ALTER TABLE "movimento" ADD COLUMN     "natureza" "natureza_movimento" NOT NULL DEFAULT 'NORMAL';

-- AlterTable
ALTER TABLE "movimento_entrada" ADD COLUMN     "local_origem_id" UUID;

-- CreateTable
CREATE TABLE "lote_local" (
    "empresa_id" UUID NOT NULL,
    "lote_id" UUID NOT NULL,
    "local_id" UUID NOT NULL,
    "quantidade" DECIMAL(14,3) NOT NULL,
    "alterado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lote_local_pkey" PRIMARY KEY ("lote_id","local_id")
);

-- CreateTable
CREATE TABLE "remocao" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "lote_id" UUID NOT NULL,
    "local_origem_id" UUID NOT NULL,
    "local_destino_id" UUID NOT NULL,
    "quantidade" DECIMAL(14,3) NOT NULL,
    "motivo" TEXT,
    "data" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por" UUID,

    CONSTRAINT "remocao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventario" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "local_ids" UUID[],
    "data_contagem" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "status_inventario" NOT NULL DEFAULT 'ABERTO',
    "observacao" TEXT,
    "aprovado_por" UUID,
    "aprovado_em" TIMESTAMPTZ(6),
    "cancelado_em" TIMESTAMPTZ(6),
    "motivo_cancelamento" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por" UUID,
    "alterado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alterado_por" UUID,

    CONSTRAINT "inventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventario_item" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "inventario_id" UUID NOT NULL,
    "lote_id" UUID NOT NULL,
    "local_id" UUID NOT NULL,
    "qtd_sistema" DECIMAL(14,3) NOT NULL,
    "qtd_contada" DECIMAL(14,3),
    "diferenca" DECIMAL(14,3),
    "ajuste_movimento_id" UUID,
    "alterado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alterado_por" UUID,

    CONSTRAINT "inventario_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lote_local_empresa_id_local_id_idx" ON "lote_local"("empresa_id", "local_id");

-- CreateIndex
CREATE INDEX "remocao_empresa_id_lote_id_idx" ON "remocao"("empresa_id", "lote_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventario_empresa_id_numero_key" ON "inventario"("empresa_id", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "inventario_empresa_id_id_key" ON "inventario"("empresa_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "inventario_item_inventario_id_lote_id_local_id_key" ON "inventario_item"("inventario_id", "lote_id", "local_id");

-- AddForeignKey
ALTER TABLE "lote_local" ADD CONSTRAINT "lote_local_empresa_id_lote_id_fkey" FOREIGN KEY ("empresa_id", "lote_id") REFERENCES "lote"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lote_local" ADD CONSTRAINT "lote_local_empresa_id_local_id_fkey" FOREIGN KEY ("empresa_id", "local_id") REFERENCES "local"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remocao" ADD CONSTRAINT "remocao_empresa_id_lote_id_fkey" FOREIGN KEY ("empresa_id", "lote_id") REFERENCES "lote"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario_item" ADD CONSTRAINT "inventario_item_empresa_id_inventario_id_fkey" FOREIGN KEY ("empresa_id", "inventario_id") REFERENCES "inventario"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventario_item" ADD CONSTRAINT "inventario_item_empresa_id_lote_id_fkey" FOREIGN KEY ("empresa_id", "lote_id") REFERENCES "lote"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

