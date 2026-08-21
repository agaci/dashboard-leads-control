# Portal do parceiro de widget e comissões — estudo

Estudo da ligação entre uma lead angariada por widget, o cliente YourBox que ela origina,
a facturação desse cliente e a comissão a pagar ao parceiro. Levantamento feito sobre a
base de dados de produção (`weby`) em 21/08/2026, em leitura apenas.

## 1. A YourBox já tem um sistema de comissões a funcionar

Não é preciso inventar nada — só ligar-lhe o widget.

| Peça | Onde | Estado |
|---|---|---|
| Comissionista atribuído ao **cliente** | `users.profile.commissionUser` (nome, texto) | 626 clientes atribuídos |
| Comissionista copiado para cada **serviço** | `services` / `servicesHistory` → `parameters.commissionUser` | 11.159 serviços; 5.091 só em 2026 |
| Percentagem base | `serverSettings.commissionPercentage` = **0,05** (5%) | activo |
| Nível do comissionista | `users.profile.commissionLevel` (100) | activo |
| Fecho mensal | `commissionsUsers` — `{month, year, [{commissionUser, clientName, totalCommission}]}` | último fecho guardado: 02/2024 |
| Ecrã de comissões | `appConfig.config.comissoes.CommissionOperator = true` | role `CommissionOperator` na plataforma antiga |

Comissionistas actuais: Ana Faustino, Márcia Romão, Raquel Rodrigues (e Luis Baltazar no
histórico). Exemplo verificado: o cliente *Guilherme Pereira R. Vargas* tem
`profile.commissionUser: "Ana Faustino"`, e todos os seus serviços saem com esse nome em
`parameters.commissionUser`.

**Consequência central:** basta escrever o nome do parceiro em `users.profile.commissionUser`
do cliente angariado para que toda a maquinaria existente passe a atribuir-lhe os serviços
— incluindo os recorrentes, sem mais intervenção.

### Por confirmar com o BO
A base de cálculo dos 5%. `servicesHistory` tem `price` (valor ao cliente) e `priceWeby`,
mas `priceWeby` nem sempre é menor que `price` (visto: `price` 47,60 com `priceWeby` 277,90),
por isso não é seguro assumir que a comissão incide sobre a margem. Não foi possível
reproduzir os fechos de 2023/2024 porque os serviços desses meses já não estão em
`servicesHistory` (só há histórico recente; o antigo foi para `servicesHistory_crono_backup`).

## 2. A cadeia hoje, e onde está partida

```
widget  --widgetClientId-->  conversa  -->  lead (messages)      [FEITO em 20/08/2026]
lead  --confirm-client-->  cliente CRM (clients)                  [existe]
cliente CRM  <--clientMatch--  services (por telefone/email)      [existe, sugestão]
                                    |
                                    +--> users._id do cliente     [NÃO é guardado]
users.profile.commissionUser = parceiro                           [FALTA]
```

O que existe:
- `lib/reconcile/matchClients.ts` (cron ~10 min) liga serviços reais a conversas por
  telemóvel/email com score, e escreve a sugestão `clientMatch` na conversa. Nunca converte
  sozinho;
- `app/api/conversations/[id]/confirm-client/route.ts` — o operador confirma: cria a lead,
  cria/liga o cliente no CRM local (`clients`) e guarda `clientMatch.serviceNr`;
- desde 20/08/2026, o `widgetClientId` também é copiado para a ficha do cliente CRM.

O que falta:
1. **`clientMatch` não guarda o `services.client`** (o `_id` do user YourBox), só o `serviceNr`.
   Sem esse id não se consegue somar os serviços futuros do cliente nem escrever o
   comissionista no user;
2. **nada escreve `users.profile.commissionUser`** — hoje é preenchido à mão na plataforma antiga;
3. **não há comunicação nenhuma quando uma lead passa a cliente.** As notificações
   (`lib/notifications/dispatch.ts`) cobrem apenas `conversation`, `escalation` e `lead`, e vão
   só para a equipa YourBox por WhatsApp/email. Não há evento "lead convertida", nem para
   dentro nem para o parceiro.

## 3. Portal do parceiro — é viável, e metade já existe

`/api/v1/stats` já serve dados por parceiro autenticados com o `secretToken` de
`widgetClients` (Bearer). Falta a página que os mostra e a camada de comissões.

Proposta: rota pública `/parceiro` (fora de `/dashboard`, sem NextAuth), autenticada pelo
mesmo `secretToken` — link directo `/parceiro?t=<token>` guardado em cookie httpOnly. Sem
criar utilizadores nem passwords novas; revogar é regenerar o token, botão que já existe.

Conteúdo, do mais sólido ao mais dependente de decisões:

| Bloco | Fonte | Depende de |
|---|---|---|
| Leads do mês, totais e valor orçamentado | `messages.widgetClientId` (carimbo) | nada — já disponível |
| Estado de cada lead (em curso / registada / convertida) | `messages` + `clients` | nada |
| Clientes angariados | `clients.widgetClientId` | nada |
| Serviços facturados por esses clientes | `servicesHistory` via id do user | ponto 2.1 |
| Comissão estimada e fecho mensal | `commissionPercentage` × base | base de cálculo (1) |

### Privacidade
As leads contêm nome, telemóvel e email de terceiros. O parceiro é uma entidade distinta da
YourBox, por isso o portal deve mostrar-lhe **contagens, rotas e valores**, não os contactos
completos — a menos que exista contrato e base legal para essa partilha. Nota: a
`/api/v1/stats` actual já devolve nome, telefone e email ao parceiro; convém rever.

## 3a. O que a plataforma antiga já resolve sozinha

Para **pagar** a comissão basta que, ao inscrever o cliente na YourBox, se preencha o
comissionista. Toda a maquinaria de cálculo é de lá. O que esta plataforma acrescenta:

1. **a origem da lead** — a YourBox não tem como saber que um cliente novo veio do widget
   de um parceiro; essa informação só existe aqui, no carimbo `widgetClientId`;
2. **não depender de memória** — a atribuição é escrita com o nome exacto da configuração,
   evitando variantes de escrita que dividiriam as somas em silêncio;
3. **o caso em que ninguém soube** — se alguém usa o widget e semanas depois se regista
   sozinho na YourBox, o reconciliador liga as pontas por telemóvel/email;
4. **o portal do parceiro**, que precisa do funil completo: metade dos dados só existe deste
   lado.

Desligar é simples: sem `commissionUserName` no widget, a atribuição automática não acontece
e fica apenas a leitura.

## 3b. Decisões tomadas (21/08/2026) e o que já está feito

Decidido: o parceiro do widget é inscrito na plataforma YourBox como utilizador e
comissionista. Os clientes que ele angaria ficam com `profile.commissionUser` = nome do
parceiro, e a plataforma trata do cálculo. Este dashboard **lê** os dados — não recalcula.

Nota de arquitectura: esta aplicação **já está ligada à base da YourBox**. O
`MONGODB_URI` aponta para `db-weby-5204.nodechef.com/weby`, a mesma base onde vivem
`services`, `servicesHistory`, `users` e `commissionsUsers`. Não é preciso ligação nova
nem sincronização; o que faltava era a chave de identidade, não o acesso.

Implementado:

| Peça | Onde |
|---|---|
| `commissionUserName` / `commissionUserId` / `commissionPercentage` por widget | `widgetClients`, editável no gestor de widgets |
| Procura de utilizadores YourBox para ligar o comissionista | `GET /api/admin/yourbox-users?q=` (só administradores) |
| `clientUserId` (o `users._id`) guardado na reconciliação | `lib/reconcile/matchClients.ts` |
| `yourboxUserId` propagado à ficha do cliente e à lead | `confirm-client` |
| Atribuição de `users.profile.commissionUser` ao confirmar o cliente | `confirm-client`, com auditoria em `widgetCommissionLog` |
| Serviços facturados e comissão por parceiro | `GET /api/admin/widget-clients/stats` lê `servicesHistory` |

Salvaguardas da escrita em `users`: só acontece com comissionista configurado no widget,
só quando o utilizador ainda **não** tem comissionista (nunca sobrepõe uma atribuição
existente, humana ou não), e cada atribuição fica registada em `widgetCommissionLog` com
lead, conversa, cliente e data.

## 4. Ordem de trabalhos proposta

1. ~~Guardar o `services.client` no `clientMatch`~~ — feito.
2. ~~Ligação widget ↔ comissionista e leitura de `servicesHistory`~~ — feito.
3. ~~Portal `/parceiro`~~ — feito. Página autenticada pelo `secretToken` do widget
   (`/parceiro?t=<token>`, botão "Link do portal" no gestor de widgets; o token fica no
   browser do parceiro e revoga-se com "Regenerar"). Mostra o funil do mês (orçamentos
   iniciados, pedidos completos, valor orçamentado, clientes angariados), a comissão do
   mês e a lista de pedidos. **Sem dados pessoais** — decisão de 21/08/2026, que também
   retirou nome, telemóvel e email da resposta de `/api/v1/stats`.
4. **Evento "lead convertida"** em `dispatchNotification` — hoje inexistente.
5. **Fecho mensal** — decidir se o parceiro entra em `commissionsUsers` (o fecho da YourBox,
   parado desde 02/2024) ou se tem fecho próprio deste lado.

### Riscos conhecidos
- **A chave é um nome, não um id.** `parameters.commissionUser` é texto livre. Já há prova de
  fragilidade: o histórico tem serviços com "Nuno Albuquerque", nome que já não existe em
  nenhum `users.profile.commissionUser`. Por isso guardamos também o `commissionUserId`; o
  nome serve para ler `servicesHistory`, o id para validar a ligação.
- **Nomes de parceiro têm de ser únicos** na plataforma. Dois comissionistas com o mesmo nome
  tornam as somas indistinguíveis.
- **A percentagem daqui é indicativa.** Quem calcula a comissão a pagar é a YourBox; o valor
  mostrado no dashboard é `price` × percentagem e serve para conferência.
