-- CreateEnum
CREATE TYPE "status_empresa" AS ENUM ('ATIVA', 'SUSPENSA');

-- CreateEnum
CREATE TYPE "perfil" AS ENUM ('ADMIN_EMPRESA', 'GESTOR', 'OPERADOR', 'APONTADOR', 'FINANCEIRO', 'COMERCIAL', 'CONSULTA');

-- CreateTable
CREATE TABLE "empresa" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "cnpj" TEXT,
    "plano" TEXT NOT NULL DEFAULT 'BASICO',
    "status" "status_empresa" NOT NULL DEFAULT 'ATIVA',
    "configuracoes" JSONB NOT NULL DEFAULT '{}',
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alterado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alterado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario_empresa" (
    "usuario_id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "perfil" "perfil" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_empresa_pkey" PRIMARY KEY ("usuario_id","empresa_id")
);

-- CreateTable
CREATE TABLE "fazenda" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "municipio" TEXT,
    "uf" CHAR(2),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_por" UUID,
    "alterado_em" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alterado_por" UUID,

    CONSTRAINT "fazenda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario_fazenda" (
    "usuario_id" UUID NOT NULL,
    "fazenda_id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,

    CONSTRAINT "usuario_fazenda_pkey" PRIMARY KEY ("usuario_id","fazenda_id")
);

-- CreateTable
CREATE TABLE "auditoria" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "empresa_id" UUID NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidade_id" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "antes" JSONB,
    "depois" JSONB,
    "usuario_id" UUID,
    "data" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "dispositivo_id" TEXT,

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuario_email_key" ON "usuario"("email");

-- CreateIndex
CREATE INDEX "usuario_empresa_empresa_id_idx" ON "usuario_empresa"("empresa_id");

-- CreateIndex
CREATE UNIQUE INDEX "fazenda_empresa_id_codigo_key" ON "fazenda"("empresa_id", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "fazenda_empresa_id_id_key" ON "fazenda"("empresa_id", "id");

-- CreateIndex
CREATE INDEX "usuario_fazenda_empresa_id_idx" ON "usuario_fazenda"("empresa_id");

-- CreateIndex
CREATE INDEX "auditoria_empresa_id_entidade_entidade_id_idx" ON "auditoria"("empresa_id", "entidade", "entidade_id");

-- AddForeignKey
ALTER TABLE "usuario_empresa" ADD CONSTRAINT "usuario_empresa_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_empresa" ADD CONSTRAINT "usuario_empresa_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fazenda" ADD CONSTRAINT "fazenda_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_fazenda" ADD CONSTRAINT "usuario_fazenda_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_fazenda" ADD CONSTRAINT "usuario_fazenda_empresa_id_fazenda_id_fkey" FOREIGN KEY ("empresa_id", "fazenda_id") REFERENCES "fazenda"("empresa_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
