-- RLS das tabelas da Fase 3 (§3.1, RN-22).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['lote_local','remocao','inventario','inventario_item']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (empresa_id = app_empresa_id()) WITH CHECK (empresa_id = app_empresa_id())', t || '_isolamento', t);
  END LOOP;
END
$$;

GRANT SELECT, INSERT, UPDATE ON lote_local, remocao, inventario, inventario_item TO cafe_app;

ALTER TABLE lote_local ADD CONSTRAINT lote_local_quantidade CHECK (quantidade >= 0);
ALTER TABLE remocao ADD CONSTRAINT remocao_quantidade CHECK (quantidade > 0 AND local_origem_id <> local_destino_id);
ALTER TABLE inventario_item ADD CONSTRAINT inventario_item_quantidades CHECK (qtd_sistema >= 0 AND (qtd_contada IS NULL OR qtd_contada >= 0));

-- Lotes de estoque que já existiam: o saldo inteiro fica no local do movimento que os gerou (RN-25).
INSERT INTO lote_local (empresa_id, lote_id, local_id, quantidade)
SELECT l.empresa_id, l.id, m.local_id, l.quantidade - l.quantidade_utilizada
FROM lote l
JOIN etapa e ON e.id = l.etapa_id AND e.classe = 'ESTOQUE'
JOIN movimento m ON m.id = l.movimento_id
WHERE m.local_id IS NOT NULL AND l.status <> 'ESTORNADO' AND l.quantidade > l.quantidade_utilizada;
