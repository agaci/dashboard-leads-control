# CRM de Parceiros — estado da implementação

> Companhia de `SPECS-CRM-Parceiros.md`. A spec diz o que se quer; este documento diz o
> que está feito, o que ficou de fora e as decisões que foram tomadas por a spec não as
> ter fixado.
>
> Implementado em 07-08/09/2026. Fase 1 (MVP) da spec §12.

---

## 1. O que está feito

Tudo o que a spec põe na **Fase 1 — MVP (Linha B primeiro)**:

| Item da spec §12 | Estado | Onde |
|---|---|---|
| `crm_partners` | feito | `app/api/crm/parceiros/` |
| `crm_capabilities` | feito | `app/api/crm/capacidades/` · `lib/crm/capacidades.ts` |
| Triagem automática por categoria | feito | `lib/crm/categorias.ts` |
| Entrega de lead por WhatsApp + email | feito | `lib/crm/dispatch.ts` |
| Carteira pré-paga | feito | `lib/crm/carteira.ts` |
| Janela de recusa de 24h | feito | `app/api/crm/recusa/` |
| Follow-up ao cliente a 48h | feito | `lib/crm/followup.ts` · cron |
| Angariação de parceiros | é trabalho comercial, não de software | — |

Além do MVP, ficaram feitas peças que a spec põe na fase 2 mas que não fazia sentido
adiar por serem estruturais: a máquina de estados das duas linhas, o `DispatchService`
com política de canal, e o esqueleto de scoring dos parceiros.

**Não está feito** (fase 2 e 3, conforme a spec): tabelas de preço de parceiros, motor
de políticas `direct`/`cascade`/`auction`, bids com validade, `crm_bids`, integração de
eventos com o Meteor, app Capacitor e push, leilão trimestral de tabelas.

---

## 2. Mapa dos ficheiros

### Núcleo puro — sem imports de runtime, testável sem Mongo

| Ficheiro | Responsabilidade |
|---|---|
| `lib/crm/categorias.ts` | catálogo de categorias, regras de reconhecimento e `triar()` |
| `lib/crm/estados.ts` | máquinas de estado das duas linhas e do dispatch |
| `lib/crm/capacidades.ts` | `capacidadeServe()` e a ordem de entrada dos parceiros |
| `lib/crm/score.ts` | `calcularScore()` — a torneira de leads |

Estes três não importam nada em runtime de propósito: é a condição para correrem sob o
`--experimental-strip-types` do `npm test` (a mesma restrição que `lib/conversions/`
já tinha), e é também o que garante que as três decisões mais delicadas do CRM se
exercitam sem base de dados. **51 testes** em `lib/crm/*.test.ts`.

### Com base de dados

| Ficheiro | Responsabilidade |
|---|---|
| `lib/crm/entrada.ts` | a porta de entrada: tria a lead à chegada e abre a consulta |
| `lib/crm/triagem.ts` | `limitesDeTabela()` — o que os parceiros de tabela aceitam hoje |
| `lib/crm/procura.ts` | `procurarParceiros()` — cruza capacidades com o pedido |
| `lib/crm/pagina.ts` | páginas de confirmação para quem clica num link assinado |
| `lib/crm/consultas.ts` | ciclo de vida da consulta; `distribuir()` |
| `lib/crm/carteira.ts` | saldo, débito, estorno, ajuste |
| `lib/crm/dispatch.ts` | `enviar()` com adaptadores por canal |
| `lib/crm/templates.ts` | as cinco mensagens |
| `lib/crm/outcomes.ts` | as três fontes e o score |
| `lib/crm/followup.ts` | varrimento das 48h |
| `lib/crm/config.ts` | `crm_config` |
| `lib/crm/indices.ts` | índices, incluindo os dois únicos que sustentam a idempotência |
| `lib/crm/tokens.ts` | links assinados para quem não tem sessão |

### API

```
GET|POST    /api/crm/parceiros
GET|PUT|DEL /api/crm/parceiros/<id>
GET|POST    /api/crm/parceiros/<id>/carteira
GET|POST    /api/crm/capacidades          GET com ?categoria= simula "quem pode fazer isto?"
PUT|DEL     /api/crm/capacidades/<id>
GET|POST    /api/crm/consultas            POST { leadId } tria uma lead existente
GET|PATCH   /api/crm/consultas/<id>
GET|POST    /api/crm/consultas/<id>/distribuir   GET = pré-visualização, POST = executa
GET|PUT     /api/crm/config
GET|POST    /api/crm/recusa               GET público assinado, POST pela operadora
GET|POST    /api/crm/reporte              idem
GET         /api/crm/followup             público assinado, resposta do cliente
GET|POST    /api/cron/crm-followup        cron
```

### Interface

| Onde | O quê |
|---|---|
| `app/dashboard/crm/page.tsx` | separador **CRM Parceiros**: consultas, parceiros, configuração |
| `app/dashboard/CrmLead.tsx` | o bloco na **ficha da lead** — é aqui que a operadora trabalha |

O bloco na ficha da lead não é conveniência: a operadora vive no separador Leads, e
obrigá-la a ir procurar a consulta correspondente noutro separador era garantir que
ninguém o faria. Aparece só nas leads que a triagem deu como não servíveis.

**Nota sobre as rotas.** `/dashboard/crm` existe como rota do Next mas o componente é
feito para viver dentro do `AppShell`. Visitá-la directamente dá a página sem barra
lateral. Vale para todas as outras (`/dashboard/clientes`, `/dashboard/precos`, ...) —
são ficheiros de componente que o Next também expõe como rota, sem que ninguém o tenha
querido. Por isso os links internos mudam de separador em vez de navegar.

### Onde a lead entra no CRM

```
quiz submete
   ├─→ Meteor (submitDirectLead)      cria a gémea
   └─→ /api/quiz-progress             cria a NOSSA lead  ──→  triarLeadNova()
                                                                 │
                              Linha A ─────────────────────────── segue como sempre
                              Linha B ─────────────────────────── abre consulta 'triada'
```

Corre nos **dois** ramos do `quiz-progress`: quando a lead nasce, e quando uma lead já
existente (registada a partir da inbox) é actualizada no fim do quiz — é aí que ganha o
material e o peso, que é o que a triagem precisa.

Três regras que mandam em `lib/crm/entrada.ts`, e estão lá escritas:

1. **Nunca lança.** Uma falha no CRM não pode fazer perder uma lead.
2. **Nunca distribui.** Só classifica e abre a consulta.
3. **Só a Linha B.** O que a operação serve não gera consulta nenhuma.

E é **esperada**, não lançada em segundo plano: o Next não garante que uma promessa
solta sobreviva ao fim do pedido, e durante uma tarde inteira a triagem simplesmente não
acontecia. Esperar não custa nada — o quiz manda isto por `sendBeacon` e nunca espera
pela resposta.

---

## 3. Decisões tomadas onde a spec não fixava

Cada uma destas é uma escolha, não uma leitura. Estão aqui para poderem ser
contrariadas com conhecimento de causa.

### 3.1 A lead é exclusiva por omissão

A spec diz que "lead exclusiva vale 3 a 5× uma lead partilhada" e contrapõe a Zaask,
que põe cinco profissionais a concorrer ao mesmo pedido. Daí `maxParceirosPorLead: 1`
por omissão, configurável.

### 3.2 A ordem de operações da distribuição: registar, cobrar, enviar

- Registar primeiro dá o `dispatchId` a que o débito se agarra, e é o índice único desse
  registo que trava o segundo envio quando um retry chega.
- Cobrar antes de enviar garante que nenhuma lead sai sem estar paga.
- Se o canal falhar depois do débito, estorna-se — o parceiro nunca paga uma mensagem
  que não recebeu.

O pior caso é o processo morrer entre a cobrança e o envio: fica um dispatch em
`enviado` sem mensagem entregue, visível na consulta e reconciliável pelo extracto. É
preferível a uma mensagem sem registo, que não é reconciliável de todo.

### 3.3 O servidor é MongoDB 3.0 — e isso manda no desenho

Confirmado em 07/09/2026 contra a base de produção: **MongoDB 3.0.11**. Três consequências
que não são opinião:

**Não há transações.** Existem a partir do 4.0 e só em replica set. A atomicidade que
interessa obtém-se de outra maneira:

- **nunca debitar abaixo de zero** — `findOneAndUpdate` com `{ saldo: { $gte: valor } }`
  no filtro; ou o saldo chega no momento da escrita, ou não há débito;
- se o registo da transacção perder a corrida, o saldo é devolvido antes de responder.

**Não há índices parciais** (chegaram no 3.2). E o modo como faltam é o pior possível: o
3.0 **aceita** `partialFilterExpression`, guarda-o na definição do índice, e **ignora-o**.
Fica um índice que parece filtrado, se lê como filtrado, e não filtra nada.

**O `sparse` composto não faz o que parece.** Num índice de vários campos, só ignora o
documento quando faltam *todos* os campos indexados.

O único mecanismo que este servidor honra é **único + sparse sobre um só campo**: o
documento sem esse campo não entra no índice, com o campo a unicidade é imposta, e um
`$unset` liberta a chave. Daí existirem dois campos que de outra forma seriam redundantes:

| Campo | Colecção | Garante |
|---|---|---|
| `chaveDebito` = `<dispatchId>:<tipo>` | `crm_transactions` | um débito e um estorno por envio |
| `chaveViva` = `<consultaId>:<partnerId>:<canal>` | `crm_dispatches` | uma entrega viva por canal |

**Não são redundância — são o mecanismo.** Quem os apagar por parecerem derivados volta a
abrir os dois bugs que estão descritos na secção 7.

### 3.4 Confiança da triagem, e o que ela bloqueia

A triagem devolve `alta`, `media` ou `baixa`. `baixa` acontece quando duas categorias
diferentes dão sinal forte — uma mudança que leva material inflamável, por exemplo. Nesse
caso a distribuição **recusa-se a correr** sem confirmação explícita: não vale a pena
adivinhar quando o erro é mandar carga perigosa para quem não tem certificação.

### 3.5 Pesos do score

Questão em aberto da spec §13. Assumidos e postos em `crm_config` para mudarem sem
deploy: reporte 0.35, recusa 0.25, cliente 0.25, resposta 0.15. Um parceiro sem
histórico fica em 50 — nem prémio nem castigo — para não nascer no fundo da fila e nunca
receber nada.

### 3.6 A chave de idempotência leva o template

A spec §7 fixa a chave em `(consulta_id, partner_id, canal)`. Falta-lhe o **template**, e
sem ele o sistema não consegue mandar duas mensagens diferentes ao mesmo parceiro sobre a
mesma consulta — que é o que a própria spec pede em dois sítios: o aviso de saldo baixo
(§9.3), disparado pela lead que esvaziou a carteira, e, na Linha A, `nova_consulta`
seguida de `adjudicacao`. Com a chave da spec, a segunda mensagem era engolida em
silêncio como se fosse um retry.

### 3.7 Um estado a mais no dispatch

A spec lista `enviado → entregue → visto → aceite | recusado | expirado`. Falta o caso
em que o canal recusa o envio: acrescentou-se `falhado`, que não é o mesmo que
`expirado` (ninguém chegou a receber nada) e sem o qual o débito estornado não teria
onde se apoiar.

### 3.8 Limites de peso e dimensão vêm da tabela real

O que separa uma carga servível de uma lead para vender sai de `partnerTariffs`: o
máximo de `maxWeightPerExpedition` e `maxDimensionCm` entre tarifas activas. Com a
tabela vazia, usa-se o fallback de 250 kg / 300 cm (os limites MRW de
`data/mrw-tariffs.ts`). Carregar uma tabela mais generosa muda a triagem sozinha, sem
tocar em código.

### 3.9 O consentimento é um portão, não uma norma

Sem autorização do cliente registada, `distribuir()` recusa-se a correr — automático ou
manual, com ou sem parceiro elegível. Não é uma regra que alguém possa esquecer-se de
cumprir: é a primeira verificação da função, antes de qualquer verificação comercial.

**Recolhe-se ao telefone, e não é preciso gravar a chamada.** O RGPD exige que se
*demonstre* o consentimento, não que exista áudio — gravar até piora, porque passa a
precisar de consentimento para a própria gravação, com retenção e regras próprias.

O que se demonstra é: quem autorizou, quando, por que via, quem recolheu, **e o texto que
foi lido**. Daí o guião ser fixo e vir do servidor (`GUIAO_CONSENTIMENTO`, em
`app/api/crm/consultas/[id]/consentimento/route.ts`), versionado, e ficar guardado com o
registo. Se cada operadora disser a frase à sua maneira, não há como demonstrar o que a
pessoa ouviu — e é sobre isso que uma reclamação se debruça.

Ao mudar o texto, muda-se a versão: as autorizações antigas continuam a apontar para o
guião que aqueles clientes ouviram.

### 3.10 O quiz diz a categoria, em vez de a deixar adivinhar

As observações de uma lead do quiz são **compostas pela própria aplicação** a partir dos
menus — não há texto livre nenhum. Procurar palavras nesse texto era adivinhar o que já
se sabia.

A variante **7D** (`site_YB/index-quiz-7d.html`) acrescenta ao menu de material cinco
serviços que a operação não faz, e o valor escolhido passa a ser o sinal directo da
categoria (`categoriaDoMaterial()`). O quiz sabe-o no browser, sem perguntar ao servidor.

Corrigiu-se também uma mentira: **"Mais de 30 kg" gravava `40`**. Uma carga de 500 kg
chegava ao servidor como 40 kg, e a triagem nunca podia saber que estava acima dos 250 kg
que os parceiros de tabela aceitam. Passa a pedir o número verdadeiro.

O 7D tem **JS próprio** (`yourbox-quiz-7d.js`). O partilhado serve dez páginas em
produção e o site não está em git — uma variante A/B não pode arriscar as páginas que já
convertem. O custo é a duplicação: uma correcção no partilhado não chega ao 7D sozinha.

### 3.11 Contradição entre fontes: contar, não cobrar

O cliente diz "resolvi, 5/5" numa lead que o parceiro contestou e foi reembolsado. É o
caso que a triangulação da spec §6 existe para apanhar.

Só se pode detectar **depois**: a janela de recusa fecha às 24h e a resposta do cliente
chega às 48h — quando o parceiro contestou, a prova ainda não existia. Não é uma
validação que se possa pôr à entrada.

O sistema sinaliza e **não cobra sozinho**. O cliente pode ter resolvido com outra empresa
qualquer, e uma cobrança automática a partir de uma inferência estraga a relação com um
parceiro honesto por causa de um caso ambíguo. A operadora tem um botão para recobrar.

O que corre automático é a contagem: a recusa contradita pesa **a dobrar** na parcela da
recusa do score. A plataforma acredita à primeira e conta as vezes — quem repete deixa de
receber leads, que é o mecanismo de controlo real da spec §6.5.

### 3.12 Links assinados em vez de portal do parceiro

O parceiro contesta e reporta por HMAC no link (`lib/crm/tokens.ts`), como já se faz no
reengajamento (`lib/contactToken.ts`). Não é autenticação — é a garantia de que o link
não foi fabricado. O que protege a sério é o resto: a recusa só vale dentro das 24h, só
uma vez por envio, e só para o parceiro que recebeu aquela lead. O portal a sério é
fase 3, com a app.

---

## 4. Resposta a uma das questões em aberto da spec §13

> *"Stack backend atual do `leads.comgo.pt` (API routes vs. serviço separado;
> autenticação existente)"*

**API routes do Next.js 16 (App Router), no mesmo processo.** Não há serviço separado.

- Base de dados: MongoDB pelo **driver nativo, sem Mongoose** (`lib/mongodb.ts`), na base
  `weby` — partilhada com o backoffice Meteor. Driver na versão 3.7.
- Autenticação: **NextAuth** com provider de credenciais sobre a colecção
  `dashboardUsers` (`lib/auth.ts`), papéis `administrator` / `Operator` /
  `commissionOperator`. Todas as rotas do CRM exigem sessão, excepto as três públicas
  assinadas e o cron (que usa `CRON_SECRET`).
- Crons: vivem no crontab do host, não em Docker, e batem em `/api/cron/*` com
  `?key=SEGREDO` ou `Bearer`.
- WhatsApp: **Evolution API** já em produção (`lib/whatsapp/evolution.ts`), configurada
  em `routingConfig`. **Não é a WhatsApp Business API oficial** — o que altera a
  conversa sobre BSP e sobre a modelação de custo da spec §9.3; ver secção 6.
- Email: **Resend** (`lib/email/resend.ts`).

As restantes questões da §13 continuam por responder — são de negócio, não de código.

---

## 5. O que é preciso fazer para pôr isto a andar

1. **Ligar o CRM**: separador CRM Parceiros → Configuração → "CRM activo". Nasce
   desligado de propósito; enquanto o estiver, nenhuma lead é entregue nem cobrada.
2. **Confirmar o CPL de cada categoria.** A grelha de partida é a da spec §5.2, mas a
   própria spec diz para não fixar preços de secretária (§5.3) — angariar com 5 leads
   grátis e negociar com dados.
3. **Criar parceiros e declarar capacidades.** Um parceiro sem capacidades nunca aparece
   numa distribuição; o dashboard di-lo em cada ficha.
4. **Carregar saldo** de cada parceiro, ou pô-lo em `trial` para gastar as leads grátis.
5. **Fazer deploy.** O quiz aponta para `leads.comgo.pt` em produção, portanto a
   triagem só corre depois de o código lá estar. Em local o `yourbox-quiz-7d.js` detecta
   o `localhost` sozinho e envia para lá — o mesmo ficheiro serve nos dois sítios sem
   ninguém lhe tocar.
6. **Acrescentar o cron** ao crontab do host, de hora a hora:
   ```
   0 * * * * curl -s "https://leads.comgo.pt/api/cron/crm-followup?key=$CRON_SECRET"
   ```
7. **Definir `CRM_TOKEN_SECRET`** no `.env.local` do servidor. Sem ele os links assinados
   caem para `CONTACT_SECRET` / `CRON_SECRET`, o que funciona mas mistura âmbitos.

---

## 6. Riscos e pontos por resolver

**RGPD (spec §11) — analisado em 07/09/2026 contra os textos legais reais.**

A política de privacidade (`site_YB/politica_de_privacidade.html`, actualizada a
24/06/2026) é séria e detalhada, mas **não cobre a Linha B**. Três lacunas concretas:

| Secção | O que falta |
|---|---|
| §4 Finalidade | nenhuma finalidade cobre "encaminhar o pedido para uma empresa especializada quando não podemos servir" |
| §5 Base legal | nenhuma das quatro bases cobre transmitir o contacto a outra empresa que vai contactar o cliente comercialmente |
| §6 Partilha | descreve subcontratação (Linha A), onde a YourBox continua responsável. Não descreve a venda da lead |

E há uma frase que joga contra, na §6:

> *"Não vendemos nem alugamos os seus dados pessoais a terceiros para fins de marketing."*

A saída jurídica é o "para fins de marketing" — vender uma lead de transporte a uma
transportadora não é marketing. Mas isso é um argumento de advogado; para o cliente que
lê, e para quem analisar uma queixa, aquilo diz "não vendemos os seus dados".

Os Termos e Condições têm uma secção 4, "Serviços Sub-contratados", que cobre a Linha A
— a YourBox continua responsável e o subcontratado cumpre o Manual de Qualidade. Não há
nada equivalente para a Linha B, onde a YourBox sai da relação.

**A base legal que serve é o consentimento**, e tem de ser recolhido no momento em que a
lead nasce, não na política. A "execução de contrato" não cobre — na Linha B a YourBox
explicitamente não presta o serviço. O "interesse legítimo" é fraco: quem pede um
orçamento à YourBox espera que a YourBox responda, não que o número seja passado a outra
empresa, e a monetização torna o teste de balanceamento mais difícil de defender.

**Nota também não coberta:** o parceiro recebe os dados como **responsável autónomo**,
não como subcontratante. Não há contrato de subcontratação a assinar — há uma transmissão
de dados entre responsáveis, e isso tem de ser dito ao cliente.

**Nada disto é software.** É a única coisa que impede pôr o `active: true` em produção com
leads reais. Precisa de validação jurídica, como a própria spec §11 diz.

**WhatsApp.** A app usa a Evolution API, não a Business API oficial. As restrições da
spec §9.3 — cobrança por mensagem entregue, fim da isenção da janela de 24h em Outubro
de 2026, templates pré-aprovados pela Meta — aplicam-se à API oficial. Os cinco
templates estão escritos e isolados em `lib/crm/templates.ts` precisamente para poderem
ser submetidos a aprovação sem mexer no resto, mas a decisão de BSP continua em aberto.

**Idempotência da carteira sem teste automático.** O débito único por envio depende de
dois índices únicos e de uma corrida entre processos. A lógica está escrita para isso e
comentada, mas os testes actuais não a cobrem — precisariam de um Mongo a sério. É o
teste que falta a este código, e foi a sua falta que deixou passar os dois bugs abaixo.

**Dois bugs de índice, encontrados e corrigidos em 07/09/2026.** Ambos tinham a mesma
raiz: assumir capacidades que o MongoDB 3.0 não tem (ver secção 3.3).

1. *O extracto perdia movimentos.* O índice era composto e `sparse` sobre
   `(dispatchId, tipo)`. Como o `tipo` está sempre preenchido, o `sparse` não ignorava
   nada, e todos os carregamentos de saldo de um parceiro colidiam na chave
   `(null, 'carregamento')`. O segundo era rejeitado por chave duplicada e o movimento
   desaparecia — **o saldo ficava certo e o extracto ficava errado**, que numa carteira
   pré-paga é o pior dos dois. A primeira tentativa de correcção (índice parcial) não
   resolveu, porque o 3.0 ignora o filtro em silêncio.

2. *Um envio falhado trancava o canal para sempre.* A chave de idempotência não
   distinguia "já foi entregue" de "tentou e falhou", pelo que a segunda tentativa
   respondia "já tinha recebido esta lead". Resolvido com a `chaveViva`, que se apaga
   quando o envio falha.

**O quiz fala com produção, não com o servidor local.** O `PROGRESS_API` estava fixo em
`https://leads.comgo.pt/api/quiz-progress`. Uma página aberta em local mandava as leads
para produção: elas apareciam no dashboard local (a base de dados é a mesma) mas nunca
passavam pelo servidor local, e nada do que se estava a desenvolver corria. Custou uma
tarde a perceber. O `yourbox-quiz-7d.js` passou a detectar o `localhost` e a decidir
sozinho; trocar o URL à mão para testar era pior, porque ficava trocado.

**A triagem falhava em silêncio.** O erro só ia para a consola do servidor, e uma falha
que só se vê na consola é uma falha invisível. O resultado passa a ser carimbado na
própria lead (`messages.crmTriagem`): basta olhar para ela para saber se a triagem
correu, o que decidiu, e porque não criou consulta. Foi o carimbo que provou, sem
ambiguidade, que o código nunca estava a ser chamado.

**A Evolution API não é alcançável em desenvolvimento.** O `evolutionApiUrl` é
`http://evolution-api:8080` — nome de container, que só resolve dentro da rede Docker do
servidor. Em local o WhatsApp falha sempre. É por isso que existe a escada de canais
(`canaisUtilizaveis`): o email entra quando o WhatsApp não vai, como a spec §9.2 prevê.

**Recusa e re-distribuição.** Uma recusa aceite devolve a consulta a `qualificada`, mas
não a redistribui sozinha. É deliberado no MVP: uma lead recusada por "contacto errado"
não deve ir para o parceiro seguinte sem alguém olhar. Quem recusou nunca mais a recebe —
o direito de contestar do §6.3 não valeria nada se a lead voltasse ao mesmo parceiro
cinco minutos depois.

**Mais três bugs, encontrados a testar em 07/09/2026.** Todos invisíveis sem uso real:

3. *A avaliação do cliente não chegava ao score.* O cliente não sabe a quem a lead foi
   entregue, por isso o resultado dele nasce ligado à consulta e não ao parceiro — mas o
   cálculo procurava `crm_outcomes.find({ partnerId })` e nunca casava. A fonte que a
   spec §6.2 chama principal valia 25% do score no papel e **zero na prática**. Agora
   chega-se lá pelas consultas que o parceiro recebeu, e só nas que ele foi o único
   destinatário. Tem teste de regressão em `lib/crm/score.test.ts`.

4. *Cada clique num link contava como resposta nova.* Os links de reporte e de follow-up
   vivem no WhatsApp e no email de outra pessoa: são reabertos e reencaminhados. Duas
   avaliações do mesmo cliente inflacionavam a média. Resolvido com `chaveUnica` e o
   mesmo índice único e sparse do resto do CRM.

5. *"Não indicou o valor" virava "o serviço valeu zero".* `Number(null)` é 0, e o
   dashboard mostrava `0.00 EUR` num serviço que o parceiro declarou ter fechado —
   afirmar uma coisa falsa a partir da ausência de informação.

**O aviso de saldo baixo não fazia nada.** O campo estava na Configuração, gravava-se, e
nenhum código o lia. Ligado em 07/09/2026. Ao ligá-lo apareceu outra coisa: cada carteira
nascia com `limiteAviso: 25` gravado, que ganhava ao valor da Configuração — o campo do
ecrã não tinha efeito nas carteiras existentes. Agora manda a Configuração.

**O pedido de autorização no fim do quiz não existe.** Decidiu-se que a operadora
pergunta ao telefone — a chamada acontece em minutos de qualquer forma, e uma pergunta
feita por uma pessoa vale mais do que um botão, em confiança e em prova. O cartão no
ecrã de sucesso fica como complemento possível, não como requisito.

Mas o aviso no cartão de confirmação promete *"perguntamos-lhe primeiro"*. **Essa
promessa tem de ser cumprida** — se um dia se deixar de perguntar, o texto tem de mudar
antes. É o mesmo erro do "não partilhamos com terceiros", e não se repete.

**Score sem dados.** O `calcularScore` está escrito e ligado, mas sem histórico devolve
50 para toda a gente. Só começa a ordenar a fila a sério depois de algumas dezenas de
leads entregues e reportadas.
