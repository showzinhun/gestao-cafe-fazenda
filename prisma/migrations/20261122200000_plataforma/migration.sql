-- AlterTable
ALTER TABLE "empresa" ADD COLUMN     "motivo_status" TEXT,
ADD COLUMN     "suspensa_em" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "usuario" ADD COLUMN     "superadmin" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "embarque_detalhe_empresa_id_contrato_id_idx" ON "embarque_detalhe"("empresa_id", "contrato_id");

-- CreateIndex
CREATE INDEX "lote_empresa_id_status_idx" ON "lote"("empresa_id", "status");

-- CreateIndex
CREATE INDEX "lote_empresa_id_movimento_id_idx" ON "lote"("empresa_id", "movimento_id");

-- CreateIndex
CREATE INDEX "movimento_empresa_id_contrato_id_status_idx" ON "movimento"("empresa_id", "contrato_id", "status");

-- CreateIndex
CREATE INDEX "reserva_empresa_id_movimento_id_status_idx" ON "reserva"("empresa_id", "movimento_id", "status");

-- CreateIndex
CREATE INDEX "reserva_empresa_id_contrato_id_status_idx" ON "reserva"("empresa_id", "contrato_id", "status");

