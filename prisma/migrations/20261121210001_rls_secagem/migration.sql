-- RLS da Fase 5 (§3.1, RN-22).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['leitura_secagem','alerta']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (empresa_id = app_empresa_id()) WITH CHECK (empresa_id = app_empresa_id())', t || '_isolamento', t);
  END LOOP;
END
$$;

GRANT SELECT, INSERT, UPDATE ON leitura_secagem, alerta TO cafe_app;
ALTER TABLE leitura_secagem ADD CONSTRAINT leitura_umidade CHECK (umidade >= 0 AND umidade <= 100);
