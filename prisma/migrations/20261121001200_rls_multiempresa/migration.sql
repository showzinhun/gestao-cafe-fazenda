-- Isolamento multiempresa (§3.1, RN-22).
-- A aplicação conecta com um papel membro de "cafe_app": sem dono de tabela, sem BYPASSRLS.
-- O servidor define app.empresa_id (e app.usuario_id) no início de cada transação (comTransacao).
-- FORCE ROW LEVEL SECURITY faz as políticas valerem até para o dono das tabelas;
-- só superusuários e papéis com BYPASSRLS (migração, seed, SUPERADMIN) passam por fora.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cafe_app') THEN
    CREATE ROLE cafe_app NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO cafe_app;

-- Contexto da transação. NULL quando não definido: nenhuma linha passa nas políticas.
CREATE OR REPLACE FUNCTION app_empresa_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.empresa_id', true), '')::uuid $$;
CREATE OR REPLACE FUNCTION app_usuario_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.usuario_id', true), '')::uuid $$;
GRANT EXECUTE ON FUNCTION app_empresa_id(), app_usuario_id() TO cafe_app;

-- Privilégios: nada operacional é apagado (regra 4). Só vínculos de acesso aceitam DELETE.
GRANT SELECT, INSERT, UPDATE ON empresa, usuario, usuario_empresa, fazenda TO cafe_app;
GRANT SELECT, INSERT, DELETE ON usuario_fazenda TO cafe_app;
GRANT SELECT, INSERT ON auditoria TO cafe_app; -- auditoria só cresce
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO cafe_app;

-- empresa: a própria empresa ativa e as empresas em que o usuário tem vínculo ativo
-- (para a tela de escolha de empresa, que roda sem empresa definida).
ALTER TABLE empresa ENABLE ROW LEVEL SECURITY;
ALTER TABLE empresa FORCE ROW LEVEL SECURITY;
CREATE POLICY empresa_isolamento ON empresa
  USING (
    id = app_empresa_id()
    OR id IN (SELECT ue.empresa_id FROM usuario_empresa ue WHERE ue.usuario_id = app_usuario_id() AND ue.ativo)
  )
  WITH CHECK (id = app_empresa_id());

-- usuario_empresa: vínculos da empresa ativa e os vínculos do próprio usuário.
ALTER TABLE usuario_empresa ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuario_empresa FORCE ROW LEVEL SECURITY;
CREATE POLICY usuario_empresa_isolamento ON usuario_empresa
  USING (empresa_id = app_empresa_id() OR usuario_id = app_usuario_id())
  WITH CHECK (empresa_id = app_empresa_id());

-- Tabelas de negócio: somente a empresa ativa.
ALTER TABLE fazenda ENABLE ROW LEVEL SECURITY;
ALTER TABLE fazenda FORCE ROW LEVEL SECURITY;
CREATE POLICY fazenda_isolamento ON fazenda
  USING (empresa_id = app_empresa_id()) WITH CHECK (empresa_id = app_empresa_id());

ALTER TABLE usuario_fazenda ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuario_fazenda FORCE ROW LEVEL SECURITY;
CREATE POLICY usuario_fazenda_isolamento ON usuario_fazenda
  USING (empresa_id = app_empresa_id()) WITH CHECK (empresa_id = app_empresa_id());

ALTER TABLE auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria FORCE ROW LEVEL SECURITY;
CREATE POLICY auditoria_isolamento ON auditoria
  USING (empresa_id = app_empresa_id()) WITH CHECK (empresa_id = app_empresa_id());

-- Código da fazenda: 2 a 4 letras maiúsculas (§4.2).
ALTER TABLE fazenda ADD CONSTRAINT fazenda_codigo_formato CHECK (codigo ~ '^[A-Z]{2,4}$');
