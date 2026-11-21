# Especificação — Plataforma de Gestão do Café: da Colheita à Venda

> Documento autossuficiente. Quem implementar **não tem acesso ao Sankhya/Oracle**.
> O sistema antigo (AD_FLXFAZ) foi **ponto de partida, não modelo a copiar**; ver [LEGADO_SANKHYA.md](LEGADO_SANKHYA.md).

---

## 1. Visão do produto

Uma **plataforma multiempresa (SaaS)**, web + app instalável (PWA), que acompanha o café desde a colheita até a venda. Ela responde, a qualquer momento:

- **Quanto café tenho, onde e em que estado?** Saldo por etapa, local, fazenda, safra e certificado.
- **Quanto devo a cada colhedor?** Apontamento no campo, mesmo offline, e fechamento de pagamento.
- **Como está a secagem?** Ocupação de terreiros, secadores e tulhas, curva de umidade e alerta de ponto.
- **O que já vendi e o que falta embarcar?** Contratos, amostras, reservas de estoque e embarques.
- **Este embarque está em conformidade?** Dossiê EUDR e de certificação gerado automaticamente.

### 1.0 Onde a plataforma fica na cadeia
```
FAZENDA (esta plataforma)                                         EXPORTADORA (sistema próprio, já prototipado)
talhão → colheita → pós-colheita → armazém da fazenda → embarque ──NF + pacote──▶ Guia de Entrada → estoque → exportação
```
- A fazenda **guarda o próprio café** no armazém dela e **vende para a exportadora**.
- A exportadora usa um sistema separado (depositantes, titularidade, serviços e exportação), que **não** faz parte desta plataforma.
- O elo entre os dois é o **pacote de embarque** (§17): ao finalizar um embarque, a plataforma gera um arquivo padrão com notas, lotes, certificados, composição por talhão e polígonos. A exportadora lê esse arquivo na Guia de Entrada e mantém a rastreabilidade do talhão ao contêiner.

### 1.1 O que muda em relação ao sistema original

| Sistema original (Sankhya) | Plataforma nova |
|---|---|
| Uma empresa, 8 telas fixas por etapa | **Multiempresa**; **fluxo configurável** por empresa e fazenda, a partir de modelos prontos |
| 8 tabelas quase idênticas + log separado | Modelo único: `lote` + `movimento` + `movimento_entrada`; a genealogia sai do próprio modelo |
| Colheita lançada no escritório, em medidas totais | **Apontamento por colhedor no campo (offline)**, com cálculo de pagamento |
| Secagem só com % de quebra | **Painel de secagem**: ocupação, leituras de umidade, curva, previsão e alertas |
| Venda = Guia de Embarque com parceiro e "TC" | **Módulo comercial**: contratos, amostras, reservas de estoque, fixação de preço e saldo a embarcar |
| Certificação em 3 campos conflitantes, escolhida à mão | Certificação **herdada e validada** pela origem; vencimentos com alerta |
| Rastreabilidade por botão em Java, snapshots soltos | **Dossiê EUDR** por embarque: polígonos, checagem de desmatamento, % por produtor e talhão |
| Lote como texto concatenado | Código de lote configurável por etapa; a busca usa as chaves, nunca o texto |

### 1.2 Fora do escopo (por ora)
- Qualidade e prova (SCA, bebida, defeitos): o modelo já prevê o encaixe (§13).
- Etiquetas QR.
- Indicadores agronômicos avançados.
- Financeiro contábil e faturamento/NF-e: ficam no ERP. A plataforma só registra os números das notas.
- Folha de pagamento: o pagamento de colhedores gera **lista para pagar**, mas não faz o pagamento.
- Café de terceiros guardado no armazém (depositantes) e transferência de titularidade: ficam no sistema da exportadora.

---

## 2. Glossário

| Termo | Significado |
|---|---|
| **Empresa (tenant)** | Cliente da plataforma: uma fazenda, um grupo ou uma exportadora. Os dados de uma empresa nunca aparecem para outra. |
| **Fazenda / Talhão** | Unidade produtiva / parcela com polígono (GeoJSON). |
| **Produtor** | Dono da fazenda (pessoa física ou jurídica). Usado no dossiê EUDR. |
| **Safra** | Ano agrícola (ex.: 2025/26). |
| **Medida** | Unidade de volume do café colhido (padrão da empresa, ex.: 60 L). |
| **Saca** | 60 kg de café beneficiado. |
| **Colhedor / Turma** | Pessoa que colhe manualmente / grupo de colhedores com um responsável (turmeiro). |
| **Apontamento** | Registro de quantas medidas um colhedor colheu, em que talhão e em que dia. |
| **Etapa** | Fase do processo **configurada pela empresa** (ex.: Lavador, Terreiro, Secador, Tulha, Armazém). Cada etapa pertence a uma **classe** de comportamento (§5). |
| **Fluxo** | Conjunto de etapas e das transições permitidas entre elas, para uma empresa ou fazenda. |
| **Movimento** | Um processamento numa etapa (uma carga do terreiro, uma secagem, uma GS, um embarque). Consome lotes e gera lotes. |
| **Lote** | Quantidade identificada de café com saldo. É sempre gerado por um movimento. |
| **Reserva** | Quantidade de um lote separada para um uso (próxima transferência ou contrato). Fica ≤ saldo. |
| **Contrato** | Compromisso de venda: cliente, quantidade, preço, padrão, certificação exigida e prazo. |
| **Amostra** | Porção de um lote enviada a um cliente para aprovação. |
| **Embarque** | Saída física do café para um cliente, vinculada a um contrato e às NF-e. |
| **Dossiê** | Pacote de conformidade de um embarque: origem por talhão, polígonos, checagens e certificados. |
| **Pacote de embarque** | Arquivo padrão gerado ao finalizar um embarque, lido pelo sistema da exportadora (§17). |
| **Rebaixamento** | Café certificado que sai ou é gerado com menos certificações do que tinha (ex.: RFA vendido como convencional). É sempre registrado, com kg e motivo. |
| **Programação / Carregamento** | Etapas do embarque: programar reserva os kg; carregar registra a pesagem do caminhão e os lacres. |

---

## 3. Multiempresa, usuários e permissões

### 3.1 Isolamento
- Toda tabela de negócio tem `empresa_id`.
- **PostgreSQL Row Level Security (RLS)** em todas elas, com política `empresa_id = current_setting('app.empresa_id')::uuid`.
- O servidor define `app.empresa_id` no início de cada transação, a partir da sessão.
- Nenhuma consulta de negócio roda sem empresa definida. A exceção são as rotas do SUPERADMIN, que usam um papel de banco separado.
- Códigos sequenciais (nº de movimento, contrato, embarque) são **por empresa**.
- Teste obrigatório: um usuário da empresa A nunca lê nem altera dados da empresa B, nem por id direto na URL.

### 3.2 Usuários e perfis
- O usuário é global (e-mail único) e pode pertencer a várias empresas: `usuario_empresa(usuario_id, empresa_id, perfil, ativo)`.
- Ao entrar, o usuário escolhe a empresa ativa.

| Perfil | Pode |
|---|---|
| SUPERADMIN (plataforma) | Criar e suspender empresas; não vê dados operacionais, salvo modo suporte auditado |
| ADMIN_EMPRESA | Tudo na empresa: cadastros, fluxo, usuários |
| GESTOR | Operação completa, estornos, correções administrativas |
| OPERADOR | Lançar movimentos, entradas e resultados nas fazendas liberadas |
| APONTADOR | Só apontamento de colheita (app de campo) nas fazendas liberadas |
| FINANCEIRO | Tabelas de preço de colheita, fechamentos e pagamentos; vê os dados pessoais dos colhedores |
| COMERCIAL | Contratos, amostras, reservas e embarques |
| CONSULTA | Somente leitura |

- O acesso por fazenda é dado em `usuario_fazenda` (RN-04). ADMIN_EMPRESA vê todas as fazendas.
- **Permissões por etapa:** além do perfil, a empresa ajusta uma matriz `perfil × permissão` (ex.: registrar entrada, lançar resultado, fechar, estornar, programar embarque, carregar, autorizar ajuste de inventário). Os perfis acima são o padrão inicial dessa matriz. O servidor sempre confere a permissão; a interface só esconde ou desativa o que não é permitido.

### 3.3 LGPD
- CPF e chave PIX dos colhedores são **dados pessoais**: guardados criptografados (pgcrypto ou criptografia na aplicação).
- Só FINANCEIRO e ADMIN_EMPRESA veem esses dados sem máscara.
- Toda visualização sem máscara gera auditoria.

---

## 4. Modelo de dados

Convenções:
- PostgreSQL, `snake_case` em português, ids UUID (permite gerar o id offline no app).
- Quantidades em `numeric(14,3)`; percentuais em `numeric(7,4)` como fração (0–1).
- Toda tabela operacional tem `empresa_id`, `criado_em`, `criado_por`, `alterado_em`, `alterado_por`.

### 4.1 Plataforma e acesso
- **empresa** — `id, nome, cnpj, plano, status (ATIVA|SUSPENSA), configuracoes jsonb (unidade_medida_litros, moeda_padrao, fuso)`
- **usuario** — `id, nome, email (único), senha_hash, ativo`
- **usuario_empresa** — `usuario_id, empresa_id, perfil, ativo`
- **usuario_fazenda** — `usuario_id, fazenda_id`

### 4.2 Cadastros
- **parceiro** — `id, tipo_pessoa (F|J), nome, razao_social, cpf_cnpj, pais, papeis (array: PRODUTOR|CLIENTE|OPERADOR|TRANSPORTADOR), codigo_erp`
- **fazenda** — `id, codigo (2–4 letras, único na empresa), nome, produtor_id → parceiro, municipio, uf, pais, car, ativo`
- **talhao** — `id, fazenda_id, codigo, nome, area_ha_informada, area_ha_calculada, variedade, ano_plantio, geometria (GeoJSON), geometria_tipo (PONTO|POLIGONO), ativo`
- **safra** — `id, codigo, data_inicio, data_fim, ativa`
- **tipo_cafe** — `id, codigo, nome, ativo` (seed: NAT, LAV, CAT, VER, BOI, CD, BEN)
- **peneira** — `id, codigo, descricao, ordem`
- **local** — `id, fazenda_id (nullable), etapa_id, codigo, nome, capacidade, unidade_capacidade (M2|MEDIDA|KG|SACA), ativo`
- **turno** — `id, nome`
- **motorista** — `id, nome, cpf, cnh, placa_padrao, transportador_id → parceiro (nullable = autônomo), telefone, ativo`

### 4.3 Fluxo configurável
- **etapa** — `id, codigo, nome, classe, prefixo_lote, unidade_entrada, unidade_saida, modelo_resultado, monitora_secagem (bool), umidade_meta_min, umidade_meta_max, exige_local (bool), ordem, ativa`
  - `classe`: COLHEITA | PROCESSAMENTO | ESTOQUE | SERVICO | SAIDA (§5.1)
  - `modelo_resultado`: NENHUM | PERCENTUAL_POR_TIPO | CAFE_E_PERDA | POR_PENEIRA | CONVERSAO_ESTOQUE
- **etapa_tipo_resultado** — `etapa_id, tipo_cafe_id, ordem`: tipos que a etapa pode gerar (ex.: o lavador gera VER, BOI, CD).
- **fluxo_transicao** — `id, etapa_origem_id, etapa_destino_id, fazenda_id (null = vale para a empresa toda)`
- **modelo_fluxo** (global, só leitura) — modelos prontos que a empresa copia na criação (§5.3).

### 4.4 Operacional (rastreabilidade)
- **movimento**
  - Identificação: `id, etapa_id, numero (sequencial por empresa+etapa), fazenda_id (null se mistura fazendas), safra_id, local_id, turno_id`.
  - Datas e status: `data_entrada, data_saida_local, data_resultado, status (ABERTO|PROCESSADO|FINALIZADO|ESTORNADO)`.
  - Pessoas e observação: `conferente, operador, observacao`.
  - Quantidades: `unidade, qtd_entrada, qtd_saida, qtd_perda, perc_quebra, umidade_final`.
  - Estorno: `estornado_em, estornado_por, motivo_estorno`.
  - Por classe: `servico_tipo` (SERVICO: BLEND|CATACAO|REBENEFICIO|REAPROVEITAMENTO).
  - SERVICO (opcional): `previa jsonb` (frações previstas: PRODUTO|SUBPRODUTO|IMPUREZA|QUEBRA com %), `maquina, inicio, fim`, `motivo_quebra` (RN-31).
- **tipo_servico_config** — `servico_tipo, quebra_esperada_perc, quebra_limite_perc`
- **movimento_entrada** — `id, movimento_id, lote_id, quantidade, unidade, data, origem_reserva (NENHUMA|TRANSFERENCIA|CONTRATO)`
  - Único: `(movimento_id, lote_id)`.
- **lote**
  - Identificação: `id, codigo (único na empresa), movimento_id (gerador), etapa_id, fazenda_id (null = MIX), safra_id, tipo_cafe_id, peneira_id`.
  - Quantidades: `unidade, quantidade, quantidade_utilizada, quantidade_reservada, saldo (gerado), percentual, umidade`.
  - Estado e origem: `status (ABERTO|PARCIAL|UTILIZADO|ESTORNADO), origem_tipo (COLHEITA|TRANSFERENCIA|PROCESSO), data, observacao`.
- **lote_certificado** — `lote_id, certificado_id`
- **lote_talhao** — `lote_id, talhao_id, percentual, quantidade_equivalente` (composição materializada, RN-09)
- **reserva** — `id, lote_id, local_id (nullable), quantidade, finalidade (TRANSFERENCIA|CONTRATO|SERVICO|EMBARQUE), contrato_id (nullable), movimento_id (nullable: serviço ou embarque que reservou), status (ATIVA|CONSUMIDA|CANCELADA), criado_por`
  - `lote.quantidade_reservada` = soma das reservas ATIVAS.
- **parada_processo** — `id, movimento_id, motivo, inicio, fim`
- **lote_local** — `lote_id, local_id, quantidade` (saldo por local, só nas etapas ESTOQUE). Σ por lote = saldo do lote (RN-25).
- **remocao** — `id, lote_id, local_origem_id, local_destino_id, quantidade, motivo, data` (troca de local dentro do armazém; não muda saldo).
- **inventario** — `id, local_ids (array), data_contagem, status (ABERTO|CONTADO|APROVADO|CANCELADO), aprovado_por, aprovado_em`
- **inventario_item** — `inventario_id, lote_id, local_id, qtd_sistema, qtd_contada, diferenca, ajuste_movimento_id` (RN-29)
- **rebaixamento** — `id, movimento_id, lote_origem_id, certificado_de_id, certificado_para_id (nullable = convencional), esquemas_perdidos (array), quantidade, motivo, criado_por` (RN-28)

### 4.5 Colheita, colhedores e pagamento
- **colhedor** — `id, nome, apelido, cpf (cripto), chave_pix (cripto), telefone, turma_id, ativo`
- **turma** — `id, nome, fazenda_id, responsavel (texto ou colhedor_id), ativo`
- **tabela_preco_colheita** — `id, fazenda_id (null = todas), safra_id, tipo_colheita (MANUAL|SEMIMECANIZADA), talhao_id (null = todos), valor_por_medida, vigencia_inicio, vigencia_fim`
  - Vale a regra mais específica: talhão > fazenda > empresa.
- **apontamento**
  - `id (UUID gerado no app), data, fazenda_id, talhao_id, safra_id, colhedor_id, turma_id, tipo_cafe_id, tipo_colheita, medidas, apontador_id`.
  - Sincronização: `dispositivo_id, criado_offline_em, sincronizado_em`.
  - Pagamento: `valor_unitario (congelado no fechamento), status (PENDENTE|FECHADO|CANCELADO), fechamento_id`.
- **carga_colheita** — o que sai do talhão para o pós-colheita num dia ou viagem.
  - `id, data, fazenda_id, talhao_id, safra_id, tipo_cafe_id, tipo_colheita (MANUAL|MECANICA|SEMIMECANIZADA|VARIOS), tipo_transporte, operador_maquina_id, medidas_medidas (medição na recepção), medidas_apontadas (soma dos apontamentos ligados), divergencia, movimento_id (o movimento de COLHEITA gerado)`
- **carga_apontamento** — `carga_id, apontamento_id` (que apontamentos compõem a carga)
- **fechamento_pagamento**
  - `id, fazenda_id, periodo_inicio, periodo_fim, status (ABERTO|FECHADO|PAGO|CANCELADO)`.
  - `total_medidas, total_bruto, total_descontos, total_liquido, fechado_por, fechado_em, pago_em`.
- **fechamento_item** — `fechamento_id, colhedor_id, medidas, valor_bruto, adiantamentos, descontos, adicionais, valor_liquido`
- **lancamento_colhedor** — `id, colhedor_id, data, tipo (ADIANTAMENTO|DESCONTO|ADICIONAL), valor, descricao, fechamento_id`

### 4.6 Secagem
- **leitura_secagem** — `id (UUID), movimento_id, data_hora, umidade, temperatura_massa, temperatura_ar, observacao, usuario_id, dispositivo_id`
- **alerta** — `id, tipo (PONTO_SECAGEM|SECAGEM_LONGA|CAPACIDADE|CERTIFICADO_VENCENDO|CONTRATO_PRAZO|EUDR_PENDENTE), entidade, entidade_id, mensagem, severidade, criado_em, lido_por, lido_em`

### 4.7 Comercial
- **contrato**
  - Identificação: `id, numero (sequencial por empresa + ano), cliente_id → parceiro, safra_id`.
  - Quantidade e padrão: `quantidade_sacas, quantidade_kg (gerado), tolerancia_perc, descricao_padrao (texto: tipo, peneira, bebida), peneira_min_id`.
  - Preço: `moeda (BRL|USD), tipo_preco (FIXO|A_FIXAR), preco_por_saca (FIXO), diferencial (A_FIXAR), referencia_bolsa (texto, ex.: KC Mar/27)`.
  - Prazo e condições: `prazo_embarque_inicio, prazo_embarque_fim, incoterm, destino_pais, exige_eudr (bool)`.
  - Estado e saldos: `status (RASCUNHO|ASSINADO|EM_EXECUCAO|CONCLUIDO|CANCELADO), kg_reservado, kg_embarcado, saldo_kg (gerados/calculados), observacao`.
- **contrato_certificado_exigido** — `contrato_id, certificado_id`
- **fixacao_preco** — `id, contrato_id, data, sacas, preco_por_saca, observacao` (só para A_FIXAR; Σ sacas ≤ quantidade_sacas)
- **amostra** — `id, contrato_id (nullable), cliente_id, lote_id, peso_g, data_envio, transportadora, rastreio, status (ENVIADA|APROVADA|REPROVADA|SEM_RETORNO), data_retorno, comentario_cliente`
- **embarque** = movimento da classe SAIDA, com detalhe:
  - **embarque_detalhe** — `movimento_id, contrato_id, cliente_id, data_venda, data_embarque, container, navio, booking, numero_dds (EUDR), finalizado_em, finalizado_por`
    - Programação: `programado_em, programado_por` (cria reservas de finalidade EMBARQUE, RN-26).
    - Carregamento: `motorista_id, placa, transportador_id, lacres, peso_bruto, tara, peso_liquido, diferenca_kg, diferenca_perc, motivo_diferenca, carregado_em, carregado_por` (RN-27).
    - Venda: `certificado_vendido_id` (nullable = convencional); a diferença para os certificados dos lotes gera `rebaixamento` (RN-28).
    - Pacote: `pacote_versao, pacote_hash, pacote_gerado_em` (§17).
  - **embarque_nota** — `id, movimento_id, numero_nota, serie, chave_nfe, data_emissao, qtd_kg, qtd_sacas`

### 4.8 Certificações e EUDR
- **certificado** — `id, codigo (RFA|AAA|4C|ORG|...), nome, ativo`
- **fazenda_certificado** — `id, fazenda_id, certificado_id, numero, validade_inicio, validade_fim, arquivo_url, status (VALIDO|VENCIDO|SUSPENSO)`
- **checagem_desmatamento** — `id, talhao_id, provedor, data_checagem, data_corte (2020-12-31), resultado (SEM_ALERTA|ALERTA|INCONCLUSIVO|ERRO), area_alerta_ha, evidencia (jsonb/url), versao_geometria_hash`
- **dossie** — `id, movimento_id (embarque), gerado_em, gerado_por, versao, conteudo jsonb (snapshot completo), hash_sha256, arquivos (pdf/geojson/csv urls)`

### 4.9 Auditoria
- **auditoria** — `id, empresa_id, entidade, entidade_id, acao, antes jsonb, depois jsonb, usuario_id, data, ip, dispositivo_id`

### 4.10 Diagrama resumido
```
empresa 1─* (tudo)
fazenda 1─* talhao 1─* apontamento *─1 colhedor *─1 turma
apontamento *─* carga_colheita 1─1 movimento(COLHEITA) 1─* lote
etapa 1─* movimento 1─* movimento_entrada *─1 lote
movimento 1─* lote            (gerados)
movimento 1─* leitura_secagem
lote 1─* lote_talhao *─1 talhao 1─* checagem_desmatamento
lote 1─* reserva *─0..1 contrato 1─* embarque_detalhe 1─1 movimento(SAIDA) 1─1 dossie
fazenda 1─* fazenda_certificado ; contrato *─* certificado (exigido)
```

---

## 5. Fluxo configurável

### 5.1 Classes de etapa (o código conhece só as classes, nunca nomes como "Terreiro")

| Classe | Entradas | Saídas | Exemplos |
|---|---|---|---|
| **COLHEITA** | Nenhuma (vem de cargas/apontamentos) ou lote de outra fazenda (transferência) | 1 lote por carga, 100% do talhão | Colheita |
| **PROCESSAMENTO** | Lotes de etapas anteriores | Conforme `modelo_resultado`: PERCENTUAL_POR_TIPO (ex.: lavador → verde/boia/CD) ou CAFE_E_PERDA | Lavador, Despolpador, Terreiro, Secador, Tulha, Descanso |
| **ESTOQUE** | Lotes de processamento (medidas) ou de serviço | CONVERSAO_ESTOQUE: kg informados + peneira + certificados | Armazém, Armazém geral |
| **SERVICO** | Lotes de estoque (kg), podendo misturar fazendas | POR_PENEIRA, que voltam ao estoque | Benefício, Rebenefício, Catação, Blend |
| **SAIDA** | Lotes de estoque (kg) | Nenhuma (fim); vinculada a contrato | Embarque |

### 5.2 Regras do fluxo
- Uma entrada só é aceita se existir `fluxo_transicao` da etapa do lote para a etapa do movimento (primeiro a da fazenda, depois a da empresa).
- Toda empresa precisa ter **pelo menos** uma etapa COLHEITA, uma ESTOQUE e uma SAIDA.
- Etapas com `monitora_secagem = true` aparecem no painel de secagem (§7).
- Não é permitido excluir uma etapa com movimentos; só desativá-la.
- Alterar transições não afeta movimentos já feitos.
- O código de lote usa o `prefixo_lote` da etapa (§8).

### 5.3 Modelos de fluxo prontos (seed global)
1. **Via úmida completa** (equivale ao original): Colheita → Lavador/Despolpador (VER, BOI, CD) → Terreiro ⇄ Secador → Tulha → Armazém ⇄ Benefício/Serviço → Embarque.
   - Atalhos: Colheita → Terreiro; Lavador → Secador; Terreiro → Tulha.
2. **Via seca (natural)**: Colheita → Terreiro → Secador → Tulha → Armazém ⇄ Serviço → Embarque.
3. **Simplificado**: Colheita → Secador → Armazém → Embarque.

Na criação da empresa, o ADMIN escolhe um modelo, que é **copiado** para a empresa e depois pode ser editado numa tela visual de etapas e transições.

---

## 6. Colheita, colhedores e pagamento

### 6.1 Apontamento (app de campo, PWA, offline)
- O APONTADOR escolhe fazenda, talhão e turma; a lista de colhedores da turma aparece.
- Para cada colhedor, digita as medidas (teclado numérico grande; botões "+1"/"+0,5").
- Funciona **sem sinal**:
  - os dados ficam no IndexedDB;
  - cada registro tem UUID gerado no aparelho;
  - a sincronização é **idempotente**: reenviar não duplica.
- Mostra o total do dia por colhedor e por talhão, e o status "pendente de sincronizar".
- Correção de um apontamento:
  - pelo apontador: só no mesmo dia e antes do fechamento;
  - depois disso: só GESTOR, com motivo.

### 6.2 Carga de colheita (ponte para a rastreabilidade)
- Na recepção (lavador/terreiro), registra-se a **carga**: talhão, tipo, medidas medidas na recepção e transporte.
- A carga é ligada aos apontamentos do dia/talhão. A ligação pode ser sugerida automaticamente.
  - `divergencia = medidas_medidas − medidas_apontadas`. Acima de X% (configurável), gera alerta.
- Colheita mecânica: carga sem apontamentos; registra-se a máquina/operador.
- **Cada carga gera um movimento COLHEITA (PROCESSADO) com 1 lote**, cuja quantidade = `medidas_medidas`. A partir daí o lote segue o fluxo.

### 6.3 Pagamento
- Preço por medida: `tabela_preco_colheita` vigente na data do apontamento (regra mais específica).
- **Fechamento** (semanal/quinzenal, por fazenda) — o FINANCEIRO abre o período e o sistema agrega:
  - os apontamentos PENDENTES de cada colhedor;
  - medidas × preço (o preço fica **congelado** no apontamento);
  - mais adicionais, menos adiantamentos e descontos.
- Ao **fechar**, os apontamentos ficam FECHADOS e imutáveis.
- Reabrir só é permitido se o fechamento não estiver PAGO (ADMIN, com motivo).
- Ao **pagar**, o fechamento é marcado PAGO e o sistema gera:
  - lista de pagamento (CSV com nome, CPF, chave PIX e valor);
  - recibo individual em PDF.
- Relatórios:
  - produção por colhedor, por turma e por talhão;
  - custo de colheita por saca (custo do fechamento ÷ sacas no armazém originadas daquele período/talhão, aproximado pela composição de talhões).

---

## 7. Painel de secagem

- **Mapa de ocupação:** grade de cartões, um por local das etapas com `monitora_secagem`. Cada cartão mostra:
  - o lote/movimento em processo e o volume;
  - a ocupação (% da capacidade);
  - os dias desde a entrada;
  - a última umidade e a tendência.
- Cores do cartão:
  - livre;
  - em secagem;
  - **no ponto** (umidade dentro da meta);
  - atenção: secagem mais longa que N dias ou sem leitura há mais de X horas.
- **Leituras:** lançadas pelo celular (offline), com umidade, temperatura da massa/ar e observação.
- **Curva:** gráfico de umidade × tempo por movimento, com faixa da meta.
- **Previsão de ponto:** regressão sobre as últimas 3 leituras (log-linear) → "ponto estimado em ~X h". Exibir só se houver ≥ 3 leituras.
- **Alertas automáticos:**
  - PONTO_SECAGEM: a umidade entrou na meta;
  - SECAGEM_LONGA;
  - CAPACIDADE: ao adicionar entrada que passe de 100% do local.
- Ao lançar o resultado do movimento, `umidade_final` é sugerida a partir da última leitura.

---

## 8. Código do lote

- Formato padrão: `{PREFIXO}-{FAZ}-{SAFRA}-{NUM6}[-{TIPO}][-P{PENEIRA}][-{seq}]`
  - Exemplos: `TE-NS-2526-000045-CD`, `AR-NS-2526-000010-P17`.
- Partes:
  - `{PREFIXO}` vem da etapa;
  - `{FAZ}` = código da fazenda, ou `MIX` quando há várias;
  - `{SAFRA}` = 4 dígitos (2025/26 → 2526);
  - `{NUM6}` = número do movimento com zeros à esquerda.
- O código é gerado no servidor e nunca editado. Fica num único módulo (`gerarCodigoLote`).
- **A rastreabilidade nunca depende de interpretar o código**: usa sempre as chaves.

---

## 9. Comercial

1. **Contrato:**
   - nasce RASCUNHO e passa a ASSINADO;
   - vira EM_EXECUCAO na primeira reserva ou embarque;
   - fica CONCLUIDO quando `kg_embarcado ≥ quantidade_kg × (1 − tolerância)`.
2. **Amostras:** registradas por lote e cliente. A aprovação é informativa: não bloqueia, mas aparece ao reservar o lote.
3. **Reserva por contrato:** na tela de estoque, o COMERCIAL reserva kg de lotes para o contrato. Validações:
   - certificados exigidos (RN-17);
   - EUDR, se o contrato exigir (RN-18);
   - peneira mínima.
   - Kg reservados não podem ser usados por outro contrato, por serviço nem por outra reserva.
4. **Embarque:**
   - criado a partir do contrato; puxa as reservas como entradas (pode completar com lotes livres que passem nas mesmas validações);
   - recebe dados logísticos e notas fiscais;
   - **Finalizar** exige:
     - Σ entradas ≤ saldo do contrato + tolerância;
     - dossiê gerado sem pendências, quando o contrato exige EUDR.
   - Ao finalizar, as reservas viram CONSUMIDA e o embarque fica imutável.
5. **Fixação de preço** (A_FIXAR): registros de fixação parcial. O painel do contrato mostra sacas fixadas, preço médio e sacas a fixar.
6. **Painel comercial:**
   - contratos por status;
   - saldo a embarcar por prazo;
   - estoque livre × reservado por certificado e peneira;
   - alerta CONTRATO_PRAZO quando faltam N dias para o fim do prazo e há saldo.

---

## 10. Certificações e EUDR

- **Certificados por fazenda** com validade e arquivo. Alertas CERTIFICADO_VENCENDO a 60, 30 e 7 dias.
- **Herança:** um lote só tem o certificado C se **todas** as fazendas da sua composição tiverem C válido na data do lote (RN-08). No estoque, o usuário pode remover certificados de um lote, mas nunca adicionar um que a regra não permita.
- **Geometria do talhão:**
  - upload de GeoJSON/KML ou desenho no mapa (MapLibre + OSM);
  - validação: polígono válido, sem autointerseção, coordenadas WGS84 com 6 casas;
  - `area_ha_calculada` via Turf;
  - alerta se a diferença para a área informada passar de 10%;
  - **sobreposição** com talhões de outros produtores na mesma empresa gera alerta (risco de terra contada em dobro);
  - regra EUDR: área > 4 ha exige POLIGONO; ≤ 4 ha aceita PONTO.
- **Checagem de desmatamento:**
  - interface `ProvedorDesmatamento` (adaptadores plugáveis; MVP: provedor *mock* + importação manual do resultado com evidência em PDF);
  - a checagem é refeita quando a geometria muda (`versao_geometria_hash`).
- **Dossiê do embarque** (gerado sob demanda e congelado ao finalizar):
  - lista de produtores, fazendas e talhões com kg e % (via `lote_talhao`), área, geometria e resultado da checagem;
  - certificados válidos na data;
  - cadeia de movimentos resumida;
  - pendências (talhão sem geometria, checagem com ALERTA ou ausente, certificado vencido).
  - Exporta PDF, **GeoJSON FeatureCollection** (propriedades: `Name`, `id`, `produtor`, `area_ha`) e CSV.
  - Grava `hash_sha256` do conteúdo e campo para o **número de referência da DDS** (TRACES).

---

## 11. Regras de negócio

| Código | Regra |
|---|---|
| **RN-01 Saldo** | `saldo = quantidade − quantidade_utilizada`. Uma entrada nunca ultrapassa `saldo − reservas de outras finalidades`. Toda alteração de quantidade ocorre em **uma transação**, com `SELECT … FOR UPDATE` nos lotes. |
| **RN-02 Status do lote** | Derivado: utilizada = 0 → ABERTO; parcial → PARCIAL; total → UTILIZADO. De movimento estornado → ESTORNADO. |
| **RN-03 Imutabilidade** | Lote PARCIAL ou UTILIZADO não muda quantidade, tipo, safra ou fazenda, nem é excluído. A mensagem indica o movimento de destino a estornar. |
| **RN-04 Acesso por fazenda** | Escritas só em fazendas de `usuario_fazenda` (exceto ADMIN_EMPRESA). Movimentos multi-fazenda exigem acesso a todas as fazendas das entradas. |
| **RN-05 Estorno LIFO** | Só se nenhum lote gerado tiver `quantidade_utilizada > 0` ou reserva ativa. Efeito: lotes gerados → ESTORNADO; origens recebem de volta a quantidade; movimento → ESTORNADO com motivo; auditoria. Nada é apagado. |
| **RN-06 Apagar resultados** | PROCESSADO → ABERTO, nas mesmas condições da RN-05. |
| **RN-07 Reserva** | Σ reservas ATIVAS de um lote ≤ saldo. A reserva de CONTRATO só é consumida por embarque do mesmo contrato. |
| **RN-08 Certificação herdada** | Ver §10. Os certificados de um lote gerado = interseção dos certificados das entradas (limitada pela validade). |
| **RN-09 Composição por talhão** | `pct(L,t) = Σ_i (qtd_i / qtd_total_M) × pct(lote_i, t)`. Lote de COLHEITA = 100% do talhão da carga. Σ pct = 1 (erro de arredondamento ≤ 0,0001, ajustado no maior). |
| **RN-10 Quebra** | `perc_quebra = (entrada − Σ saídas) / entrada` na mesma unidade. Na classe ESTOQUE (medidas → kg) registra-se o **rendimento** `kg / medida`, não quebra. |
| **RN-11 Conversão** | Só na classe ESTOQUE. O kg é informado pelo usuário; o fator configurado apenas sugere. Do estoque em diante, kg; sacas = kg/60. |
| **RN-12 Percentuais** | Cada % entre 0 e 1; Σ % (incluindo perda) ≤ 1; quantidades arredondadas a 3 casas, com a sobra indo para a perda. |
| **RN-13 Safra** | Obrigatória. Não se misturam safras, exceto em SERVICO do tipo BLEND (o lote gerado usa a safra predominante e registra a mistura). |
| **RN-14 Saída finalizada** | Embarque FINALIZADO é imutável. Só ADMIN_EMPRESA pode reabrir, com motivo, e só se não houver DDS informada. |
| **RN-15 Auditoria** | Toda escrita gera auditoria. Campos de autoria vêm do servidor. |
| **RN-16 Transição** | Entrada só se existir `fluxo_transicao` da etapa do lote para a etapa do movimento (§5.2). |
| **RN-17 Certificado exigido** | Reserva ou entrada em embarque de contrato só com lotes que tenham **todos** os certificados exigidos pelo contrato. |
| **RN-18 EUDR** | Em contrato com `exige_eudr`, só lotes cujos talhões de composição tenham geometria válida e última checagem SEM_ALERTA. O embarque não finaliza com pendência no dossiê. |
| **RN-19 Apontamento** | `medidas > 0`; um colhedor só aparece uma vez por talhão por dia (lançamentos repetidos são somados); apontamento FECHADO é imutável. |
| **RN-20 Preço congelado** | O `valor_unitario` do apontamento é fixado no fechamento. Mudar a tabela de preços depois não altera fechamentos. |
| **RN-21 Fechamento** | Um apontamento pertence a no máximo um fechamento; períodos de uma mesma fazenda não se sobrepõem. |
| **RN-22 Isolamento** | Nenhum dado atravessa empresas (RLS + testes). Ids de outra empresa → 404, nunca 403 (não revela existência). |
| **RN-23 Sincronização offline** | Operações vindas do app são idempotentes pelo UUID do registro. Conflito (registro alterado no servidor depois da leitura offline) → o servidor vence e o app mostra a divergência. |
| **RN-24 Capacidade** | Entrada que leve o local acima de 100% da capacidade gera alerta. Bloquear é opção configurável da empresa. |
| **RN-25 Saldo por local** | Nas etapas ESTOQUE, todo lote tem saldo por local (`lote_local`) e Σ locais = saldo. Entradas, saídas e reservas indicam o local. Remoção troca o local sem alterar o saldo. |
| **RN-26 Reserva por finalidade** | Reservas de SERVICO e EMBARQUE seguem a RN-07: Σ reservas ativas ≤ saldo do lote no local. Kg reservados só são usados pelo movimento que reservou. Cancelar, excluir ou voltar o movimento para programação libera a reserva. |
| **RN-27 Pesagem de saída** | O embarque só finaliza com carregamento registrado. Se \|peso líquido da balança − Σ lotes\| / Σ lotes passar do limite da empresa (padrão 0,5%), exige motivo. |
| **RN-28 Rebaixamento** | Um lote gerado (serviço/blend) ou vendido (embarque) só pode ter certificados que **todas** as origens tenham (RN-08). Escolher menos certificados que alguma origem é rebaixamento: exige motivo e grava `rebaixamento` com kg por certificado de origem e esquemas perdidos. Certificados são comparados por esquema (ex.: "RFA + AAA" = {RFA, AAA}). |
| **RN-29 Inventário** | A contagem não altera o estoque. Só a **aprovação** (permissão própria) gera movimentos de ajuste (+/−) por lote e local, com auditoria. Inventário não aprovado pode ser cancelado. |
| **RN-30 Pacote de embarque** | Ao finalizar o embarque, gera-se o pacote (§17) com hash SHA-256. O conteúdo é congelado; reemissão só com nova versão e motivo. |
| **RN-31 Limite de quebra no serviço** | Se a quebra de um movimento SERVICO passar do limite do tipo de serviço, o fechamento exige motivo. |

---

## 12. Telas

1. Login → escolha de empresa.
2. **Início:** alertas, cartões (estoque livre/reservado, secagem no ponto, contratos a vencer, apontamentos do dia), funil de saldo por etapa.
3. **Configuração** (ADMIN_EMPRESA): dados da empresa; usuários e acessos; **editor de fluxo** (etapas, classes, tipos de resultado, transições, metas de umidade, prefixos); tabelas de preço de colheita.
4. **Cadastros:** fazendas, talhões (com **mapa**: desenhar, importar e ver sobreposições), produtores/clientes, safras, tipos, peneiras, certificados (por fazenda, com validade e arquivo), locais (capacidade), turmas e colhedores.
5. **App de campo** (PWA, layout mobile): apontamento por turma; leituras de secagem; indicador de sincronização.
6. **Colheita:** cargas do dia, divergências, geração do movimento de colheita.
7. **Pagamentos:** fechamentos, itens por colhedor, adiantamentos e descontos, lista PIX (CSV), recibos (PDF).
8. **Tela genérica de etapa** (uma para todas as etapas PROCESSAMENTO, ESTOQUE e SERVICO):
   - lista de movimentos;
   - detalhe com abas Entradas, Resultados, Leituras (se monitora secagem), Composição por talhão, Rastreabilidade e Histórico;
   - ações Transferir, Lançar/Apagar resultados e Estornar.
9. **Painel de secagem** (§7).
10. **Estoque:** lotes com saldo, filtros (safra, fazenda, peneira, certificado, livre/reservado, apto EUDR) e seleção múltipla para Serviço, Reserva para contrato ou Embarque.
11. **Comercial:** contratos (painel, detalhe, fixações, reservas, amostras), embarques (detalhe, notas, dossiê, finalizar).
12. **Rastreabilidade:** busca por lote, embarque, nota, contrato ou talhão; árvore para cima e para baixo; mapa dos talhões de origem.
13. **Conformidade:** certificados vencendo, talhões sem geometria/checagem, dossiês pendentes.
14. **Auditoria.**
15. **Plataforma** (SUPERADMIN): empresas, planos, suspensão.

Interface em PT-BR, formatação brasileira (`1.234,567`, `dd/mm/aaaa`); ações destrutivas pedem confirmação com motivo.

**Padrão visual (validado no protótipo da exportadora; os dois sistemas devem parecer da mesma família):**
- Menu lateral fixo agrupado (Operação, Consulta, Configuração), que vira menu ☰ no celular; barra de título fixa com busca rápida (nº de movimento/embarque abre direto; texto livre filtra o estoque).
- Paleta **Verde cafezal**: menu `#132a1f`, destaque `#2e6b4c`, dourado `#b5822a`/`#e2ac45`, fundo `#f2f4ef`; verde/amarelo/vermelho reservados para situação; modo escuro equivalente.
- Tipografia: Fraunces (títulos), IBM Plex Sans (texto), IBM Plex Mono (números e códigos).
- Telas de movimento: título + situação; ações no topo (Voltar, **Documentos ▾** com todas as impressões e exportações, ação da etapa); **etapas em linha do tempo** (✓ feita, anel na atual) com quem fez e quando; indicadores em cartões; abas internas como seletor em pílula.
- Busca de cadastros (parceiro, fazenda, motorista, cliente) por campo de busca com resultado rico (nome + documento + detalhe) e "cadastrar agora" na própria lista.
- Confirmações sempre na própria página (nunca `confirm()`/`prompt()` do navegador).

---

## 13. Extensões futuras já previstas no modelo
- **Qualidade e prova:** tabela `laudo(lote_id, data, umidade, peneiras jsonb, defeitos, bebida, pontuacao_sca, provador)`. Reserva/contrato passam a validar o padrão mínimo.
- **QR Code:** `lote.codigo` já é único; basta imprimir e ler a etiqueta.
- **Recebimento de café de terceiros:** etapa da classe COLHEITA com origem "produtor externo".
- **Integração com ERP:** `codigo_erp` em parceiro, contrato e nota.

---

## 14. API (referência)

```
POST /api/auth/empresa-ativa                         {empresaId}
CRUD /api/cadastros/{recurso}
GET/PUT /api/config/fluxo                            (etapas + transições)
POST /api/campo/sync                                 {apontamentos:[...], leituras:[...]}  → idempotente
GET  /api/colheita/cargas  POST /api/colheita/cargas {..., apontamentoIds}
POST /api/pagamentos/fechamentos                     {fazendaId, periodo}
POST /api/pagamentos/fechamentos/{id}/fechar | /pagar | /reabrir
GET  /api/pagamentos/fechamentos/{id}/pix.csv | /recibos.pdf
GET  /api/lotes?etapa=&fazenda=&safra=&certificado=&livre=&aptoEudr=
POST /api/lotes/{id}/reservas                        {quantidade, finalidade, contratoId?}
POST /api/movimentos                                 {etapaId, ...}
POST /api/movimentos/{id}/entradas | DELETE .../entradas/{entradaId}
POST /api/movimentos/{id}/resultados | DELETE .../resultados
POST /api/movimentos/{id}/leituras
POST /api/movimentos/{id}/estornar                   {motivo}
GET  /api/secagem/painel
CRUD /api/contratos ; POST /api/contratos/{id}/fixacoes ; CRUD /api/amostras
POST /api/embarques                                  {contratoId}  (puxa reservas)
POST /api/embarques/{id}/notas | /dossie | /finalizar
GET  /api/rastreabilidade/lote/{id}?direcao=cima|baixo
GET  /api/embarques/{id}/dossie.pdf | .geojson | .csv
POST /api/talhoes/{id}/checagens                     (provedor ou importação manual)
GET  /api/alertas ; POST /api/alertas/{id}/lido
```

Erro de regra → `422 {codigo:"RN-xx", mensagem}`. Recurso de outra empresa → `404`.

---

## 15. Cenário de aceitação ("caminho dourado")

Use como teste de integração ponta a ponta (e e2e na interface).

**Preparação**
- Empresa **Alfa** com o modelo "Via úmida completa".
- Fazenda **NS** (produtor fictício), safra **2025/26**.
- Talhões **T1** (12 ha, polígono) e **T2** (8 ha, polígono). RFA válido para NS. AAA **inexistente**.
- Empresa **Beta** com 1 fazenda (para o teste de isolamento).

**Passos**
1. **Apontamento offline** em T1, turma A, colheita manual: João 40, Maria 35, Pedro 25 = 100 medidas.
   - Sincronizar duas vezes → continuam 3 apontamentos (RN-23).
2. **Preço:** R$ 12,00/medida para NS 2025/26 manual.
3. **Cargas:**
   - C1 (T1, NAT, recepção mediu 100, ligada aos 3 apontamentos, divergência 0) → lote EF1 = 100;
   - C2 (T2, mecânica, 50) → lote EF2 = 50.
4. **Lavador LD#1** recebe EF1 e EF2 (150):
   - resultados VER 0,20 (30), BOI 0,30 (45), CD 0,40 (60), perda 15 (quebra 10%);
   - composição dos lotes: T1 66,67% / T2 33,33%.
5. **Terreiro TE#1** (capacidade 120 medidas) recebe CD 60 e BOI 45 (105 → ocupação 87,5%).
   - Leituras de umidade: 55 → 40 → 28 → 18 → 12,0. Meta 11–12,5 → alerta PONTO_SECAGEM e cartão "no ponto".
   - Resultado: café 0,90 → CD 54,0 e BOI 40,5.
6. **Secador SE#1:** 94,5 → café 0,95 → 89,775.
7. **Tulha TU#1:** 89,775 → café 1,0 → 89,775.
8. **Armazém:** entrada consolidada de TU#1, informados **1.200 kg**, peneira 17 → lote AR com 20 sacas e rendimento 13,367 kg/medida.
   - Certificados: só **RFA**. Tentar adicionar AAA → bloqueado (RN-08).
9. **Fechamento** de pagamento de NS do período:
   - João R$ 480,00, Maria R$ 420,00, Pedro R$ 300,00; total R$ 1.200,00.
   - Fechar; tentar editar o apontamento de João → bloqueado (RN-19).
   - Mudar o preço para R$ 13,00 → o fechamento não muda (RN-20).
10. **Contrato CT-2026-0001:** cliente fictício, 15 sacas (900 kg), FIXO R$ 1.800,00/saca, exige RFA e EUDR.
    - Reservar 900 kg do lote AR → contrato EM_EXECUCAO; lote AR com saldo 1.200 e reserva 900.
    - Tentar reservar mais 400 kg para outro contrato → bloqueado (RN-07).
11. **Checagens:** T1 e T2 SEM_ALERTA.
12. **Embarque EB#1** a partir do contrato → entradas 900 kg do AR. Gerar dossiê:
    - T1 = 600 kg, T2 = 300 kg;
    - certificado RFA válido;
    - sem pendências.
    - Finalizar → contrato CONCLUIDO; lote AR PARCIAL com saldo 300; reserva CONSUMIDA.
13. **Bloqueios esperados:**
    - estornar LD#1 → RN-05;
    - estornar EB#1 → RN-14;
    - usuário da Beta acessar o lote AR por id → 404 (RN-22).
14. **Variante EUDR:** marcar a checagem de T2 como ALERTA e tentar reservar o saldo de 300 kg para um contrato com EUDR → bloqueado (RN-18).
15. **Embarque com pesagem** (antes de finalizar EB#1): programar → reserva EMBARQUE de 900 kg (RN-26); carregar com bruto 15.905, tara 15.000 → líquido 905 kg, diferença 0,56% > 0,5% → exige motivo (RN-27); vender como "RFA" → sem rebaixamento.
16. **Pacote de embarque:** ao finalizar EB#1, o pacote v1 contém NF, 900 kg, RFA, T1 600 kg / T2 300 kg, polígonos e hash (RN-30). Reabrir o embarque não altera o pacote já emitido.
17. **Rebaixamento:** blend de 100 kg de um lote RFA com 100 kg de um lote sem certificado → o resultado só pode ser convencional; escolher convencional exige motivo e grava rebaixamento de 100 kg de RFA (RN-28).
18. **Inventário:** contar 1.190 kg num local onde o sistema tem 1.200 → nada muda até aprovar; ao aprovar, ajuste de −10 kg (RN-29).

**Testes obrigatórios adicionais**
- Concorrência: duas entradas simultâneas sobre o mesmo saldo (só uma passa).
- Estorno em cadeia na ordem inversa.
- Transição não configurada → RN-16.
- Blend de duas fazendas → lote MIX com composição correta.
- Capacidade acima de 100% → alerta.
- Talhão de 5 ha com PONTO → inválido para EUDR.
- Sobreposição de polígonos entre produtores → alerta.

---

## 16. Decisões em aberto

| # | Questão | Padrão adotado até a resposta |
|---|---|---|
| D-01 | Volume padrão da "medida" (L) e se varia por fazenda | Configurável por empresa (padrão 60 L), só informativo |
| D-02 | Terreiro/secador/tulha geram 1 lote por tipo de entrada ou 1 consolidado? | 1 por tipo de café de entrada |
| D-03 | Provedor real de checagem de desmatamento | Interface + mock + importação manual |
| D-04 | Planos e cobrança do SaaS | Campo `plano` informativo; sem cobrança no MVP |
| D-05 | Pagamento de colhedores: semanal ou quinzenal? Encargos? | Período livre; sem encargos (lista para pagar) |
| D-06 | Bloquear ou só alertar quando passar da capacidade | Só alertar (configurável) |
| D-07 | Moeda e preço por saca em USD com câmbio? | Guarda moeda e valor; sem conversão no MVP |
| D-08 | Como o pacote chega à exportadora | Arquivo (JSON + GeoJSON) baixado e enviado; integração direta (API) depois |
| D-09 | A fazenda faz serviço (rebenefício/catação) no próprio armazém? | Sim, opcional (classe SERVICO); IS/prévia de resultado é opcional |
| D-10 | Limite de diferença NF/balança no embarque | 0,5%, configurável por empresa |

---

## 17. Pacote de embarque (fazenda → exportadora)

Gerado ao finalizar o embarque (RN-30). Dois arquivos com o mesmo nome base `pacote-{codigo_embarque}-v{versao}`:

**`.json`** (UTF-8, `formato: "cafe-pacote-embarque"`, `versao_formato: 1`):
```json
{
  "formato": "cafe-pacote-embarque", "versao_formato": 1, "versao": 1,
  "gerado_em": "2026-11-20T14:00:00-03:00", "hash_sha256": "…",
  "emitente": { "nome": "…", "cnpj_cpf": "…", "ie": "…" },
  "destinatario": { "nome": "…", "cnpj_cpf": "…" },
  "embarque": { "codigo": "EB-NS-2526-000001", "data": "2026-11-20", "contrato": "CT-2026-0001",
                "placa": "ABC1D23", "motorista": "…", "lacres": ["…"], "peso_liquido_kg": 905.0 },
  "notas": [ { "numero": "1234", "serie": "1", "chave_nfe": "…", "data_emissao": "2026-11-20", "kg": 900.0 } ],
  "lotes": [ {
      "codigo": "AR-NS-2526-000010-P17", "kg": 900.0, "sacas": 15.0, "safra": "2025/26",
      "peneira": "17", "padrao": "…", "tipo": "NAT",
      "certificados": ["RFA"], "certificado_vendido": "RFA", "rebaixamentos": [],
      "composicao": [ { "fazenda": "NS", "talhao": "T1", "percentual": 0.6667, "kg": 600.0 },
                      { "fazenda": "NS", "talhao": "T2", "percentual": 0.3333, "kg": 300.0 } ]
  } ],
  "fazendas": [ { "codigo": "NS", "nome": "…", "produtor": "…", "cpf_cnpj": "…", "ie": "…", "car": "…",
                  "municipio": "…", "uf": "MG", "certificados_validos": ["RFA"] } ],
  "eudr": { "numero_dds": null, "talhoes_sem_pendencia": true }
}
```

**`.geojson`**: FeatureCollection com um polígono por talhão da composição. Propriedades: `Name`, `id`, `fazenda`, `produtor`, `area_ha`, `kg_no_embarque`, `checagem` (resultado e data).

**Regras**
- O pacote é imutável. Uma correção gera nova `versao` com motivo, e o hash muda.
- Quantidades em kg com 3 casas, como texto decimal no banco e número no JSON.
- O sistema da exportadora lê o par de arquivos na Guia de Entrada e preenche:
  - parceiro, NF, peso da nota e certificado;
  - fazendas com polígono (cria ou atualiza pelo CPF/CNPJ do produtor e pela inscrição estadual).
- Na exportadora, o lote recebido passa a carregar a composição por talhão, para a rastreabilidade e o GeoJSON EUDR da exportação.
