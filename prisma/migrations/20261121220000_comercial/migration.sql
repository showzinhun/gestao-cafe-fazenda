-- CreateEnum
CREATE TYPE "status_contrato" AS ENUM ('RASCUNHO', 'ASSINADO', 'EM_EXECUCAO', 'CONCLUIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "moeda" AS ENUM ('BRL', 'USD');

-- CreateEnum
CREATE TYPE "tipo_preco" AS ENUM ('FIXO', 'A_FIXAR');

-- CreateEnum
CREATE TYPE "status_amostra" AS ENUM ('ENVIADA', 'APROVADA', 'REPROVADA', 'SEM_RETORNO');

-- CreateTable
CREATE TABLE "contrato" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "codigo" TEXT NOT NULL,
    "cliente_id" UUID NOT NULL,
    "safra_id" UUID,
    "quantidade_sacas" DECIMAL(12,3) NOT NULL,
    "tolerancia_perc" DECIMAL(7,6) NOT NULL DEFAULT 0,
    "descricao_padrao" TEXT,
    "peneira_min_id" UUID,
    "moeda" "moeda" NOT NULL DEFAULT 'BRL',
    "tipo_preco" "tipo_preco" NOT NULL,
    "preco_por_saca" DECIMAL(14,2),
    "diferencial" DECIMAL(14,2),
    "referencia_bolsa" TEXT,
    "prazo_embarque_inicio" DATE,
    "prazo_embarque_fim" DATE,
    "incoterm" TEXT,
    "destino_pais" TEXT,
    "exige_eudr" BOOLEAN NOT NULL DEFAULT false,
    "status" "status_contrato" NOT NULL DEFAULT 'RASCUNHO',
    "observacao" TEXT,
    "assinado_em" TIMESTAMPTZ(6),
    "concluido_em" TIMESTAMPTZ(6),
    "motivo_cancelamento" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por" UUID,
    "alterado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alterado_por" UUID,

    CONSTRAINT "contrato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contrato_certificado" (
    "empresa_id" UUID NOT NULL,
    "contrato_id" UUID NOT NULL,
    "certificado_id" UUID NOT NULL,

    CONSTRAINT "contrato_certificado_pkey" PRIMARY KEY ("contrato_id","certificado_id")
);

-- CreateTable
CREATE TABLE "fixacao_preco" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "contrato_id" UUID NOT NULL,
    "data" DATE NOT NULL,
    "sacas" DECIMAL(12,3) NOT NULL,
    "preco_por_saca" DECIMAL(14,2) NOT NULL,
    "observacao" TEXT,
    "cancelada" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por" UUID,

    CONSTRAINT "fixacao_preco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amostra" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "contrato_id" UUID,
    "cliente_id" UUID NOT NULL,
    "lote_id" UUID NOT NULL,
    "peso_g" INTEGER NOT NULL,
    "data_envio" DATE NOT NULL,
    "transportadora" TEXT,
    "rastreio" TEXT,
    "status" "status_amostra" NOT NULL DEFAULT 'ENVIADA',
    "data_retorno" DATE,
    "comentario_cliente" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por" UUID,
    "alterado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alterado_por" UUID,

    CONSTRAINT "amostra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "embarque_detalhe" (
    "movimento_id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "contrato_id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "data_venda" DATE,
    "data_embarque" DATE,
    "container" TEXT,
    "navio" TEXT,
    "booking" TEXT,
    "numero_dds" TEXT,
    "programado_em" TIMESTAMPTZ(6),
    "programado_por" UUID,
    "motorista_id" UUID,
    "placa" TEXT,
    "transportador_id" UUID,
    "lacres" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "peso_bruto" DECIMAL(14,3),
    "tara" DECIMAL(14,3),
    "peso_liquido" DECIMAL(14,3),
    "diferenca_kg" DECIMAL(14,3),
    "diferenca_perc" DECIMAL(9,6),
    "motivo_diferenca" TEXT,
    "carregado_em" TIMESTAMPTZ(6),
    "carregado_por" UUID,
    "certificado_vendido_id" UUID,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alterado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alterado_por" UUID,

    CONSTRAINT "embarque_detalhe_pkey" PRIMARY KEY ("movimento_id")
);

-- CreateTable
CREATE TABLE "embarque_nota" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "movimento_id" UUID NOT NULL,
    "numero_nota" TEXT NOT NULL,
    "serie" TEXT,
    "chave_nfe" TEXT,
    "data_emissao" DATE NOT NULL,
    "qtd_kg" DECIMAL(14,3) NOT NULL,
    "qtd_sacas" DECIMAL(12,3) NOT NULL,
    "cancelada" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por" UUID,

    CONSTRAINT "embarque_nota_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contrato_empresa_id_codigo_key" ON "contrato"("empresa_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "contrato_empresa_id_ano_numero_key" ON "contrato"("empresa_id", "ano", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "contrato_empresa_id_id_key" ON "contrato"("empresa_id", "id");

-- CreateIndex
CREATE INDEX "amostra_empresa_id_lote_id_idx" ON "amostra"("empresa_id", "lote_id");

-- CreateIndex
CREATE UNIQUE INDEX "embarque_detalhe_empresa_id_movimento_id_key" ON "embarque_detalhe"("empresa_id", "movimento_id");

-- CreateIndex
CREATE INDEX "embarque_nota_empresa_id_movimento_id_idx" ON "embarque_nota"("empresa_id", "movimento_id");

-- CreateIndex
CREATE UNIQUE INDEX "motorista_empresa_id_id_key" ON "motorista"("empresa_id", "id");

-- AddForeignKey
ALTER TABLE "movimento" ADD CONSTRAINT "movimento_empresa_id_contrato_id_fkey" FOREIGN KEY ("empresa_id", "contrato_id") REFERENCES "contrato"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reserva" ADD CONSTRAINT "reserva_empresa_id_contrato_id_fkey" FOREIGN KEY ("empresa_id", "contrato_id") REFERENCES "contrato"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrato" ADD CONSTRAINT "contrato_empresa_id_cliente_id_fkey" FOREIGN KEY ("empresa_id", "cliente_id") REFERENCES "parceiro"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrato" ADD CONSTRAINT "contrato_empresa_id_safra_id_fkey" FOREIGN KEY ("empresa_id", "safra_id") REFERENCES "safra"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrato" ADD CONSTRAINT "contrato_empresa_id_peneira_min_id_fkey" FOREIGN KEY ("empresa_id", "peneira_min_id") REFERENCES "peneira"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrato_certificado" ADD CONSTRAINT "contrato_certificado_empresa_id_contrato_id_fkey" FOREIGN KEY ("empresa_id", "contrato_id") REFERENCES "contrato"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrato_certificado" ADD CONSTRAINT "contrato_certificado_empresa_id_certificado_id_fkey" FOREIGN KEY ("empresa_id", "certificado_id") REFERENCES "certificado"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixacao_preco" ADD CONSTRAINT "fixacao_preco_empresa_id_contrato_id_fkey" FOREIGN KEY ("empresa_id", "contrato_id") REFERENCES "contrato"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amostra" ADD CONSTRAINT "amostra_empresa_id_contrato_id_fkey" FOREIGN KEY ("empresa_id", "contrato_id") REFERENCES "contrato"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amostra" ADD CONSTRAINT "amostra_empresa_id_cliente_id_fkey" FOREIGN KEY ("empresa_id", "cliente_id") REFERENCES "parceiro"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amostra" ADD CONSTRAINT "amostra_empresa_id_lote_id_fkey" FOREIGN KEY ("empresa_id", "lote_id") REFERENCES "lote"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "embarque_detalhe" ADD CONSTRAINT "embarque_detalhe_empresa_id_movimento_id_fkey" FOREIGN KEY ("empresa_id", "movimento_id") REFERENCES "movimento"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "embarque_detalhe" ADD CONSTRAINT "embarque_detalhe_empresa_id_contrato_id_fkey" FOREIGN KEY ("empresa_id", "contrato_id") REFERENCES "contrato"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "embarque_detalhe" ADD CONSTRAINT "embarque_detalhe_empresa_id_motorista_id_fkey" FOREIGN KEY ("empresa_id", "motorista_id") REFERENCES "motorista"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "embarque_nota" ADD CONSTRAINT "embarque_nota_empresa_id_movimento_id_fkey" FOREIGN KEY ("empresa_id", "movimento_id") REFERENCES "movimento"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

