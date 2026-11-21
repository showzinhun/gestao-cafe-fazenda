-- CreateEnum
CREATE TYPE "status_certificado_fazenda" AS ENUM ('VALIDO', 'VENCIDO', 'SUSPENSO');

-- CreateEnum
CREATE TYPE "status_movimento" AS ENUM ('ABERTO', 'PROCESSADO', 'FINALIZADO', 'ESTORNADO');

-- CreateEnum
CREATE TYPE "status_lote" AS ENUM ('ABERTO', 'PARCIAL', 'UTILIZADO', 'ESTORNADO');

-- CreateEnum
CREATE TYPE "origem_lote" AS ENUM ('COLHEITA', 'TRANSFERENCIA', 'PROCESSO');

-- CreateEnum
CREATE TYPE "tipo_servico" AS ENUM ('BLEND', 'CATACAO', 'REBENEFICIO', 'REAPROVEITAMENTO');

-- CreateEnum
CREATE TYPE "modo_colheita" AS ENUM ('MANUAL', 'SEMIMECANIZADA', 'MECANICA');

-- CreateEnum
CREATE TYPE "finalidade_reserva" AS ENUM ('TRANSFERENCIA', 'CONTRATO', 'SERVICO', 'EMBARQUE');

-- CreateEnum
CREATE TYPE "origem_reserva" AS ENUM ('NENHUMA', 'TRANSFERENCIA', 'CONTRATO', 'SERVICO', 'EMBARQUE');

-- CreateEnum
CREATE TYPE "status_reserva" AS ENUM ('ATIVA', 'CONSUMIDA', 'CANCELADA');

-- CreateTable
CREATE TABLE "fazenda_certificado" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "fazenda_id" UUID NOT NULL,
    "certificado_id" UUID NOT NULL,
    "numero" TEXT,
    "validade_inicio" DATE NOT NULL,
    "validade_fim" DATE NOT NULL,
    "arquivo_url" TEXT,
    "status" "status_certificado_fazenda" NOT NULL DEFAULT 'VALIDO',
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por" UUID,
    "alterado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alterado_por" UUID,

    CONSTRAINT "fazenda_certificado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contador" (
    "empresa_id" UUID NOT NULL,
    "chave" TEXT NOT NULL,
    "valor" INTEGER NOT NULL,

    CONSTRAINT "contador_pkey" PRIMARY KEY ("empresa_id","chave")
);

-- CreateTable
CREATE TABLE "movimento" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "etapa_id" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "fazenda_id" UUID,
    "safra_id" UUID NOT NULL,
    "local_id" UUID,
    "turno_id" UUID,
    "talhao_id" UUID,
    "modo_colheita" "modo_colheita",
    "contrato_id" UUID,
    "servico_tipo" "tipo_servico",
    "data_entrada" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data_saida_local" TIMESTAMPTZ(6),
    "data_resultado" TIMESTAMPTZ(6),
    "status" "status_movimento" NOT NULL DEFAULT 'ABERTO',
    "conferente" TEXT,
    "operador" TEXT,
    "observacao" TEXT,
    "unidade" "unidade" NOT NULL,
    "qtd_entrada" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "qtd_saida" DECIMAL(14,3),
    "qtd_perda" DECIMAL(14,3),
    "perc_quebra" DECIMAL(9,6),
    "rendimento" DECIMAL(12,3),
    "umidade_final" DECIMAL(5,2),
    "mistura_safras" JSONB,
    "finalizado_em" TIMESTAMPTZ(6),
    "finalizado_por" UUID,
    "estornado_em" TIMESTAMPTZ(6),
    "estornado_por" UUID,
    "motivo_estorno" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por" UUID,
    "alterado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alterado_por" UUID,

    CONSTRAINT "movimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimento_entrada" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "movimento_id" UUID NOT NULL,
    "lote_id" UUID NOT NULL,
    "quantidade" DECIMAL(14,3) NOT NULL,
    "unidade" "unidade" NOT NULL,
    "data" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "origem_reserva" "origem_reserva" NOT NULL DEFAULT 'NENHUMA',
    "reserva_id" UUID,
    "cancelada" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por" UUID,
    "alterado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alterado_por" UUID,

    CONSTRAINT "movimento_entrada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lote" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "movimento_id" UUID NOT NULL,
    "etapa_id" UUID NOT NULL,
    "fazenda_id" UUID,
    "safra_id" UUID NOT NULL,
    "tipo_cafe_id" UUID,
    "peneira_id" UUID,
    "unidade" "unidade" NOT NULL,
    "quantidade" DECIMAL(14,3) NOT NULL,
    "quantidade_utilizada" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "quantidade_reservada" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "percentual" DECIMAL(9,6),
    "umidade" DECIMAL(5,2),
    "status" "status_lote" NOT NULL DEFAULT 'ABERTO',
    "origem_tipo" "origem_lote" NOT NULL,
    "data" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observacao" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por" UUID,
    "alterado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alterado_por" UUID,

    CONSTRAINT "lote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lote_certificado" (
    "empresa_id" UUID NOT NULL,
    "lote_id" UUID NOT NULL,
    "certificado_id" UUID NOT NULL,
    "removido_em" TIMESTAMPTZ(6),
    "removido_por" UUID,
    "motivo_remocao" TEXT,

    CONSTRAINT "lote_certificado_pkey" PRIMARY KEY ("lote_id","certificado_id")
);

-- CreateTable
CREATE TABLE "lote_talhao" (
    "empresa_id" UUID NOT NULL,
    "lote_id" UUID NOT NULL,
    "talhao_id" UUID NOT NULL,
    "percentual" DECIMAL(11,10) NOT NULL,
    "quantidade_equivalente" DECIMAL(14,3) NOT NULL,

    CONSTRAINT "lote_talhao_pkey" PRIMARY KEY ("lote_id","talhao_id")
);

-- CreateTable
CREATE TABLE "reserva" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "lote_id" UUID NOT NULL,
    "local_id" UUID,
    "quantidade" DECIMAL(14,3) NOT NULL,
    "finalidade" "finalidade_reserva" NOT NULL,
    "contrato_id" UUID,
    "movimento_id" UUID,
    "status" "status_reserva" NOT NULL DEFAULT 'ATIVA',
    "observacao" TEXT,
    "consumida_em" TIMESTAMPTZ(6),
    "cancelada_em" TIMESTAMPTZ(6),
    "motivo_cancelamento" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por" UUID,
    "alterado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alterado_por" UUID,

    CONSTRAINT "reserva_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fazenda_certificado_empresa_id_fazenda_id_idx" ON "fazenda_certificado"("empresa_id", "fazenda_id");

-- CreateIndex
CREATE INDEX "movimento_empresa_id_local_id_status_idx" ON "movimento"("empresa_id", "local_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "movimento_empresa_id_etapa_id_numero_key" ON "movimento"("empresa_id", "etapa_id", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "movimento_empresa_id_id_key" ON "movimento"("empresa_id", "id");

-- CreateIndex
CREATE INDEX "movimento_entrada_empresa_id_lote_id_idx" ON "movimento_entrada"("empresa_id", "lote_id");

-- CreateIndex
CREATE UNIQUE INDEX "movimento_entrada_movimento_id_lote_id_key" ON "movimento_entrada"("movimento_id", "lote_id");

-- CreateIndex
CREATE INDEX "lote_empresa_id_etapa_id_status_idx" ON "lote"("empresa_id", "etapa_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "lote_empresa_id_codigo_key" ON "lote"("empresa_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "lote_empresa_id_id_key" ON "lote"("empresa_id", "id");

-- CreateIndex
CREATE INDEX "lote_talhao_empresa_id_talhao_id_idx" ON "lote_talhao"("empresa_id", "talhao_id");

-- CreateIndex
CREATE INDEX "reserva_empresa_id_lote_id_status_idx" ON "reserva"("empresa_id", "lote_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "certificado_empresa_id_id_key" ON "certificado"("empresa_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "local_empresa_id_id_key" ON "local"("empresa_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "peneira_empresa_id_id_key" ON "peneira"("empresa_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "turno_empresa_id_id_key" ON "turno"("empresa_id", "id");

-- AddForeignKey
ALTER TABLE "fazenda_certificado" ADD CONSTRAINT "fazenda_certificado_empresa_id_fazenda_id_fkey" FOREIGN KEY ("empresa_id", "fazenda_id") REFERENCES "fazenda"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fazenda_certificado" ADD CONSTRAINT "fazenda_certificado_empresa_id_certificado_id_fkey" FOREIGN KEY ("empresa_id", "certificado_id") REFERENCES "certificado"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimento" ADD CONSTRAINT "movimento_empresa_id_etapa_id_fkey" FOREIGN KEY ("empresa_id", "etapa_id") REFERENCES "etapa"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimento" ADD CONSTRAINT "movimento_empresa_id_fazenda_id_fkey" FOREIGN KEY ("empresa_id", "fazenda_id") REFERENCES "fazenda"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimento" ADD CONSTRAINT "movimento_empresa_id_safra_id_fkey" FOREIGN KEY ("empresa_id", "safra_id") REFERENCES "safra"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimento" ADD CONSTRAINT "movimento_empresa_id_local_id_fkey" FOREIGN KEY ("empresa_id", "local_id") REFERENCES "local"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimento" ADD CONSTRAINT "movimento_empresa_id_talhao_id_fkey" FOREIGN KEY ("empresa_id", "talhao_id") REFERENCES "talhao"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimento_entrada" ADD CONSTRAINT "movimento_entrada_empresa_id_movimento_id_fkey" FOREIGN KEY ("empresa_id", "movimento_id") REFERENCES "movimento"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimento_entrada" ADD CONSTRAINT "movimento_entrada_empresa_id_lote_id_fkey" FOREIGN KEY ("empresa_id", "lote_id") REFERENCES "lote"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lote" ADD CONSTRAINT "lote_empresa_id_movimento_id_fkey" FOREIGN KEY ("empresa_id", "movimento_id") REFERENCES "movimento"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lote" ADD CONSTRAINT "lote_empresa_id_etapa_id_fkey" FOREIGN KEY ("empresa_id", "etapa_id") REFERENCES "etapa"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lote" ADD CONSTRAINT "lote_empresa_id_fazenda_id_fkey" FOREIGN KEY ("empresa_id", "fazenda_id") REFERENCES "fazenda"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lote" ADD CONSTRAINT "lote_empresa_id_safra_id_fkey" FOREIGN KEY ("empresa_id", "safra_id") REFERENCES "safra"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lote" ADD CONSTRAINT "lote_empresa_id_tipo_cafe_id_fkey" FOREIGN KEY ("empresa_id", "tipo_cafe_id") REFERENCES "tipo_cafe"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lote" ADD CONSTRAINT "lote_empresa_id_peneira_id_fkey" FOREIGN KEY ("empresa_id", "peneira_id") REFERENCES "peneira"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lote_certificado" ADD CONSTRAINT "lote_certificado_empresa_id_lote_id_fkey" FOREIGN KEY ("empresa_id", "lote_id") REFERENCES "lote"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lote_certificado" ADD CONSTRAINT "lote_certificado_empresa_id_certificado_id_fkey" FOREIGN KEY ("empresa_id", "certificado_id") REFERENCES "certificado"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lote_talhao" ADD CONSTRAINT "lote_talhao_empresa_id_lote_id_fkey" FOREIGN KEY ("empresa_id", "lote_id") REFERENCES "lote"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lote_talhao" ADD CONSTRAINT "lote_talhao_empresa_id_talhao_id_fkey" FOREIGN KEY ("empresa_id", "talhao_id") REFERENCES "talhao"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reserva" ADD CONSTRAINT "reserva_empresa_id_lote_id_fkey" FOREIGN KEY ("empresa_id", "lote_id") REFERENCES "lote"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reserva" ADD CONSTRAINT "reserva_empresa_id_local_id_fkey" FOREIGN KEY ("empresa_id", "local_id") REFERENCES "local"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reserva" ADD CONSTRAINT "reserva_empresa_id_movimento_id_fkey" FOREIGN KEY ("empresa_id", "movimento_id") REFERENCES "movimento"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

