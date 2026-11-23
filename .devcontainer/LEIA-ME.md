# Testar a Gestão do Café no navegador

Este ambiente sobe o sistema com **dados fictícios**: as empresas Alfa e Beta, a fazenda NS com os talhões T1 e T2,
e o café da colheita até o armazém (lote AR com 1.200 kg, passos 3 a 8 do cenário).

1. Espere a preparação terminar (3 a 5 minutos na primeira vez). O terminal mostra "Pronto".
2. O sistema liga sozinho na porta 3000 e o navegador abre. Se não abrir, vá na aba **Portas** e clique no ícone de globo da porta 3000.
3. Entre com um dos usuários abaixo (senha `senha123`).

| E-mail | O que vê |
|---|---|
| admin@alfa.exemplo | Tudo da Alfa (administrador) |
| operador@alfa.exemplo | Lançamentos nas etapas |
| apontador@alfa.exemplo | App de campo (apontamento e secagem) |
| financeiro@alfa.exemplo | Pagamentos dos colhedores |
| consultora@exemplo.com | Duas empresas (testa a troca) |
| admin@beta.exemplo | Outra empresa: não vê nada da Alfa |
| plataforma@exemplo.com | Área da plataforma (empresas, planos, suspensão) |

Sugestão de roteiro: Início → Estoque (lote AR) → Contratos → Novo contrato → reservar o lote → Embarque
(programar, carregar, nota) → Conformidade (checar T1 e T2) → gerar o dossiê → finalizar e baixar o pacote.

O endereço é privado (só você, logado no GitHub). Ao fechar, o Codespaces desliga sozinho e guarda os dados
para a próxima vez. Para recomeçar do zero, apague o codespace em github.com/codespaces e crie outro.

## Atualizar para a versão mais nova

No terminal do codespace (o que roda o sistema, "Codespa…"): tecle **Ctrl + C** para parar, e rode:

```bash
git pull
bash .devcontainer/preparar.sh
bash .devcontainer/iniciar.sh
```

Se a página mostrar "Cannot find module", rode `npx prisma generate`, depois `rm -rf .next` e `bash .devcontainer/iniciar.sh`.
