-- RLS das tabelas da Fase 1 (§3.1, RN-22): somente a empresa ativa.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['parceiro','talhao','safra','tipo_cafe','peneira','local','turno','motorista','certificado',
                           'etapa','etapa_tipo_resultado','fluxo_transicao','tabela_preco_colheita','perfil_permissao']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (empresa_id = app_empresa_id()) WITH CHECK (empresa_id = app_empresa_id())', t || '_isolamento', t);
  END LOOP;
END
$$;

-- Privilégios: cadastros são inativados, nunca apagados (regra 4). Exceções de configuração:
-- transições e tipos de resultado de etapa (o histórico fica na auditoria) e ajustes de permissão.
GRANT SELECT, INSERT, UPDATE ON parceiro, talhao, safra, tipo_cafe, peneira, local, turno, motorista, certificado,
  etapa, etapa_tipo_resultado, fluxo_transicao, tabela_preco_colheita, perfil_permissao TO cafe_app;
GRANT DELETE ON fluxo_transicao, etapa_tipo_resultado, perfil_permissao TO cafe_app;

-- Formatos (§4.2, §8).
ALTER TABLE etapa ADD CONSTRAINT etapa_prefixo_formato CHECK (prefixo_lote ~ '^[A-Z]{2,3}$');
ALTER TABLE etapa ADD CONSTRAINT etapa_umidade_meta CHECK (
  (umidade_meta_min IS NULL OR (umidade_meta_min >= 0 AND umidade_meta_min <= 100)) AND
  (umidade_meta_max IS NULL OR (umidade_meta_max >= 0 AND umidade_meta_max <= 100)) AND
  (umidade_meta_min IS NULL OR umidade_meta_max IS NULL OR umidade_meta_min < umidade_meta_max));
ALTER TABLE fluxo_transicao ADD CONSTRAINT fluxo_transicao_distintas CHECK (etapa_origem_id <> etapa_destino_id);
CREATE UNIQUE INDEX fluxo_transicao_unica ON fluxo_transicao (empresa_id, etapa_origem_id, etapa_destino_id, COALESCE(fazenda_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE UNIQUE INDEX parceiro_documento_unico ON parceiro (empresa_id, cpf_cnpj) WHERE cpf_cnpj IS NOT NULL;
ALTER TABLE tabela_preco_colheita ADD CONSTRAINT preco_positivo CHECK (valor_por_medida > 0);
ALTER TABLE tabela_preco_colheita ADD CONSTRAINT preco_vigencia CHECK (vigencia_fim IS NULL OR vigencia_fim >= vigencia_inicio);
ALTER TABLE safra ADD CONSTRAINT safra_periodo CHECK (data_fim > data_inicio);
