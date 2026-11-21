-- CreateEnum
CREATE TYPE "tipo_alerta" AS ENUM ('PONTO_SECAGEM', 'SECAGEM_LONGA', 'CAPACIDADE', 'CERTIFICADO_VENCENDO', 'CONTRATO_PRAZO', 'EUDR_PENDENTE', 'DIVERGENCIA_CARGA');

-- CreateEnum
CREATE TYPE "severidade_alerta" AS ENUM ('INFO', 'AVISO', 'CRITICO');

-- CreateTable
CREATE TABLE "leitura_secagem" (
    "id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "movimento_id" UUID NOT NULL,
    "data_hora" TIMESTAMPTZ(6) NOT NULL,
    "umidade" DECIMAL(5,2) NOT NULL,
    "temperatura_massa" DECIMAL(5,1),
    "temperatura_ar" DECIMAL(5,1),
    "observacao" TEXT,
    "usuario_id" UUID,
    "dispositivo_id" TEXT,
    "cancelada" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leitura_secagem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerta" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "tipo" "tipo_alerta" NOT NULL,
    "chave" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidade_id" UUID NOT NULL,
    "mensagem" TEXT NOT NULL,
    "severidade" "severidade_alerta" NOT NULL DEFAULT 'AVISO',
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lido_por" UUID,
    "lido_em" TIMESTAMPTZ(6),

    CONSTRAINT "alerta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leitura_secagem_empresa_id_movimento_id_data_hora_idx" ON "leitura_secagem"("empresa_id", "movimento_id", "data_hora");

-- CreateIndex
CREATE INDEX "alerta_empresa_id_lido_em_idx" ON "alerta"("empresa_id", "lido_em");

-- CreateIndex
CREATE UNIQUE INDEX "alerta_empresa_id_chave_key" ON "alerta"("empresa_id", "chave");

-- AddForeignKey
ALTER TABLE "leitura_secagem" ADD CONSTRAINT "leitura_secagem_empresa_id_movimento_id_fkey" FOREIGN KEY ("empresa_id", "movimento_id") REFERENCES "movimento"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

