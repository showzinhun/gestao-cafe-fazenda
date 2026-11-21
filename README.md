# Gestão do Café — Fazenda

Plataforma multiempresa (web + PWA) para a fazenda acompanhar o café do talhão ao embarque para a exportadora.

- [CLAUDE.md](CLAUDE.md): regras de implementação e arquitetura.
- [docs/ESPECIFICACAO.md](docs/ESPECIFICACAO.md): fonte de verdade (modelo de dados, regras RN, telas, API, cenário de aceitação).
- [docs/ROADMAP.md](docs/ROADMAP.md): fases e critérios de pronto.
- [docs/DUVIDAS.md](docs/DUVIDAS.md): dúvidas e decisões tomadas durante a implementação.
- [docs/LEGADO_SANKHYA.md](docs/LEGADO_SANKHYA.md): contexto do sistema antigo (só referência).

## Rodar localmente

Requisitos: Node 22 e Docker.

```bash
cp .env.example .env            # ajuste AUTH_SECRET (openssl rand -base64 32)
npm install
docker compose up -d db         # Postgres 16 com os bancos cafe e cafe_test
npx prisma migrate deploy       # tabelas, papel cafe_app e políticas RLS
npm run db:papel-app            # login da aplicação (cafe_app_login), sem BYPASSRLS
npm run seed                    # 2 empresas fictícias
npm run dev                     # http://localhost:3000
```

Usuários do seed (senha `senha123`, só para desenvolvimento):

| E-mail | Acesso |
|---|---|
| admin@alfa.exemplo | Administrador da Alfa |
| operador@alfa.exemplo | Operador da Alfa |
| admin@beta.exemplo | Administrador da Beta |
| consultora@exemplo.com | Gestora na Alfa e Consulta na Beta (testa a troca de empresa) |

## Testes

```bash
npm run lint && npm run typecheck
npm test               # domínio + integração (recria o banco cafe_test do zero)
npm run build && npm run test:e2e   # Playwright contra o build, no banco cafe_test
```

Os testes de integração e e2e usam `TEST_DIRECT_URL` e `TEST_DATABASE_URL`. O preparo recusa qualquer banco cujo nome não termine em `_test`.

## Como o isolamento funciona

- Duas conexões: `DIRECT_URL` (dono das tabelas) só para migração e seed; `DATABASE_URL` (papel `cafe_app`, sem `BYPASSRLS`) para a aplicação.
- Toda tabela de negócio tem `empresa_id` e política RLS com `FORCE ROW LEVEL SECURITY`.
- `comTransacao(ctx, fn)` define `app.empresa_id` e `app.usuario_id` no início de cada transação; fora dela nenhuma linha de negócio aparece.
- A empresa ativa vem da sessão e o vínculo do usuário é conferido a cada requisição. Id de outra empresa → 404.
