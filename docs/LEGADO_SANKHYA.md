# Legado — AD_FLXFAZ no Sankhya (referência)

Mapeado em 19/11/2026 no Oracle (schema VELOSOPRD), **somente pela estrutura**: dicionário Sankhya, constraints, triggers e botões de ação.

Limitações:
- O código das procedures `AD_STP_*` e das funções `Formaloteposcolh` e `Formalotearmazem` **não estava acessível**.
- As regras dessas rotinas foram deduzidas pelos nomes, pelos parâmetros dos botões e pelas triggers.

Este arquivo serve de **contexto e referência para uma futura migração**. A plataforma nova **não é um clone**: ela reaproveita o conhecimento do processo e corrige as limitações listadas no §7.

**A fonte de verdade é [ESPECIFICACAO.md](ESPECIFICACAO.md).** Os equivalentes desta página ("movimento LAVADOR", "TERREIRO" etc.) correspondem, no sistema novo, a **etapas configuradas** com uma classe (PROCESSAMENTO, ESTOQUE...), não a etapas fixas no código.

---

## 1. A tabela raiz

`AD_FLXFAZ`: "Fluxo Fazendas"; a instância de tela se chama **"Rastreabilidade de Cafés"**.

| Coluna | Tipo | Nota |
|---|---|---|
| ID | NUMBER(10) PK | |
| DESCRICAO | VARCHAR2(100) | |

- Tem 1 registro e nenhuma trigger.
- É só o cabeçalho que agrupa as abas. Todas as tabelas de etapa têm PK `(ID, código)` e FK `ID → AD_FLXFAZ`.
- Botão "Gerar Excel" (Java `br.pauloveloso.excel.GerarExcelSankhya`).
- No sistema novo, **não tem equivalente**.

## 2. Tabelas de etapa (filhas da AD_FLXFAZ)

| Tabela | Descrição | Chave | Equivalente no sistema novo |
|---|---|---|---|
| AD_PHCMCF | Movimentação de medidas colhidas | ID, CODCMCF | movimento COLHEITA + lote EF + colheita_detalhe |
| AD_PHMVLA | Movim. Lavador/Despol. | ID, CODMVLA | movimento LAVADOR |
| AD_PHMVTE | Movimentação Terreiro | ID, CODMVTE | movimento TERREIRO |
| AD_PHMVSC | Movimentação secadores | ID, CODMVSC | movimento SECADOR |
| AD_PHMVTU | Mov. das tulhas | ID, CODMVTU | movimento TULHA |
| AD_PHMAMZ | Armazém | ID, NUGR | lote ARMAZEM (GR ou GS) |
| AD_PHMGSV | Guias de serviço | ID, NUGS | movimento SERVICO + servico_detalhe |
| AD_PHMGEQ | Guia de embarque | ID, NUGE | movimento EMBARQUE + embarque_detalhe |

## 3. Sub-abas de cada etapa

| Papel | Lavador | Terreiro | Secador | Tulha | Colheita | GS | GE | Armazém |
|---|---|---|---|---|---|---|---|---|
| Origem (entradas) | AD_PHORML | AD_PHORMT | AD_PHORMS | AD_PHORMU | AD_PHCMCO | AD_PHMGSVITE | AD_PHMGEQITE | — |
| Resultado (saídas) | AD_PHRELA | AD_PHRETR | AD_PHRESC | AD_PHRETU | — | AD_PHREGS | — | — |
| Talhões (% contribuição) | AD_PHLATH | AD_PHTETH | — | AD_PHTUTH | (CODTALH) | — | — | — |
| Destinos | — | — | — | — | AD_PHDMCF | — | — | — |
| Snapshot de rastreabilidade | AD_PHMVLAR | AD_PHMVTER | AD_PHMVSCR | AD_PHMVTUR | AD_PHCMCFR | AD_PHMGSVR | AD_PHMGEQR | AD_PHMAMZR |
| Outros | AD_PHPPMA (paradas) | | | | | | AD_PHMGEQNOTA (NF-e) | |

Detalhes de cada sub-aba:
- **Origem**: guarda lote, medidas, medidas utilizadas, saldo, tipo da origem, data do lote de origem, data da transferência e as chaves do registro de origem (CODCMCF, CODMVLA, CODRELA, CODRETR...).
- **Resultado**: guarda tipo de café, % resultante, medidas de entrada, utilizadas e saldo, status, lote, umidade (terreiro/secador) e data do resultado. Na GS (AD_PHREGS) há também peneira, kg de entrada/saída/saldo e certificado.
- **Snapshot (`*R`)**: tem IDRAST, IDORIGEM, MOVIMENTO, REF_ORIGEM, REF_DESTINO, IDLOG, DTMOV e DTRASTR. Na GE (AD_PHMGEQR) inclui ainda parceiro, data da venda, NUNOTA, nº da nota, lote, kg e sacas de saída, safra e padrão.
- **Talhões**: cada linha tem projeto/talhão, medidas e % de contribuição.
- **Itens de GE** (AD_PHMGEQITE): LOTE, QTD (kg), certificados AAA/RFA, NUGR (lote de origem no armazém), peneira e CODCERT.
- **Notas de GE** (AD_PHMGEQNOTA): NUMNOTA, CODPARC, NUNOTA, CHAVENFE, QTDTOTITE e MEDTOTITE (sacas 60 kg).

### Log de movimentação: `AD_PHMLOG` (exibido pela view AD_VPHMLOG)

Colunas: `IDLOG, DH_MOV, CODUSU, ID_ORIGEM, ID_DESTINO, ID_REF, TABELA_ORIGEM, TABELA_DESTINO, ORIGEM, DESTINO, REF_ORIGEM, REF_DESTINO, NURE_ORIG, NURE_DEST`

É o grafo de genealogia do legado: cada transferência grava uma aresta origem → destino. No sistema novo, `movimento_entrada` cumpre esse papel.

## 4. Campos principais por etapa

- **AD_PHCMCF (colheita)**
  - Identificação: CODCMCF, CODBAFA (fazenda), CODTALH, CODPROJ, SAFRA, CODTPCF, TIPCAFE (CAT/LAV/NAT), CODCERT, CERTIFICACAO (S/N), LOTE.
  - Operação: TIPOCOLHEITA (MANUAL/MECANICA/VARIOS), TIPOTRANSPORTE (CAMINHAO/TRATOR), CODPARCCOLH, CODPARCTRAT, CODPHTURN, DTCOLHEITA, DATABASE, DESTTER (destino terreiro).
  - Quantidades: MEDIDASENT, MEDIDASUTILIZ, MEDIDAS (saldo), QTDRESERV.
  - Outros: STATUS, TIPORIGEM (TALHAO/TRANSF), NROCONTROLE/NUMCONTROLE, OBSERVACAO, SAFRABKP.
- **AD_PHMVLA (lavador)**: CODMVLA, CODBAFA, CODPHTURN, CONFERENTE, OPERADOR, DTENTRADA, MEDIDASENT, MEDIDASSAI, PERCQUEBRA, TIPO (LAVADO/NATURAL), DESTTER, STATUS, LOTE, SAFRA, CODCERT.
- **AD_PHMVTE / AD_PHMVSC / AD_PHMVTU (terreiro, secador, tulha)**: código do movimento, CODBAFA, CODTERR/CODSECA/CODTULH, CODTPCF, CONFERENTE, CONTROLE, DTENT, MEDIDASENT, MEDIDASSAI, PERCQUEBRA, UMIDADE (só secador), STATUS, LOTE, SAFRA, CODCERT.
- **AD_PHMAMZ (armazém)**
  - Identificação: NUGR, CODBAFA, CODSAFRA, CODTPCF, CODPENEIRA, LOTE, ORIGEM (GR = veio da tulha, GS = veio de guia de serviço), GSORIGEM.
  - Quantidades: DTENT, MEDIDASENT/MEDIDASSAI/MEDIDAS (sacas), QTDENT/QTDSAI/QTDSALDO (kg), QTDRESERV (kg).
  - Certificação: CERTRAINFOREST (S/N), CERTAAA (S/N), CODCERT.
  - STATUS.
- **AD_PHMGSV (GS)**: NUGS, DTENT (despejo), TOPSERVICO (BLEND/CATACAO/REAPROV/REBENEFICIO), QTDENT/QTDSAI (kg), MEDIDAS* (sacas), PERCQUEBRA, KGQUEBRA, CERTAAA, CERTRAINFOREST, CODCERT, CODSAFRA, STATUS. O LOTE é calculado como `'GS'||LPAD(NUGS,6,0)`.
- **AD_PHMGEQ (GE)**: NUGE, CODPARC, NOMEPARC, RAZAOSOCIAL, CGC_CPF, TIPPESSOA, DTENT, DTVENDA, TC (contrato), QTD (kg), CERTAAA, CERTRAINFOREST, CODCERT, CODBAFA, CODSAFRA, STATUS (ABERTO/FINALIZADO), OBSERVACAO.

### Listas de opções do legado

| Campo | Valores |
|---|---|
| STATUS (etapas) | ABERTO, PARCIAL, UTILIZADO (a tulha tem também FECHADO; a GE tem ABERTO/FINALIZADO; o secador só ABERTO/UTILIZADO) |
| DESTTER | Opções fixas com fazendas de destino (BE, CA, NS, OU, PO, SB, SL, VV). No sistema novo vira FK para `local`/`fazenda`. |
| TIPCAFE | CAT Cata, LAV Lavado, NAT Natural |
| Saídas do lavador | VERDE, BOIA, CEREJA DESCASCADA e combinações |
| TOPSERVICO | BLEND, CATACAO, REAPROV, REBENEFICIO |
| Certificação no armazém | 1 = Rainforest, 2 = AAA, 3 = Rainforest e AAA |

### Cadastros referenciados

| Legado | Sistema novo |
|---|---|
| AD_PHBAFA | fazenda |
| AD_PHTALH | talhao |
| AD_PHTPCF | tipo_cafe |
| AD_VELSAF | safra |
| AD_VELCERT | certificado |
| AD_VELPEN | peneira |
| AD_PHTERR, AD_PHSECA, AD_PHTULH | local |
| AD_PHTURN | turno |
| TCSPRJ | projeto (campo de colheita_detalhe) |
| TSIUSU | usuario |
| TGFPAR | parceiro |

## 5. Regras implementadas em triggers

- **Status e saldo da colheita** (`AD_TRG_INC_AD_PHCMCF`, `AD_TRG_INC_UPD_AD_PHCMCF`):
  - Na inclusão: STATUS = ABERTO, MEDIDASUTILIZ = 0, MEDIDAS = MEDIDASENT.
  - Se TIPORIGEM = TRANSF, a entrada começa zerada.
  - DATABASE = TRUNC(DTCOLHEITA).
  - MEDIDAS = MEDIDASENT − MEDIDASUTILIZ.
  - O lote é gerado por `Formaloteposcolh('EF', fazenda, safra, CODCMCF, tipo)`.
- **Bloqueio** (`AD_TRG_PHCMCF_BLOCK_UTILIZADO`):
  - QTDRESERV não pode passar do saldo (MEDIDAS).
  - Registros PARCIAL ou UTILIZADO não podem ser alterados nem excluídos. A mensagem orienta a estornar o processo de destino.
- **Permissão** (`AD_STP_VERIF_USU_RAST(usuario, fazenda)`): chamada em toda inclusão e alteração de todas as etapas.
- **Lote automático**:
  - Terreiro `TE`, secador `SE` e tulha `TU`: `Formaloteposcolh(tipo, fazenda, safra, controle, tipo café)`.
  - Armazém: `Formalotearmazem('GR', fazenda, safra, NUGR, peneira, tipo)`, ou `('GS', NULL, safra, GSORIGEM, peneira, NULL)` quando o lote veio de uma GS.
- **Auditoria**:
  - DHINCLUDE/CODUSUINC na inclusão; DHALTER/CODUSUALT em toda alteração.
  - CONFERENTE em maiúsculas.
  - Triggers `*_LOG` gravam um log de alteração.
- **Lavador** (`AD_TRG_INC_AD_PHMVLA`): nasce ABERTO, com entrada e saída zeradas.
  - Uma trigger AFTER, hoje desativada com `return;`, criava 4 resultados padrão (tipos 5, 6, 7 e 8).

## 6. Processos (botões de ação → procedures)

**Colheita**
- Transferir para terreiro / para lavador (quantidade, todas as medidas, ou "qtd. a transferir" = reserva), podendo gerar o movimento de destino.
- Aplicar safra, talhão ou tipo de café.
- Adequar medidas (por % ou por total; há uma versão "random" com intervalo mínimo/máximo).
- Duplicar lançamentos de safra.
- Calcular saldos, totalizar resultados, apagar.

**Lavador**
- Carregar tipos e totalizar resultados (% verde, % boia, % CD...).
- Gerar movimento de terreiro ou de secador (escolhendo o tipo a transferir).
- Apagar resultados.
- Apagar e estornar para medidas colhidas.

**Terreiro**
- Carregar e totalizar resultados (% café, % perda, data).
- Gerar movimento de secador ou de tulha.
- Apagar resultados.
- Apagar e estornar para secador, lavador ou medidas colhidas.

**Secador**
- Totalizar resultados.
- Gerar movimento de tulha (e terreiro, marcado como OLD).
- Apagar resultados.
- Apagar e estornar para terreiro ou lavador.

**Tulha**
- Totalizar resultados.
- Gerar estoque no armazém, consolidado ou por item (informando certificação, data e certificado).
- Apagar resultados.
- Apagar e estornar para terreiro ou secador.

**Armazém**
- Gerar GS (com ou sem a qtd. reservada; pede data de despejo, observação e tipo de serviço).
- Gerar GE (pede data de venda, observação e TC).
- Estornar GS para resultado GS.
- Apagar estoque e estornar para a tulha.

**Resultado GS (AD_PHREGS)**
- Gerar resultados (pede peneira, kg de entrada e data).
- Fechar lotes de resultado.
- Gerar estoque no armazém.
- Apagar resultados.
- Estornar o armazém.

**GS**
- Apagar GS e estornar para o armazém.

**GE**
- Atualizar dados (parceiro, TC).
- Finalizar GE.
- Gerar rastreabilidade.
- Estornar GE para o armazém.

**Todas as etapas**
- "Gerar rastreabilidade do movimento", feito por classes Java `br.pauloveloso.rastreabilidade.{MedidasColhidas, Lavador, Terreiro, Secador, Tulha, Armazem, GuiaServico, GuiaEmbarque}`. Existem versões "OLD" e "NOVO" (módulos 37 e 46).

## 7. Problemas do legado que o sistema novo NÃO deve repetir

1. Oito tabelas quase iguais, em vez de um modelo único de lote e movimento.
2. Campos duplicados ou conflitantes:
   - SAFRA / CODSAFRA / SAFRABKP;
   - NROCONTROLE / NUMCONTROLE;
   - certificação em três formas (CERTIFICACAO S/N, CERTAAA + CERTRAINFOREST, CODCERT).
3. Lista de fazendas fixa nas opções (DESTTER).
4. Status com vocabulários diferentes entre as etapas.
5. Unidades misturadas sem regra explícita (medidas, sacas, kg).
6. Código de lote como texto concatenado, que é a chave de busca da rastreabilidade.
7. Código morto (trigger com `return;`) e botões duplicados "OLD/NOVO".
8. Genealogia em tabela de log separada e snapshots mantidos à parte, em vez de derivados do próprio modelo.
