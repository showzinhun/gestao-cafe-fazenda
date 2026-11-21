-- CreateEnum
CREATE TYPE "resultado_checagem" AS ENUM ('SEM_ALERTA', 'ALERTA', 'INCONCLUSIVO', 'ERRO');

-- AlterEnum
ALTER TYPE "tipo_alerta" ADD VALUE 'SOBREPOSICAO_TALHAO';

-- AlterTable
ALTER TABLE "embarque_detalhe" DROP COLUMN "certificado_vendido_id",
ADD COLUMN     "certificados_vendidos" UUID[] DEFAULT ARRAY[]::UUID[],
ADD COLUMN     "venda_definida" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "empresa" ADD COLUMN     "ie" TEXT;

-- AlterTable
ALTER TABLE "fazenda_certificado" ADD COLUMN     "arquivo_id" UUID,
ADD COLUMN     "motivo_status" TEXT;

-- AlterTable
ALTER TABLE "movimento" ADD COLUMN     "motivo_quebra" TEXT;

-- AlterTable
ALTER TABLE "talhao" ADD COLUMN     "geometria_hash" TEXT;

-- CreateTable
CREATE TABLE "arquivo" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "conteudo" BYTEA NOT NULL,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por" UUID,

    CONSTRAINT "arquivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checagem_desmatamento" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "talhao_id" UUID NOT NULL,
    "provedor" TEXT NOT NULL,
    "data_checagem" DATE NOT NULL,
    "data_corte" DATE NOT NULL,
    "resultado" "resultado_checagem" NOT NULL,
    "area_alerta_ha" DECIMAL(14,4),
    "evidencia" JSONB,
    "arquivo_id" UUID,
    "versao_geometria_hash" TEXT NOT NULL,
    "observacao" TEXT,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por" UUID,

    CONSTRAINT "checagem_desmatamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rebaixamento" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "movimento_id" UUID NOT NULL,
    "lote_origem_id" UUID NOT NULL,
    "lote_resultado_id" UUID,
    "kg" DECIMAL(14,3) NOT NULL,
    "esquemas_origem" TEXT[],
    "esquemas_resultado" TEXT[],
    "esquemas_perdidos" TEXT[],
    "motivo" TEXT NOT NULL,
    "cancelado" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por" UUID,

    CONSTRAINT "rebaixamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dossie" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "movimento_id" UUID NOT NULL,
    "versao" INTEGER NOT NULL,
    "gerado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gerado_por" UUID,
    "conteudo" JSONB NOT NULL,
    "hash_sha256" TEXT NOT NULL,
    "pendencias" INTEGER NOT NULL,
    "congelado" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "dossie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pacote_embarque" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "movimento_id" UUID NOT NULL,
    "versao" INTEGER NOT NULL,
    "gerado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gerado_por" UUID,
    "conteudo" JSONB NOT NULL,
    "geojson" JSONB NOT NULL,
    "hash_sha256" TEXT NOT NULL,
    "motivo" TEXT,

    CONSTRAINT "pacote_embarque_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "arquivo_empresa_id_id_key" ON "arquivo"("empresa_id", "id");

-- CreateIndex
CREATE INDEX "checagem_desmatamento_empresa_id_talhao_id_criado_em_idx" ON "checagem_desmatamento"("empresa_id", "talhao_id", "criado_em");

-- CreateIndex
CREATE INDEX "rebaixamento_empresa_id_movimento_id_idx" ON "rebaixamento"("empresa_id", "movimento_id");

-- CreateIndex
CREATE UNIQUE INDEX "dossie_empresa_id_movimento_id_versao_key" ON "dossie"("empresa_id", "movimento_id", "versao");

-- CreateIndex
CREATE UNIQUE INDEX "pacote_embarque_empresa_id_movimento_id_versao_key" ON "pacote_embarque"("empresa_id", "movimento_id", "versao");

-- CreateIndex
CREATE UNIQUE INDEX "fazenda_certificado_empresa_id_id_key" ON "fazenda_certificado"("empresa_id", "id");

-- AddForeignKey
ALTER TABLE "fazenda_certificado" ADD CONSTRAINT "fazenda_certificado_empresa_id_arquivo_id_fkey" FOREIGN KEY ("empresa_id", "arquivo_id") REFERENCES "arquivo"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checagem_desmatamento" ADD CONSTRAINT "checagem_desmatamento_empresa_id_talhao_id_fkey" FOREIGN KEY ("empresa_id", "talhao_id") REFERENCES "talhao"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checagem_desmatamento" ADD CONSTRAINT "checagem_desmatamento_empresa_id_arquivo_id_fkey" FOREIGN KEY ("empresa_id", "arquivo_id") REFERENCES "arquivo"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rebaixamento" ADD CONSTRAINT "rebaixamento_empresa_id_movimento_id_fkey" FOREIGN KEY ("empresa_id", "movimento_id") REFERENCES "movimento"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dossie" ADD CONSTRAINT "dossie_empresa_id_movimento_id_fkey" FOREIGN KEY ("empresa_id", "movimento_id") REFERENCES "movimento"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pacote_embarque" ADD CONSTRAINT "pacote_embarque_empresa_id_movimento_id_fkey" FOREIGN KEY ("empresa_id", "movimento_id") REFERENCES "movimento"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

