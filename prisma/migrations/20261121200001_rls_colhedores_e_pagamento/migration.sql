-- RLS das tabelas da Fase 4 (§3.1, RN-22).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['turma','colhedor','apontamento','apontamento_origem','carga_colheita','carga_apontamento',
                           'fechamento_pagamento','fechamento_item','lancamento_colhedor']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (empresa_id = app_empresa_id()) WITH CHECK (empresa_id = app_empresa_id())', t || '_isolamento', t);
  END LOOP;
END
$$;

-- Nada operacional é apagado (regra 4). Exceção: os itens do fechamento aberto são recalculados.
GRANT SELECT, INSERT, UPDATE ON turma, colhedor, apontamento, apontamento_origem, carga_colheita, carga_apontamento,
  fechamento_pagamento, fechamento_item, lancamento_colhedor TO cafe_app;
GRANT DELETE ON fechamento_item TO cafe_app;

CREATE UNIQUE INDEX colhedor_cpf_unico ON colhedor (empresa_id, cpf_hash) WHERE cpf_hash IS NOT NULL;
-- RN-19: um apontamento válido por colhedor, talhão e dia (lançamentos repetidos são somados).
CREATE UNIQUE INDEX apontamento_colhedor_talhao_dia ON apontamento (empresa_id, colhedor_id, talhao_id, data) WHERE status <> 'CANCELADO';
ALTER TABLE apontamento ADD CONSTRAINT apontamento_medidas CHECK (medidas >= 0);
ALTER TABLE apontamento_origem ADD CONSTRAINT apontamento_origem_medidas CHECK (medidas >= 0);
ALTER TABLE fechamento_pagamento ADD CONSTRAINT fechamento_periodo CHECK (periodo_fim >= periodo_inicio);
ALTER TABLE lancamento_colhedor ADD CONSTRAINT lancamento_valor CHECK (valor > 0);
-- RN-21: períodos de uma mesma fazenda não se sobrepõem (fechamentos não cancelados).
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE fechamento_pagamento ADD CONSTRAINT fechamento_sem_sobreposicao
  EXCLUDE USING gist (empresa_id WITH =, fazenda_id WITH =, daterange(periodo_inicio, periodo_fim, '[]') WITH &&) WHERE (status <> 'CANCELADO');
