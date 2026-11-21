-- RLS da Fase 6 (§3.1, RN-22).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['contrato','contrato_certificado','fixacao_preco','amostra','embarque_detalhe','embarque_nota']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (empresa_id = app_empresa_id()) WITH CHECK (empresa_id = app_empresa_id())', t || '_isolamento', t);
  END LOOP;
END
$$;

-- Nada operacional é apagado (regra 4). Exceção: certificados exigidos do contrato em rascunho (configuração).
GRANT SELECT, INSERT, UPDATE ON contrato, contrato_certificado, fixacao_preco, amostra, embarque_detalhe, embarque_nota TO cafe_app;
GRANT DELETE ON contrato_certificado TO cafe_app;

ALTER TABLE contrato ADD CONSTRAINT contrato_quantidade CHECK (quantidade_sacas > 0 AND tolerancia_perc >= 0 AND tolerancia_perc <= 0.2);
ALTER TABLE contrato ADD CONSTRAINT contrato_preco CHECK (tipo_preco <> 'FIXO' OR preco_por_saca > 0);
ALTER TABLE contrato ADD CONSTRAINT contrato_prazo CHECK (prazo_embarque_fim IS NULL OR prazo_embarque_inicio IS NULL OR prazo_embarque_fim >= prazo_embarque_inicio);
ALTER TABLE fixacao_preco ADD CONSTRAINT fixacao_positiva CHECK (sacas > 0 AND preco_por_saca > 0);
ALTER TABLE embarque_nota ADD CONSTRAINT nota_kg CHECK (qtd_kg > 0);
ALTER TABLE embarque_nota ADD CONSTRAINT nota_chave CHECK (chave_nfe IS NULL OR chave_nfe ~ '^[0-9]{44}$');
