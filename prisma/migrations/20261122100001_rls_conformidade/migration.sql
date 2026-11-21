-- RLS da Fase 7 (§3.1, RN-22).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['arquivo','checagem_desmatamento','rebaixamento','dossie','pacote_embarque']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (empresa_id = app_empresa_id()) WITH CHECK (empresa_id = app_empresa_id())', t || '_isolamento', t);
  END LOOP;
END
$$;

-- Arquivos, checagens, dossiês e pacotes são imutáveis (RN-30): a aplicação só lê e insere.
GRANT SELECT, INSERT ON arquivo, checagem_desmatamento, dossie, pacote_embarque TO cafe_app;
GRANT SELECT, INSERT, UPDATE ON rebaixamento TO cafe_app;

ALTER TABLE rebaixamento ADD CONSTRAINT rebaixamento_kg CHECK (kg > 0 AND length(trim(motivo)) >= 5);
ALTER TABLE checagem_desmatamento ADD CONSTRAINT checagem_area CHECK (area_alerta_ha IS NULL OR area_alerta_ha >= 0);
ALTER TABLE arquivo ADD CONSTRAINT arquivo_tamanho CHECK (tamanho > 0 AND tamanho <= 5242880);

-- Versão da geometria (§10): SHA-256 do jsonb (chaves em ordem canônica). Calculado no banco para ser estável.
CREATE OR REPLACE FUNCTION talhao_geometria_hash() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.geometria_hash := CASE WHEN NEW.geometria IS NULL OR NEW.geometria = 'null'::jsonb THEN NULL
                             ELSE encode(sha256(convert_to(NEW.geometria::text, 'UTF8')), 'hex') END;
  RETURN NEW;
END
$$;
CREATE TRIGGER talhao_geometria_hash BEFORE INSERT OR UPDATE OF geometria ON talhao
  FOR EACH ROW EXECUTE FUNCTION talhao_geometria_hash();
UPDATE talhao SET geometria = geometria WHERE geometria IS NOT NULL;
