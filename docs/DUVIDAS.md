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
| Q-12 | 2 | `saldo` como coluna gerada no banco? | Não: o Prisma não lida bem com colunas geradas. O saldo é calculado no domínio (`quantidade − utilizada`) e o banco protege com CHECK: utilizada ≤ quantidade e reservada ≤ saldo. | |
| Q-13 | 2 | Certificados da fazenda (`fazenda_certificado`) estão na Fase 7, mas a RN-08 é da Fase 2. | A tabela foi criada já na Fase 2, sem tela (o seed traz o RFA de NS). Cadastro e alertas de vencimento ficam na Fase 7. | |
| Q-14 | 2 | Onde ficam os dados da carga antes da Fase 4 (apontamentos)? | No próprio movimento de colheita: talhão, modo de colheita (manual, semimecanizada, mecânica) e quantidade medida. A tabela de carga, com a ligação aos apontamentos, entra na Fase 4. | |
| Q-15 | 2 | `contrato_id` em movimento e reserva sem o módulo comercial. | Coluna sem chave estrangeira até a Fase 5. A regra "reserva de contrato só para o embarque do mesmo contrato" (RN-07) já vale. | |
| Q-16 | 2 | Ao estornar um movimento que consumiu uma reserva, a reserva volta? | Não: os kg voltam ao lote como saldo livre. Reservas feitas *para* o movimento estornado são canceladas (RN-26). | |
| Q-17 | 2 | Como medir a ocupação de um local (RN-24)? | Entradas dos movimentos abertos no local + saldo dos lotes gerados ali. Só compara quando a unidade da capacidade combina (medidas; kg ou sacas). Capacidade em m² não é conferida. | |
| Q-18 | 2 | Formato de número vindo da API. | Com vírgula é o formato brasileiro ("1.200,5"); sem vírgula, o ponto é decimal ("1200.5"). Nunca se usa `number` para guardar. | |
| Q-19 | 2 | §5.1: a colheita pode receber lote de outra fazenda (transferência)? | Ainda não: a Colheita só recebe por carga. Isso exige uma regra própria no fluxo e fica para quando houver o caso real. | |
| Q-20 | 2 | Quais dados do lote o RN-03 congela? | Quantidade, safra e fazenda nunca são editáveis. Tipo e peneira só mudam enquanto o lote está ABERTO. Os certificados do estoque também só mudam com o lote ABERTO: sai com motivo e volta só o que a regra permitiu na geração. | |
| Q-21 | 2 | Data usada para a validade do certificado na herança (RN-08). | A data do resultado (ou da carga), no fuso America/Sao_Paulo. | |
| Q-22 | 3 | Como o inventário ajusta o estoque sem editar quantidade (RN-03, RN-29)? | Cada diferença aprovada vira um movimento de natureza AJUSTE_INVENTARIO: falta = baixa do lote naquele local; sobra = lote novo com a mesma composição, certificados, safra, tipo e peneira. Ajuste não se estorna: corrige-se com outro inventário. | |
| Q-23 | 3 | Entrada de um lote do estoque que está em mais de um local (RN-25). | Se só um local tem saldo suficiente, ele é usado; senão a tela pede o local. O estorno e a retirada devolvem ao mesmo local. | |
| Q-24 | 3 | Aba "Leituras" do movimento (§12 item 8) e painel de secagem. | Ficam para a fase do painel de secagem (§7). A aba ainda não aparece; a umidade final já pode ser lançada no resultado. | |
| Q-25 | 3 | "Reserva para contrato" e "Embarque" na seleção do estoque (§12 item 10). | Botões visíveis e desativados até as Fases 5 e 6. Hoje a seleção envia os lotes para um serviço. O filtro "apto EUDR" entra na Fase 7, com as checagens. | |
| Q-26 | 3 | Busca da rastreabilidade por embarque, nota e contrato. | Chega com o comercial. Hoje: código de lote, nº de movimento ("TE#12") e talhão. | |
| Q-27 | 3 | Números digitados na tela. | Sempre no formato brasileiro: ponto separa milhar e vírgula separa decimal ("1.200" = mil e duzentos). A tela converte antes de enviar; a API segue a Q-18. | |
| Q-28 | 3 | Rastreabilidade por tipo quando um movimento gera um lote por tipo (D-02). | O lote guarda as entradas que o formam (`lote.fontes`). A árvore e a composição seguem só essas entradas. | |
| Q-29 | 4 | Como cifrar CPF e PIX (§3.3)? | AES-256-GCM na aplicação (`src/lib/cripto.ts`) com a chave `DADOS_PESSOAIS_CHAVE` (obrigatória em produção). O banco guarda a cifra, a máscara e um HMAC do CPF (impede repetido sem guardar o CPF aberto). A auditoria nunca grava o dado aberto, só as máscaras. | |
| Q-30 | 4 | Os recibos em PDF mostram o CPF completo? | Não: saem com o CPF mascarado. O CPF aberto só aparece na lista PIX (CSV), gerada por FINANCEIRO/ADMIN e auditada. | |
| Q-31 | 4 | RN-19 "lançamentos repetidos são somados": como, se cada aparelho gera o próprio UUID? | Um apontamento por colhedor, talhão e dia; cada UUID do aparelho é uma "origem" com a sua parte. Reenviar o mesmo UUID com o mesmo valor é ignorado; mudar o valor aplica a diferença. Índice único no banco garante um apontamento válido por colhedor/talhão/dia. | |
| Q-32 | 4 | Conflito offline (RN-23). | O aparelho envia a versão que viu. Se o gestor corrigiu depois (versão mudou) ou o apontamento já está num fechamento, o servidor recusa e devolve o valor dele; o app mostra a mensagem e passa a exibir o valor do servidor. | |
| Q-33 | 4 | Limite de divergência da carga (§6.2). | 5% sobre o apontado, configurável em `empresa.configuracoes.limite_divergencia_carga`. Passar do limite só gera alerta. | |
| Q-34 | 4 | Reabrir um fechamento mantém o preço congelado? | Não: reaberto, o preço volta a ser o da tabela e é congelado de novo ao fechar. O fechamento pago não reabre. | |
| Q-35 | 4 | A restrição de período sem sobreposição (RN-21) usa a extensão `btree_gist`. | A migração cria a extensão; em produção o dono do banco precisa poder criá-la (ou ela deve vir instalada). | |
| Q-36 | 4 | Custo da colheita por saca (§6.3). | Aproximado: custo dos apontamentos do talhão no período ÷ sacas no estoque cuja composição inclui o talhão (quantidade equivalente da RN-09). Não separa safras nem períodos de colheita. | |
| Q-37 | 5 | "N dias" e "X horas" do cartão de atenção (§7). | Configuráveis em `empresa.configuracoes`: `secagem_limite_dias` (padrão 5) e `secagem_horas_sem_leitura` (padrão 12). | |
| Q-38 | 5 | Previsão de ponto: até onde? | Até o topo da meta (`umidade_meta_max`), por regressão log-linear das 3 últimas leituras. É estimativa, por isso usa ponto flutuante; a umidade guardada continua Decimal. Sem 3 leituras ou com umidade subindo, não há previsão. | |
| Q-39 | 5 | Quando os alertas são gerados e como não se repetem? | PONTO_SECAGEM ao gravar a leitura que entra na meta; CAPACIDADE ao passar de 100% do local; DIVERGENCIA_CARGA ao registrar a carga; SECAGEM_LONGA quando o painel é aberto. Cada alerta tem uma chave (tipo + entidade) e não se repete; lido continua guardado. | |
| Q-40 | 5 | Quem lança leituras de secagem? | Quem aponta colheita (APONTADOR) ou lança movimentos. A leitura respeita as fazendas liberadas (RN-04) e só vale para movimento aberto numa etapa que monitora secagem. | |
| Q-41 | 5 | Cor do cartão com mais de um movimento no mesmo local. | Vale a situação mais urgente (atenção > no ponto > em secagem); cada movimento aparece no cartão com a sua situação. | |
