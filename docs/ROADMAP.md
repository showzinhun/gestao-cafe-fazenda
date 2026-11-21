# Roadmap e prompts para a sessão na nuvem

Execute **uma fase por sessão/PR**. Revise e faça o merge antes de iniciar a próxima.
Cada prompt já pede para ler o CLAUDE.md e a especificação.

| Fase | Entrega | Passos do cenário §15 cobertos |
|---|---|---|
| 0 | Esqueleto, multiempresa, autenticação | isolamento básico |
| 1 | Cadastros + fluxo configurável | preparação |
| 2 | Núcleo de rastreabilidade (domínio) | 3–8, 13 |
| 3 | Telas operacionais + estoque (saldo por local, remoção, inventário) | 3–8 e 18 pela interface |
| 4 | Colhedores, apontamento offline e pagamento | 1, 2, 9 |
| 5 | Painel de secagem | 5 (leituras e alertas) |
| 6 | Comercial + embarque (programação, carregamento, romaneio) | 10, 12 e 15 (sem dossiê) |
| 7 | Certificações, rebaixamento, EUDR, dossiê e pacote de embarque | 8, 11, 12, 14, 16 e 17 |
| 8 | Início/dashboard, conformidade, plataforma | cenário completo e2e |
| 9 | Leitor do pacote no sistema da exportadora | importação do passo 16 |

---

## Fase 0 — Esqueleto e multiempresa
**Entrega**
- Next.js + TS strict, Prisma, Postgres via docker compose, Tailwind/shadcn, Vitest, Playwright e CI no GitHub Actions.
- Tabelas `empresa`, `usuario`, `usuario_empresa`, `usuario_fazenda` (fazenda mínima) e `auditoria`.
- **RLS** e helper `comTransacao(empresaId, fn)`.
- Login → escolha de empresa ativa.
- Layout com menu (desktop) e layout mobile do app de campo.
- Manifesto PWA.
- Seed com 2 empresas fictícias.

**Pronto quando:** o usuário da empresa A não acessa os dados da B (teste de integração), o CI está verde e o PWA é instalável.

> **Prompt:** Leia o CLAUDE.md e docs/ESPECIFICACAO.md (§3 e §4.1). Execute a Fase 0 do docs/ROADMAP.md: esqueleto do projeto com multiempresa (RLS + comTransacao), login com escolha de empresa, perfis, auditoria, layout desktop e mobile, manifesto PWA e CI. Inclua testes de isolamento entre empresas. Abra um PR.

---

## Fase 1 — Cadastros e fluxo configurável
**Entrega**
- Todos os cadastros do §4.2 e §4.3.
- Modelos de fluxo prontos (§5.3), copiados na criação da empresa.
- **Editor de fluxo**: etapas, classes, tipos de resultado, transições, metas de umidade e prefixo.
- Talhões com mapa básico (desenhar e importar GeoJSON).
- Usuários, acessos por fazenda e tabela de preços de colheita (só o CRUD).

**Pronto quando:** dá para criar uma empresa com o modelo "Via úmida completa", editar o fluxo e cadastrar NS, T1 e T2 do §15.

> **Prompt:** Execute a Fase 1 do docs/ROADMAP.md: cadastros do §4.2, fluxo configurável (§4.3 e §5) com modelos prontos e editor visual de etapas e transições, talhões com mapa (MapLibre + desenho/importação GeoJSON) e gestão de usuários e acessos por fazenda. Testes para as regras do §5.2. Abra um PR.

---

## Fase 2 — Núcleo de rastreabilidade (sem telas)
**Entrega:** em `src/dominio` e `src/servicos`:
- movimentos genéricos por **classe**;
- entradas, resultados conforme `modelo_resultado`, apagar resultados e estorno;
- reservas e transferências;
- RN-01 a RN-16 e RN-24 (sem as partes de contrato e EUDR);
- composição por talhão (RN-09);
- código de lote (§8);
- teste de concorrência;
- passos 3–8 e 13 do §15 como teste de integração (cargas criadas direto pelo serviço).

**Pronto quando:** todos os testes RN e o cenário parcial passam.

> **Prompt:** Execute a Fase 2 do docs/ROADMAP.md: núcleo de rastreabilidade genérico por classe de etapa (§5.1), com as regras RN-01 a RN-16 e RN-24 e os testes, incluindo concorrência e os passos 3–8 e 13 do cenário §15. Sem telas. Abra um PR.

---

## Fase 3 — Telas operacionais e estoque
**Entrega**
- Tela de colheita (cargas, sem apontamento ainda).
- **Tela genérica de etapa** com abas e ações.
- Estoque com filtros e seleção múltipla.
- Serviço (GS) com resultados por peneira.
- Rastreabilidade em árvore (para cima e para baixo) com mapa dos talhões de origem.
- Saldo por local (`lote_local`), remoção entre locais e inventário com aprovação (RN-25 e RN-29).
- Layout padrão do §12 (menu lateral, Documentos, etapas em linha do tempo, paleta Verde cafezal).
- API do §14 correspondente.
- e2e dos passos 3–8.

> **Prompt:** Execute a Fase 3 do docs/ROADMAP.md: telas do §12 itens 6, 8, 10 e 12, usando os serviços da Fase 2 e a API do §14, e um teste e2e em Playwright para os passos 3–8 do §15. Abra um PR.

---

## Fase 4 — Colhedores, apontamento offline e pagamento
**Entrega**
- Turmas e colhedores (CPF/PIX criptografados e mascarados).
- **App de campo** offline: Dexie + fila de sincronização idempotente (`/api/campo/sync`).
- Cargas ligadas aos apontamentos, com divergência.
- Fechamento, pagamento, lista PIX (CSV) e recibos (PDF).
- Relatórios de produção.
- RN-19 a RN-21 e RN-23.

**Pronto quando:** os passos 1, 2 e 9 do §15 passam, com teste e2e simulando o modo offline (Playwright `context.setOffline`).

> **Prompt:** Execute a Fase 4 do docs/ROADMAP.md: colhedores e turmas (com LGPD do §3.3), app de campo offline para apontamento (§6.1) com sincronização idempotente, cargas de colheita (§6.2) e fechamento/pagamento (§6.3), com as regras RN-19 a RN-21 e RN-23 e os passos 1, 2 e 9 do §15, incluindo e2e offline. Abra um PR.

---

## Fase 5 — Painel de secagem
**Entrega**
- Leituras (também offline).
- Mapa de ocupação com cores.
- Curva de umidade.
- Previsão de ponto.
- Alertas (PONTO_SECAGEM, SECAGEM_LONGA, CAPACIDADE) e central de alertas.

> **Prompt:** Execute a Fase 5 do docs/ROADMAP.md: painel de secagem do §7 com leituras offline, curva, previsão, ocupação por local e alertas, cobrindo o passo 5 do §15. Abra um PR.

---

## Fase 6 — Comercial
**Entrega**
- Contratos (estados, fixações, certificados exigidos).
- Amostras.
- Reservas por contrato.
- Embarques a partir do contrato, com notas e finalização (sem dossiê ainda).
- Painel comercial e alerta de prazo.
- Embarque em etapas: programação com reserva (RN-26), carregamento com pesagem, motorista e lacres (RN-27), romaneio A4.
- Cadastro de motoristas.
- RN-07 (contrato), RN-14, RN-17, RN-26 e RN-27.

> **Prompt:** Execute a Fase 6 do docs/ROADMAP.md: módulo comercial do §9 (contratos, fixações, amostras, reservas, embarques, painel), com as regras RN-07, RN-14 e RN-17, cobrindo os passos 10 e 12 do §15 (exceto o dossiê). Abra um PR.

---

## Fase 7 — Certificações, EUDR e dossiê
**Entrega**
- Certificados por fazenda com validade e alertas.
- Herança de certificação (RN-08) aplicada em toda a cadeia.
- Validações geométricas (área, tipo, sobreposição).
- Interface de provedor de desmatamento (mock + importação manual).
- **Dossiê** (PDF, GeoJSON, CSV, hash, número da DDS).
- Rebaixamento de certificado no serviço e no embarque (RN-28); limite de quebra por tipo de serviço (RN-31).
- **Pacote de embarque** (§17) com hash e versão (RN-30).
- RN-18.

> **Prompt:** Execute a Fase 7 do docs/ROADMAP.md: certificações e EUDR do §10, com a regra RN-18, dossiê do embarque (PDF/GeoJSON/CSV com hash) e os passos 8, 11, 12 e 14 do §15. Abra um PR.

---

## Fase 8 — Início, conformidade e plataforma
**Entrega**
- Tela inicial com cartões e funil.
- Tela de conformidade.
- Área SUPERADMIN (empresas, suspensão).
- **e2e completo do §15.**
- Revisão de desempenho (índices, paginação) e acessibilidade.

> **Prompt:** Execute a Fase 8 do docs/ROADMAP.md: telas 2, 13 e 15 do §12, o e2e completo do cenário §15 e uma revisão de índices, paginação e acessibilidade. Abra um PR.

---

## Como rodar na nuvem (Claude Code na web)
1. Crie um repositório **privado** no GitHub (ex.: `gestao-cafe-fazendas`) e envie esta pasta.
2. Abra **claude.ai/code**, escolha o repositório e cole o prompt da fase.
3. Revise o PR, faça o merge e siga para a próxima fase.
4. Responda às dúvidas registradas em `docs/DUVIDAS.md` atualizando a §16 da especificação.

---

## Fase 9 — Leitor do pacote na exportadora
**Entrega** (no repositório do sistema da exportadora, não nesta plataforma)
- Na Guia de Entrada, botão "Importar pacote da fazenda" (`.json` + `.geojson`).
- Validação do formato e do hash.
- Preenche parceiro, NF, peso e certificado; cria ou atualiza fazendas e polígonos.
- O lote recebido guarda a composição por talhão.

**Pronto quando:** o pacote do passo 16 do §15 é importado e a rastreabilidade da Guia de Saída da exportadora mostra T1 600 kg / T2 300 kg com os polígonos.
