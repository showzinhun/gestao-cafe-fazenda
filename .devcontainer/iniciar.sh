#!/usr/bin/env bash
# Liga o sistema na porta 3000 (o Codespaces abre o endereço no navegador).
cd "$(dirname "$0")/.."
echo "Sistema em http://localhost:3000 — no Codespaces, use o link da porta 3000 (aba Portas)."
echo "Usuários fictícios (senha senha123): admin@alfa.exemplo, operador@alfa.exemplo, apontador@alfa.exemplo,"
echo "financeiro@alfa.exemplo, consultora@exemplo.com, admin@beta.exemplo e plataforma@exemplo.com."
exec npm run dev
