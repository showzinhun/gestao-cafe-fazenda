#!/usr/bin/env bash
# Prepara o ambiente de teste: .env com segredos gerados na hora, dependências, banco, seed fictício
# e o café dos passos 3 a 8 do §15 (só na primeira vez). Pode rodar de novo sem duplicar nada.
set -euo pipefail
cd "$(dirname "$0")/.."
DB_HOST="${DB_HOST:-db}"
DB_NOME="${DB_NOME:-cafe}"

if [ ! -f .env ]; then
  segredo() { node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64'))"; }
  cat > .env <<ENV
# Gerado por .devcontainer/preparar.sh (ambiente de teste, dados fictícios).
DATABASE_URL="postgresql://cafe_app_login:cafe_app_dev@${DB_HOST}:5432/${DB_NOME}"
DIRECT_URL="postgresql://postgres:postgres@${DB_HOST}:5432/${DB_NOME}"
APP_DB_PASSWORD="cafe_app_dev"
AUTH_SECRET="$(segredo)"
AUTH_TRUST_HOST="true"
DADOS_PESSOAIS_CHAVE="$(segredo)"
ENV
fi

echo "==> Instalando dependências"
if [ -d node_modules ]; then
  # Atualização: `npm install` só acrescenta o que mudou e não apaga node_modules (o `npm ci` apagaria e derrubaria o sistema que está rodando).
  npm install --no-audit --no-fund
else
  npm ci --no-audit --no-fund
fi
npx prisma generate

set -a; . ./.env; set +a
echo "==> Criando as tabelas e as regras de isolamento"
npx prisma migrate deploy
npm run db:papel-app
echo "==> Carregando as empresas e usuários fictícios"
npm run seed

if [ ! -f .devcontainer/.cenario-carregado ]; then
  echo "==> Lançando o café de exemplo (colheita até o armazém, passos 3 a 8 do §15)"
  npx tsx --env-file=.env scripts/demo-cenario.ts > /dev/null
  touch .devcontainer/.cenario-carregado
fi
echo "==> Pronto. Abra a aba \"Portas\" (3000) ou aguarde o navegador abrir."
