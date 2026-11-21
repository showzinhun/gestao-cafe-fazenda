-- CreateEnum
CREATE TYPE "status_apontamento" AS ENUM ('PENDENTE', 'FECHADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "tipo_colheita_carga" AS ENUM ('MANUAL', 'SEMIMECANIZADA', 'MECANICA', 'VARIOS');

-- CreateEnum
CREATE TYPE "status_fechamento" AS ENUM ('ABERTO', 'FECHADO', 'PAGO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "tipo_lancamento_colhedor" AS ENUM ('ADIANTAMENTO', 'DESCONTO', 'ADICIONAL');

-- CreateTable
CREATE TABLE "turma" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "fazenda_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "responsavel" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por" UUID,
    "alterado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alterado_por" UUID,

    CONSTRAINT "turma_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "colhedor" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "turma_id" UUID,
    "nome" TEXT NOT NULL,
    "apelido" TEXT,
    "cpf_cifrado" TEXT,
    "cpf_mascara" TEXT,
    "cpf_hash" TEXT,
    "pix_cifrado" TEXT,
    "pix_mascara" TEXT,
    "telefone" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por" UUID,
    "alterado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alterado_por" UUID,

    CONSTRAINT "colhedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "apontamento" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "data" DATE NOT NULL,
    "fazenda_id" UUID NOT NULL,
    "talhao_id" UUID NOT NULL,
    "safra_id" UUID NOT NULL,
    "colhedor_id" UUID NOT NULL,
    "turma_id" UUID,
    "tipo_cafe_id" UUID,
    "tipo_colheita" "tipo_colheita_preco" NOT NULL DEFAULT 'MANUAL',
    "medidas" DECIMAL(14,3) NOT NULL,
    "apontador_id" UUID,
    "dispositivo_id" TEXT,
    "criado_offline_em" TIMESTAMPTZ(6),
    "sincronizado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "valor_unitario" DECIMAL(14,2),
    "status" "status_apontamento" NOT NULL DEFAULT 'PENDENTE',
    "fechamento_id" UUID,
    "motivo_correcao" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alterado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alterado_por" UUID,

    CONSTRAINT "apontamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "apontamento_origem" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "apontamento_id" UUID NOT NULL,
    "medidas" DECIMAL(14,3) NOT NULL,
    "dispositivo_id" TEXT,
    "criado_offline_em" TIMESTAMPTZ(6),
    "recebido_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alterado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "apontamento_origem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carga_colheita" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "data" DATE NOT NULL,
    "fazenda_id" UUID NOT NULL,
    "talhao_id" UUID NOT NULL,
    "safra_id" UUID NOT NULL,
    "tipo_cafe_id" UUID NOT NULL,
    "tipo_colheita" "tipo_colheita_carga" NOT NULL,
    "tipo_transporte" TEXT,
    "operador_maquina" TEXT,
    "medidas_medidas" DECIMAL(14,3) NOT NULL,
    "medidas_apontadas" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "divergencia" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "divergencia_perc" DECIMAL(9,6),
    "alerta_divergencia" BOOLEAN NOT NULL DEFAULT false,
    "movimento_id" UUID NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por" UUID,

    CONSTRAINT "carga_colheita_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carga_apontamento" (
    "empresa_id" UUID NOT NULL,
    "carga_id" UUID NOT NULL,
    "apontamento_id" UUID NOT NULL,

    CONSTRAINT "carga_apontamento_pkey" PRIMARY KEY ("carga_id","apontamento_id")
);

-- CreateTable
CREATE TABLE "fechamento_pagamento" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "fazenda_id" UUID NOT NULL,
    "periodo_inicio" DATE NOT NULL,
    "periodo_fim" DATE NOT NULL,
    "status" "status_fechamento" NOT NULL DEFAULT 'ABERTO',
    "total_medidas" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "total_bruto" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_descontos" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_liquido" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "fechado_por" UUID,
    "fechado_em" TIMESTAMPTZ(6),
    "pago_por" UUID,
    "pago_em" TIMESTAMPTZ(6),
    "motivo_reabertura" TEXT,
    "motivo_cancelamento" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por" UUID,
    "alterado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alterado_por" UUID,

    CONSTRAINT "fechamento_pagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fechamento_item" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "fechamento_id" UUID NOT NULL,
    "colhedor_id" UUID NOT NULL,
    "medidas" DECIMAL(14,3) NOT NULL,
    "valor_bruto" DECIMAL(14,2) NOT NULL,
    "adiantamentos" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "descontos" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "adicionais" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "valor_liquido" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "fechamento_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lancamento_colhedor" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "colhedor_id" UUID NOT NULL,
    "data" DATE NOT NULL,
    "tipo" "tipo_lancamento_colhedor" NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "descricao" TEXT,
    "fechamento_id" UUID,
    "cancelado" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por" UUID,

    CONSTRAINT "lancamento_colhedor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "turma_fazenda_id_nome_key" ON "turma"("fazenda_id", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "turma_empresa_id_id_key" ON "turma"("empresa_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "colhedor_empresa_id_id_key" ON "colhedor"("empresa_id", "id");

-- CreateIndex
CREATE INDEX "apontamento_empresa_id_fazenda_id_data_status_idx" ON "apontamento"("empresa_id", "fazenda_id", "data", "status");

-- CreateIndex
CREATE UNIQUE INDEX "apontamento_empresa_id_id_key" ON "apontamento"("empresa_id", "id");

-- CreateIndex
CREATE INDEX "apontamento_origem_empresa_id_apontamento_id_idx" ON "apontamento_origem"("empresa_id", "apontamento_id");

-- CreateIndex
CREATE INDEX "carga_colheita_empresa_id_data_idx" ON "carga_colheita"("empresa_id", "data");

-- CreateIndex
CREATE UNIQUE INDEX "carga_colheita_empresa_id_movimento_id_key" ON "carga_colheita"("empresa_id", "movimento_id");

-- CreateIndex
CREATE UNIQUE INDEX "carga_colheita_empresa_id_id_key" ON "carga_colheita"("empresa_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "carga_apontamento_apontamento_id_key" ON "carga_apontamento"("apontamento_id");

-- CreateIndex
CREATE UNIQUE INDEX "fechamento_pagamento_empresa_id_numero_key" ON "fechamento_pagamento"("empresa_id", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "fechamento_pagamento_empresa_id_id_key" ON "fechamento_pagamento"("empresa_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "fechamento_item_fechamento_id_colhedor_id_key" ON "fechamento_item"("fechamento_id", "colhedor_id");

-- CreateIndex
CREATE INDEX "lancamento_colhedor_empresa_id_colhedor_id_idx" ON "lancamento_colhedor"("empresa_id", "colhedor_id");

-- AddForeignKey
ALTER TABLE "turma" ADD CONSTRAINT "turma_empresa_id_fazenda_id_fkey" FOREIGN KEY ("empresa_id", "fazenda_id") REFERENCES "fazenda"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colhedor" ADD CONSTRAINT "colhedor_empresa_id_turma_id_fkey" FOREIGN KEY ("empresa_id", "turma_id") REFERENCES "turma"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apontamento" ADD CONSTRAINT "apontamento_empresa_id_fazenda_id_fkey" FOREIGN KEY ("empresa_id", "fazenda_id") REFERENCES "fazenda"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apontamento" ADD CONSTRAINT "apontamento_empresa_id_talhao_id_fkey" FOREIGN KEY ("empresa_id", "talhao_id") REFERENCES "talhao"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apontamento" ADD CONSTRAINT "apontamento_empresa_id_safra_id_fkey" FOREIGN KEY ("empresa_id", "safra_id") REFERENCES "safra"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apontamento" ADD CONSTRAINT "apontamento_empresa_id_colhedor_id_fkey" FOREIGN KEY ("empresa_id", "colhedor_id") REFERENCES "colhedor"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apontamento" ADD CONSTRAINT "apontamento_empresa_id_turma_id_fkey" FOREIGN KEY ("empresa_id", "turma_id") REFERENCES "turma"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apontamento" ADD CONSTRAINT "apontamento_empresa_id_fechamento_id_fkey" FOREIGN KEY ("empresa_id", "fechamento_id") REFERENCES "fechamento_pagamento"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apontamento_origem" ADD CONSTRAINT "apontamento_origem_empresa_id_apontamento_id_fkey" FOREIGN KEY ("empresa_id", "apontamento_id") REFERENCES "apontamento"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carga_colheita" ADD CONSTRAINT "carga_colheita_empresa_id_fazenda_id_fkey" FOREIGN KEY ("empresa_id", "fazenda_id") REFERENCES "fazenda"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carga_colheita" ADD CONSTRAINT "carga_colheita_empresa_id_talhao_id_fkey" FOREIGN KEY ("empresa_id", "talhao_id") REFERENCES "talhao"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carga_colheita" ADD CONSTRAINT "carga_colheita_empresa_id_safra_id_fkey" FOREIGN KEY ("empresa_id", "safra_id") REFERENCES "safra"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carga_colheita" ADD CONSTRAINT "carga_colheita_empresa_id_movimento_id_fkey" FOREIGN KEY ("empresa_id", "movimento_id") REFERENCES "movimento"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carga_apontamento" ADD CONSTRAINT "carga_apontamento_empresa_id_carga_id_fkey" FOREIGN KEY ("empresa_id", "carga_id") REFERENCES "carga_colheita"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carga_apontamento" ADD CONSTRAINT "carga_apontamento_empresa_id_apontamento_id_fkey" FOREIGN KEY ("empresa_id", "apontamento_id") REFERENCES "apontamento"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fechamento_pagamento" ADD CONSTRAINT "fechamento_pagamento_empresa_id_fazenda_id_fkey" FOREIGN KEY ("empresa_id", "fazenda_id") REFERENCES "fazenda"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fechamento_item" ADD CONSTRAINT "fechamento_item_empresa_id_fechamento_id_fkey" FOREIGN KEY ("empresa_id", "fechamento_id") REFERENCES "fechamento_pagamento"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fechamento_item" ADD CONSTRAINT "fechamento_item_empresa_id_colhedor_id_fkey" FOREIGN KEY ("empresa_id", "colhedor_id") REFERENCES "colhedor"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamento_colhedor" ADD CONSTRAINT "lancamento_colhedor_empresa_id_colhedor_id_fkey" FOREIGN KEY ("empresa_id", "colhedor_id") REFERENCES "colhedor"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamento_colhedor" ADD CONSTRAINT "lancamento_colhedor_empresa_id_fechamento_id_fkey" FOREIGN KEY ("empresa_id", "fechamento_id") REFERENCES "fechamento_pagamento"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

