-- CreateEnum
CREATE TYPE "tipo_pessoa" AS ENUM ('F', 'J');

-- CreateEnum
CREATE TYPE "geometria_tipo" AS ENUM ('PONTO', 'POLIGONO');

-- CreateEnum
CREATE TYPE "unidade_capacidade" AS ENUM ('M2', 'MEDIDA', 'KG', 'SACA');

-- CreateEnum
CREATE TYPE "classe_etapa" AS ENUM ('COLHEITA', 'PROCESSAMENTO', 'ESTOQUE', 'SERVICO', 'SAIDA');

-- CreateEnum
CREATE TYPE "modelo_resultado" AS ENUM ('NENHUM', 'PERCENTUAL_POR_TIPO', 'CAFE_E_PERDA', 'POR_PENEIRA', 'CONVERSAO_ESTOQUE');

-- CreateEnum
CREATE TYPE "unidade" AS ENUM ('MEDIDA', 'KG');

-- CreateEnum
CREATE TYPE "tipo_colheita_preco" AS ENUM ('MANUAL', 'SEMIMECANIZADA');

-- AlterTable
ALTER TABLE "fazenda" ADD COLUMN     "car" TEXT,
ADD COLUMN     "ie" TEXT,
ADD COLUMN     "pais" CHAR(2) NOT NULL DEFAULT 'BR',
ADD COLUMN     "produtor_id" UUID;

-- CreateTable
CREATE TABLE "parceiro" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "tipo_pessoa" "tipo_pessoa" NOT NULL,
    "nome" TEXT NOT NULL,
    "razao_social" TEXT,
    "cpf_cnpj" TEXT,
    "pais" CHAR(2) NOT NULL DEFAULT 'BR',
    "papeis" TEXT[],
    "codigo_erp" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por" UUID,
    "alterado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alterado_por" UUID,

    CONSTRAINT "parceiro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "talhao" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "fazenda_id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "area_ha_informada" DECIMAL(14,4),
    "area_ha_calculada" DECIMAL(14,4),
    "variedade" TEXT,
    "ano_plantio" INTEGER,
    "geometria" JSONB,
    "geometria_tipo" "geometria_tipo",
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por" UUID,
    "alterado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alterado_por" UUID,

    CONSTRAINT "talhao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safra" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "data_inicio" DATE NOT NULL,
    "data_fim" DATE NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por" UUID,
    "alterado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alterado_por" UUID,

    CONSTRAINT "safra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tipo_cafe" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por" UUID,
    "alterado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alterado_por" UUID,

    CONSTRAINT "tipo_cafe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "peneira" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por" UUID,
    "alterado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alterado_por" UUID,

    CONSTRAINT "peneira_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "local" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "fazenda_id" UUID,
    "etapa_id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "capacidade" DECIMAL(14,3),
    "unidade_capacidade" "unidade_capacidade",
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por" UUID,
    "alterado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alterado_por" UUID,

    CONSTRAINT "local_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "turno" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por" UUID,
    "alterado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alterado_por" UUID,

    CONSTRAINT "turno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "motorista" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "cpf" TEXT,
    "cnh" TEXT,
    "placa_padrao" TEXT,
    "transportador_id" UUID,
    "telefone" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por" UUID,
    "alterado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alterado_por" UUID,

    CONSTRAINT "motorista_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificado" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por" UUID,
    "alterado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alterado_por" UUID,

    CONSTRAINT "certificado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "etapa" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "classe" "classe_etapa" NOT NULL,
    "prefixo_lote" TEXT NOT NULL,
    "unidade_entrada" "unidade" NOT NULL,
    "unidade_saida" "unidade" NOT NULL,
    "modelo_resultado" "modelo_resultado" NOT NULL,
    "monitora_secagem" BOOLEAN NOT NULL DEFAULT false,
    "umidade_meta_min" DECIMAL(5,2),
    "umidade_meta_max" DECIMAL(5,2),
    "exige_local" BOOLEAN NOT NULL DEFAULT false,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por" UUID,
    "alterado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alterado_por" UUID,

    CONSTRAINT "etapa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "etapa_tipo_resultado" (
    "empresa_id" UUID NOT NULL,
    "etapa_id" UUID NOT NULL,
    "tipo_cafe_id" UUID NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "etapa_tipo_resultado_pkey" PRIMARY KEY ("etapa_id","tipo_cafe_id")
);

-- CreateTable
CREATE TABLE "fluxo_transicao" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "etapa_origem_id" UUID NOT NULL,
    "etapa_destino_id" UUID NOT NULL,
    "fazenda_id" UUID,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por" UUID,

    CONSTRAINT "fluxo_transicao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tabela_preco_colheita" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "fazenda_id" UUID,
    "safra_id" UUID NOT NULL,
    "tipo_colheita" "tipo_colheita_preco" NOT NULL,
    "talhao_id" UUID,
    "valor_por_medida" DECIMAL(14,2) NOT NULL,
    "vigencia_inicio" DATE NOT NULL,
    "vigencia_fim" DATE,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por" UUID,
    "alterado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alterado_por" UUID,

    CONSTRAINT "tabela_preco_colheita_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "perfil_permissao" (
    "empresa_id" UUID NOT NULL,
    "perfil" "perfil" NOT NULL,
    "permissao" TEXT NOT NULL,
    "permitido" BOOLEAN NOT NULL,

    CONSTRAINT "perfil_permissao_pkey" PRIMARY KEY ("empresa_id","perfil","permissao")
);

-- CreateIndex
CREATE INDEX "parceiro_empresa_id_cpf_cnpj_idx" ON "parceiro"("empresa_id", "cpf_cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "parceiro_empresa_id_id_key" ON "parceiro"("empresa_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "talhao_fazenda_id_codigo_key" ON "talhao"("fazenda_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "talhao_empresa_id_id_key" ON "talhao"("empresa_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "safra_empresa_id_codigo_key" ON "safra"("empresa_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "safra_empresa_id_id_key" ON "safra"("empresa_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "tipo_cafe_empresa_id_codigo_key" ON "tipo_cafe"("empresa_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "tipo_cafe_empresa_id_id_key" ON "tipo_cafe"("empresa_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "peneira_empresa_id_codigo_key" ON "peneira"("empresa_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "local_empresa_id_codigo_key" ON "local"("empresa_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "turno_empresa_id_nome_key" ON "turno"("empresa_id", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "certificado_empresa_id_codigo_key" ON "certificado"("empresa_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "etapa_empresa_id_codigo_key" ON "etapa"("empresa_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "etapa_empresa_id_prefixo_lote_key" ON "etapa"("empresa_id", "prefixo_lote");

-- CreateIndex
CREATE UNIQUE INDEX "etapa_empresa_id_id_key" ON "etapa"("empresa_id", "id");

-- CreateIndex
CREATE INDEX "fluxo_transicao_empresa_id_etapa_origem_id_idx" ON "fluxo_transicao"("empresa_id", "etapa_origem_id");

-- AddForeignKey
ALTER TABLE "fazenda" ADD CONSTRAINT "fazenda_empresa_id_produtor_id_fkey" FOREIGN KEY ("empresa_id", "produtor_id") REFERENCES "parceiro"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talhao" ADD CONSTRAINT "talhao_empresa_id_fazenda_id_fkey" FOREIGN KEY ("empresa_id", "fazenda_id") REFERENCES "fazenda"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "local" ADD CONSTRAINT "local_empresa_id_fazenda_id_fkey" FOREIGN KEY ("empresa_id", "fazenda_id") REFERENCES "fazenda"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "local" ADD CONSTRAINT "local_empresa_id_etapa_id_fkey" FOREIGN KEY ("empresa_id", "etapa_id") REFERENCES "etapa"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "motorista" ADD CONSTRAINT "motorista_empresa_id_transportador_id_fkey" FOREIGN KEY ("empresa_id", "transportador_id") REFERENCES "parceiro"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etapa_tipo_resultado" ADD CONSTRAINT "etapa_tipo_resultado_empresa_id_etapa_id_fkey" FOREIGN KEY ("empresa_id", "etapa_id") REFERENCES "etapa"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etapa_tipo_resultado" ADD CONSTRAINT "etapa_tipo_resultado_empresa_id_tipo_cafe_id_fkey" FOREIGN KEY ("empresa_id", "tipo_cafe_id") REFERENCES "tipo_cafe"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fluxo_transicao" ADD CONSTRAINT "fluxo_transicao_empresa_id_etapa_origem_id_fkey" FOREIGN KEY ("empresa_id", "etapa_origem_id") REFERENCES "etapa"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fluxo_transicao" ADD CONSTRAINT "fluxo_transicao_empresa_id_etapa_destino_id_fkey" FOREIGN KEY ("empresa_id", "etapa_destino_id") REFERENCES "etapa"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fluxo_transicao" ADD CONSTRAINT "fluxo_transicao_empresa_id_fazenda_id_fkey" FOREIGN KEY ("empresa_id", "fazenda_id") REFERENCES "fazenda"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tabela_preco_colheita" ADD CONSTRAINT "tabela_preco_colheita_empresa_id_fazenda_id_fkey" FOREIGN KEY ("empresa_id", "fazenda_id") REFERENCES "fazenda"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tabela_preco_colheita" ADD CONSTRAINT "tabela_preco_colheita_empresa_id_safra_id_fkey" FOREIGN KEY ("empresa_id", "safra_id") REFERENCES "safra"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tabela_preco_colheita" ADD CONSTRAINT "tabela_preco_colheita_empresa_id_talhao_id_fkey" FOREIGN KEY ("empresa_id", "talhao_id") REFERENCES "talhao"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
