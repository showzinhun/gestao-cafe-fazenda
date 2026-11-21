-- DropIndex
DROP INDEX "carga_apontamento_apontamento_id_key";

-- CreateIndex
CREATE INDEX "carga_apontamento_empresa_id_apontamento_id_idx" ON "carga_apontamento"("empresa_id", "apontamento_id");

