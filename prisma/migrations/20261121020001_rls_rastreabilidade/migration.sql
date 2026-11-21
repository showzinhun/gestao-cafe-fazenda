-- RLS das tabelas da Fase 2 (§3.1, RN-22): somente a empresa ativa.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fazenda_certificado','contador','movimento','movimento_entrada','lote',
                           'lote_certificado','lote_talhao','reserva']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (empresa_id = app_empresa_id()) WITH CHECK (empresa_id = app_empresa_id())', t || '_isolamento', t);
  END LOOP;
END
$$;

-- Nada operacional é apagado (regra 4): estornos e cancelamentos mudam o status.
GRANT SELECT, INSERT, UPDATE ON fazenda_certificado, contador, movimento, movimento_entrada, lote,
  lote_certificado, lote_talhao, reserva TO cafe_app;

-- Saldo e reservas também protegidos no banco (RN-01, RN-07).
ALTER TABLE lote ADD CONSTRAINT lote_quantidade CHECK (quantidade >= 0);
ALTER TABLE lote ADD CONSTRAINT lote_utilizada CHECK (quantidade_utilizada >= 0 AND quantidade_utilizada <= quantidade);
ALTER TABLE lote ADD CONSTRAINT lote_reservada CHECK (quantidade_reservada >= 0 AND quantidade_reservada <= quantidade - quantidade_utilizada);
ALTER TABLE lote ADD CONSTRAINT lote_percentual CHECK (percentual IS NULL OR (percentual >= 0 AND percentual <= 1));
ALTER TABLE movimento_entrada ADD CONSTRAINT entrada_positiva CHECK (quantidade > 0);
ALTER TABLE reserva ADD CONSTRAINT reserva_positiva CHECK (quantidade > 0);
ALTER TABLE lote_talhao ADD CONSTRAINT lote_talhao_percentual CHECK (percentual > 0 AND percentual <= 1);
ALTER TABLE movimento ADD CONSTRAINT movimento_quantidades CHECK (qtd_entrada >= 0 AND (qtd_saida IS NULL OR qtd_saida >= 0) AND (qtd_perda IS NULL OR qtd_perda >= 0));
ALTER TABLE movimento ADD CONSTRAINT movimento_estorno CHECK (status <> 'ESTORNADO' OR (estornado_em IS NOT NULL AND motivo_estorno IS NOT NULL));
ALTER TABLE fazenda_certificado ADD CONSTRAINT fazenda_certificado_validade CHECK (validade_fim >= validade_inicio);
