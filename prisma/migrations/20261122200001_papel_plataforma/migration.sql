-- Área da plataforma (SUPERADMIN, §3.1 e §3.2): papel de banco separado.
-- "cafe_plataforma" passa por fora da RLS (BYPASSRLS), mas só tem privilégio sobre empresas, usuários,
-- vínculos e os cadastros-base que a criação de empresa copia. Nenhuma tabela operacional (lotes, movimentos,
-- colhedores, contratos...) é concedida: o SUPERADMIN não vê dados operacionais.
-- O login da aplicação recebe o papel sem herança (só SET ROLE, feito pelo serviço da plataforma após conferir o usuário).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cafe_plataforma') THEN
    CREATE ROLE cafe_plataforma NOLOGIN BYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO cafe_plataforma;
GRANT EXECUTE ON FUNCTION app_empresa_id(), app_usuario_id() TO cafe_plataforma;
GRANT SELECT, INSERT, UPDATE ON empresa TO cafe_plataforma;
GRANT SELECT, INSERT ON usuario, usuario_empresa TO cafe_plataforma;
GRANT INSERT ON auditoria TO cafe_plataforma;
GRANT SELECT, INSERT ON tipo_cafe, peneira, certificado, turno, etapa, etapa_tipo_resultado, fluxo_transicao TO cafe_plataforma;

-- usuario.superadmin só muda pelo dono do banco (script/seed), nunca pela aplicação (cafe_app) nem pela plataforma.
CREATE OR REPLACE FUNCTION usuario_superadmin_protegido() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.superadmin IS DISTINCT FROM (CASE WHEN TG_OP = 'INSERT' THEN false ELSE OLD.superadmin END)
     AND (pg_has_role(current_user, 'cafe_app', 'MEMBER') OR current_user = 'cafe_plataforma')
     AND NOT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) THEN
    RAISE EXCEPTION 'superadmin só é concedido pelo dono do banco';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER usuario_superadmin_protegido BEFORE INSERT OR UPDATE ON usuario
  FOR EACH ROW EXECUTE FUNCTION usuario_superadmin_protegido();
