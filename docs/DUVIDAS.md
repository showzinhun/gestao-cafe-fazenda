# Dúvidas em aberto

Registre aqui as dúvidas que surgirem durante a implementação e que não estejam respondidas na especificação.
Para cada uma, anote o padrão adotado até a resposta (ver §16 da [ESPECIFICACAO](ESPECIFICACAO.md)).

| # | Fase | Dúvida | Padrão adotado | Resposta |
|---|---|---|---|---|
| Q-01 | 0 | SUPERADMIN: perfil na tabela `usuario_empresa` ou papel de plataforma separado? | Fica fora da Fase 0. Será um papel de banco separado (com `BYPASSRLS`) e rotas próprias na Fase 8, como diz o §3.1. | |
| Q-02 | 0 | Valores iniciais da matriz perfil × permissão (§3.2). | Definidos em `src/dominio/perfis.ts`; ADMIN_EMPRESA pode tudo. A edição pela empresa entra na Fase 1. | |
| Q-03 | 0 | Em produção, como o banco é provisionado? | Papel `cafe_app` criado pela migração; login da aplicação criado por `npm run db:papel-app`. O dono das tabelas não deve ser usado pela aplicação. | |
| Q-04 | 0 | Duração da sessão. | 12 horas (JWT). Tempo de inatividade e bloqueio por tentativas ficam para uma fase de segurança. | |
| Q-05 | 1 | Onde ficam os modelos de fluxo do §5.3 ("seed global")? | Constantes em `src/dominio/modelos-fluxo.ts`, copiadas para a empresa na criação. Não há tabela global; o SUPERADMIN da Fase 8 poderá editá-los. | |
| Q-06 | 1 | Como criar uma empresa antes da área do SUPERADMIN (Fase 8)? | Script `npm run empresa:criar -- --nome ... --modelo VIA_UMIDA --admin-email ...`, que usa o mesmo serviço `criarEmpresa`. | |
| Q-07 | 1 | Fluxo incoerente (etapa sem caminho a partir da colheita) bloqueia o salvamento? | Não: vira **pendência** mostrada no editor. Só bloqueia o que é impossível: Saída transferindo, Colheita recebendo, transição para a mesma etapa e unidades que não combinam. | |
| Q-08 | 1 | Unidade na volta do benefício para o armazém (kg → etapa que recebe medidas). | A etapa de Estoque guarda em kg, então também aceita kg direto, sem conversão. As demais etapas só recebem na própria unidade. | |
| Q-09 | 1 | O ajuste da matriz de permissões vale para o Administrador? | Não. O Administrador sempre pode tudo, para a empresa não se trancar para fora. | |
| Q-10 | 1 | Ponto ou polígono no talhão. | Aceita os dois. Talhão com mais de 4 ha só com ponto gera aviso (a EUDR pede polígono acima de 4 ha), sem bloquear. Diferença de mais de 10% entre área informada e desenhada também só avisa. | |
| Q-11 | 1 | Fundo do mapa. | Mosaico raster do OpenStreetMap (`tile.openstreetmap.org`), sem chave. Em produção com muitos acessos, trocar por um provedor próprio ou pago, conforme a política de uso do OSM. | |
