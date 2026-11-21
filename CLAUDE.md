# Plataforma de Gestão do Café — da Colheita à Venda

SaaS **multiempresa** (web + PWA) para rastrear o café do talhão ao embarque, com:
- **fluxo de etapas configurável**;
- **apontamento e pagamento de colhedores** (offline no campo);
- **painel de secagem**;
- **módulo comercial** (contratos, reservas, embarques);
- **dossiê EUDR/certificações**;
- **pacote de embarque** para a exportadora que compra o café (§17).

A fazenda guarda o próprio café e vende para a exportadora. A exportadora tem **sistema próprio**: depositantes e titularidade ficam fora daqui.

## Leia antes de qualquer tarefa
- [docs/ESPECIFICACAO.md](docs/ESPECIFICACAO.md) é a **fonte de verdade**: modelo de dados (§4), regras RN-01 a RN-24 (§11), telas, API e cenário de aceitação (§15).
- [docs/ROADMAP.md](docs/ROADMAP.md) traz as fases e o critério de pronto de cada uma.
- [docs/LEGADO_SANKHYA.md](docs/LEGADO_SANKHYA.md) descreve o sistema antigo e serve **só como contexto**. Não copie as limitações dele.

**Não há acesso ao Sankhya/Oracle neste ambiente.** Não invente dados do legado. Se algo não estiver nos docs, veja se é uma "Decisão em aberto" (§16). Se for, use o padrão adotado e registre a dúvida em `docs/DUVIDAS.md`.

## Stack
- **Next.js (App Router) + TypeScript strict**: UI, rotas `/api` e PWA (service worker + IndexedDB via Dexie para o modo offline).
- **PostgreSQL 16 + Prisma**: migrações em `prisma/migrations`. RLS por `empresa_id`, criado em migrações SQL.
- **Auth.js (credentials)** com seleção de empresa ativa; perfis do §3.2.
- **Tailwind + shadcn/ui**; gráficos com Recharts; mapas com **MapLibre GL + OpenStreetMap**; geometria com **Turf.js**.
- **Zod**: validação. **decimal.js / Prisma.Decimal**: quantidades e dinheiro.
- PDF com `@react-pdf/renderer`; XLSX com `exceljs`.
- **Vitest** (domínio + integração com Postgres real via docker); **Playwright** (e2e).
- **Docker Compose**: `db` (Postgres) para dev e testes.

## Arquitetura
```
src/
  dominio/      # regras puras, sem Prisma e sem Next: saldo/status, composição por talhão, certificação, transições,
                # código de lote, quebra/percentuais, previsão de secagem, cálculo de pagamento, validações EUDR,
                # saldo por local, reservas por finalidade, rebaixamento, pacote de embarque (formato + hash)
  servicos/     # casos de uso transacionais (comTransacao(empresaId, fn) define app.empresa_id e usa FOR UPDATE)
  app/          # páginas e rotas /api (finas: autenticar → validar com Zod → chamar serviço → responder)
  app/(campo)/  # telas do app de campo (PWA, mobile, offline)
  componentes/  lib/  (prisma, auth, formatação pt-BR, fila offline)
prisma/schema.prisma, prisma/migrations/*rls*.sql, prisma/seed.ts
tests/dominio  tests/integracao  tests/e2e
```

## Regras de implementação (não negociáveis)
1. **Isolamento multiempresa:**
   - toda tabela de negócio tem `empresa_id` e política RLS;
   - todo acesso ao banco passa por `comTransacao(empresaId, ...)`;
   - recurso de outra empresa → 404;
   - há testes de isolamento para cada módulo.
2. Regras de negócio só em `src/dominio` e `src/servicos`, nunca em componentes ou rotas.
3. Operações que alteram quantidades rodam em **uma transação**, com `SELECT ... FOR UPDATE` nos lotes envolvidos.
4. **Nada operacional é apagado fisicamente.** Estornos e cancelamentos mudam status e registram motivo.
5. `saldo`, `status` do lote e totais de contrato/fechamento são **derivados**, nunca editados pelo cliente.
6. O código **não conhece nomes de etapas** ("Terreiro", "Secador"), só **classes** (§5.1) e a configuração da empresa.
7. Erros de regra: `ErroRegra('RN-xx', mensagem)` → HTTP 422 `{codigo, mensagem}`.
8. Toda escrita grava `auditoria`. Autoria e datas vêm do servidor.
9. Quantidades e dinheiro: `Decimal`, **nunca `number`**.
10. Sincronização offline idempotente pelo UUID gerado no aparelho (RN-23).
11. Dados pessoais de colhedores (CPF, PIX): criptografados, mascarados por padrão, auditados ao revelar (§3.3).
12. Cada RN-xx tem pelo menos um teste com o código no nome (`it('RN-18 bloqueia lote com alerta de desmatamento')`).
13. Seeds e testes usam **apenas dados fictícios**.
14. Interface segue o **padrão visual do §12** (menu lateral, Documentos, etapas, paleta Verde cafezal). Confirmações sempre na página, nunca `confirm()`/`prompt()`.
15. O formato do pacote de embarque (§17) é contrato com outro sistema: mudanças só com nova `versao_formato`.

## Comandos
```bash
npm install
docker compose up -d db
npx prisma migrate dev
npm run seed
npm run dev
npm test            # vitest (domínio + integração)
npm run test:e2e    # playwright
npm run lint && npm run typecheck
```

## Definição de pronto
- `lint`, `typecheck` e `test` passando; regras novas com testes.
- Os passos do cenário §15 que a fase cobre passam.
- Commits pequenos em português (`tipo(escopo): descrição`).
- Um PR por fase.
