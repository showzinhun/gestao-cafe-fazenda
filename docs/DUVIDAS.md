# Dúvidas em aberto

Registre aqui as dúvidas que surgirem durante a implementação e que não estejam respondidas na especificação.
Para cada uma, anote o padrão adotado até a resposta (ver §16 da [ESPECIFICACAO](ESPECIFICACAO.md)).

| # | Fase | Dúvida | Padrão adotado | Resposta |
|---|---|---|---|---|
| Q-01 | 0 | SUPERADMIN: perfil na tabela `usuario_empresa` ou papel de plataforma separado? | Fica fora da Fase 0. Será um papel de banco separado (com `BYPASSRLS`) e rotas próprias na Fase 8, como diz o §3.1. | |
| Q-02 | 0 | Valores iniciais da matriz perfil × permissão (§3.2). | Definidos em `src/dominio/perfis.ts`; ADMIN_EMPRESA pode tudo. A edição pela empresa entra na Fase 1. | |
| Q-03 | 0 | Em produção, como o banco é provisionado? | Papel `cafe_app` criado pela migração; login da aplicação criado por `npm run db:papel-app`. O dono das tabelas não deve ser usado pela aplicação. | |
| Q-04 | 0 | Duração da sessão. | 12 horas (JWT). Tempo de inatividade e bloqueio por tentativas ficam para uma fase de segurança. | |
