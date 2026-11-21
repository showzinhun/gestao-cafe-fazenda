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
npm run seed                    # 2 empresas fictícias (Alfa: Via úmida, com NS, T1 e T2; Beta: Simplificado)
npm run dev                     # http://localhost:3000
```

Usuários do seed (senha `senha123`, só para desenvolvimento):

| E-mail | Acesso |
|---|---|
| admin@alfa.exemplo | Administrador da Alfa |
| operador@alfa.exemplo | Operador da Alfa |
| admin@beta.exemplo | Administrador da Beta |
| consultora@exemplo.com | Gestora na Alfa e Consulta na Beta (testa a troca de empresa) |

### Nova empresa

Até a área do SUPERADMIN (Fase 8), uma empresa é criada pelo script. Ele copia o modelo de fluxo escolhido (`VIA_UMIDA`, `VIA_SECA` ou `SIMPLIFICADO`, §5.3) e os cadastros básicos (tipos de café, peneiras, certificados e turnos):

```bash
npm run empresa:criar -- --nome "Fazenda Exemplo" --modelo VIA_UMIDA \
  --admin-email admin@exemplo.com --admin-nome "Nome do Admin" --admin-senha "uma-senha-forte"
```

Depois, o administrador ajusta o fluxo em **Configuração → Fluxo de etapas**, cadastra fazendas e talhões (desenhando no mapa ou importando GeoJSON) e libera as fazendas de cada usuário em **Usuários e acessos**.

O mapa usa MapLibre com o fundo do OpenStreetMap. O worker do MapLibre é copiado para `public/vendor` no `npm install` e antes do `dev`/`build`.

## Núcleo de rastreabilidade (Fase 2)

Sem telas ainda. Os casos de uso ficam em `src/servicos` e as regras puras em `src/dominio`:

| Serviço | O que faz |
|---|---|
| `registrarCarga` | carga de colheita → movimento COLHEITA processado com 1 lote (100% do talhão) |
| `abrirMovimento`, `adicionarEntradas`, `removerEntrada` | entradas com saldo, reservas, transição, safra, unidade, acesso por fazenda e capacidade |
| `lancarResultados`, `apagarResultados` | lotes gerados conforme o modelo da etapa (percentual por tipo, café e perda, conversão para kg, por peneira) |
| `estornarMovimento`, `finalizarSaida`, `reabrirSaida` | estorno LIFO e saída imutável |
| `criarReserva`, `cancelarReserva` | reservas por finalidade (RN-07) |
| `obterLote`, `alterarLote`, `definirCertificadosLote` | consulta com composição e certificados; ajustes permitidos |

Toda operação que mexe em quantidade roda numa transação com `SELECT … FOR UPDATE` nos lotes. Há um teste de concorrência em `tests/integracao/rastreabilidade.test.ts`.

## Telas operacionais (Fase 3)

- **Colheita** (`/colheita`): cargas do dia; cada carga gera o lote de colheita.
- **Etapas** (`/etapas`): uma tela para todas as etapas de processamento, estoque e serviço.
  - Lista de movimentos por situação e novo movimento com escolha dos lotes.
  - Detalhe com linha do tempo, indicadores e as abas Entradas, Resultados, Composição por talhão, Rastreabilidade e Histórico.
  - Ações: lançar ou apagar resultados e estornar, com confirmação e motivo na própria página.
- **Estoque** (`/estoque`): filtros, totais em kg e sacas, seleção múltipla para o serviço e remoção entre locais.
- **Inventários** (`/estoque/inventarios`): contagem e aprovação com ajuste.
- **Rastreabilidade** (`/rastreabilidade`): busca; árvore para cima e para baixo com o mapa dos talhões de origem.
- **Busca rápida** na barra de título: "TE#12" abre o movimento; um código de lote abre a rastreabilidade.

Para ver as telas com dados no banco de desenvolvimento, rode os passos 3–8 do §15:

```bash
npx tsx --env-file=.env scripts/demo-cenario.ts
```

## Colhedores, app de campo e pagamento (Fase 4)

- **Colhedores e turmas** (`/colheita/colhedores`): CPF e PIX cifrados e mascarados; "Revelar" só para FINANCEIRO e ADMIN, e cada revelação vai para a auditoria (§3.3). Defina `DADOS_PESSOAIS_CHAVE` em produção (`openssl rand -base64 32`).
- **App de campo** (`/campo/apontar`, celular): funciona sem sinal (IndexedDB/Dexie). Cada registro tem UUID do aparelho e sincroniza por `POST /api/campo/sync`, de forma idempotente (RN-23).
- **Cargas** (`/colheita`): ligadas aos apontamentos do dia e do talhão, com a divergência medido − apontado.
- **Pagamentos** (`/pagamentos`): abrir o período, lançar adiantamentos e descontos, fechar (o preço fica congelado, RN-20), pagar, baixar a lista PIX (CSV) e os recibos (PDF). Relatório de produção em `/pagamentos/producao`.

Usuários fictícios novos no seed: `apontador@alfa.exemplo` (APONTADOR, fazenda NS) e `financeiro@alfa.exemplo` (FINANCEIRO).

## Painel de secagem (Fase 5)

- **Painel** (`/secagem`): um cartão por local das etapas que monitoram secagem, colorido por situação (livre, em secagem, no ponto, atenção). Mostra ocupação, dias, última umidade com tendência e o ponto estimado.
- **Leituras**: pelo celular (`/campo/secagem`, funciona sem sinal) ou na aba **Leituras** do movimento, com a curva umidade × tempo e a faixa da meta. Ao lançar o resultado, a umidade final vem da última leitura.
- **Alertas** (`/alertas`, com contador no menu): ponto de secagem, secagem longa, capacidade e divergência da carga.

## Comercial (Fase 6)

- **Contratos** (`/contratos`): painel com saldo a embarcar por prazo (alerta quando faltam poucos dias), estoque livre × reservado por certificação e peneira, e a lista. O contrato nasce rascunho, é assinado, vai a "em execução" com a primeira reserva e a "concluído" quando o embarcado cumpre a quantidade (com tolerância).
- **Detalhe do contrato**: reservas de lotes (certificados exigidos e peneira mínima, RN-17; saldo + tolerância, RN-07), fixações de preço (contratos "a fixar"), amostras enviadas com retorno e os embarques.
- **Estoque**: selecione lotes e use **Reservar para contrato**. Sem amostra aprovada do lote para o cliente aparece só um aviso.
- **Embarques** (`/embarques`): nascem do contrato e seguem programação (os kg ficam reservados para o embarque, RN-26) → carregamento com motorista, placa, lacres e pesagem (diferença acima do limite exige motivo, RN-27) → notas fiscais → finalizar. Romaneio A4 em PDF. Informada a DDS, o embarque não reabre (RN-14).

O dossiê EUDR/certificações do embarque chega na Fase 7.

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
