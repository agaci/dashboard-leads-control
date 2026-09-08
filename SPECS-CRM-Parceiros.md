# SPECS — CRM de Parceiros Yourbox

**Versão:** 0.1 (esboço inicial)
**Data:** 2026-09-07
**Base de implementação:** `leads.comgo.pt` (Next.js)
**Estado:** documento vivo — evolui à medida que surgem necessidades
**Implementação:** Fase 1 (MVP) feita em 07/09/2026 — ver `CRM_IMPLEMENTACAO.md`

---

## 1. Contexto e objetivo

A Yourbox recebe cerca de **30 leads por dia**. Aproximadamente **metade não é servível**
pela operação própria nem pelos parceiros de subcontratação atuais: transporte de viaturas,
grandes volumes e pesos, material sujo, radioativo, transporte a temperatura controlada,
mudanças e transportes especiais.

Este CRM tem dois objetivos distintos:

1. **Organizar a subcontratação** — passar consultas a parceiros logísticos de forma
   estruturada, rastreável e com margem controlada.
2. **Monetizar as leads não servíveis** — vender informação qualificada a parceiros
   especializados, sem gerir nem assumir responsabilidade pelo serviço.

O segundo objetivo é receita nova, sem custo operacional e sem risco de execução.

---

## 2. Decisões de arquitetura já tomadas

| Decisão | Escolha | Motivo |
|---|---|---|
| Onde construir | Evoluir `leads.comgo.pt` | Domínio correto, stack moderna, sem tocar no Meteor frágil |
| Papel do Meteor (`yb.comgo.pt`) | Sistema operacional; expõe eventos/webhooks | Legado com 8+ anos, protocolo read-only |
| Base de dados | MongoDB / NodeChef, coleções `crm_*` | Coerente com `yb_dash_*`, sem colisões |
| Canais MVP | WhatsApp + email | Alcance imediato, sem barreira de adesão |
| App móvel | Fase 2, Capacitor | Reaproveita frontend Next.js existente |
| Nomenclatura | Coleções e campos em inglês, labels em português | Consistente com o legado (`driverPrice`, `clientKey`) |

---

## 3. As duas linhas de negócio

O sistema tem de distinguir estruturalmente duas rotas. A triagem é **automática por
categoria**, não por decisão da operadora.

| | **Linha A — Subcontratação** | **Linha B — Venda de lead** |
|---|---|---|
| Yourbox gere o serviço | Sim | Não |
| Responsabilidade | Yourbox | Parceiro |
| Preço | Tabela + margem | Valor da lead (CPL) |
| Fatura ao cliente final | Yourbox | Parceiro |
| Discriminador | `route: 'subcontract'` | `route: 'lead_sale'` |

**Categorias que vão sempre para a Linha B:** transporte de viaturas, mudanças,
ADR/radioativo, temperatura controlada, cargas fora de gabarito, volumes/pesos acima
da capacidade própria e dos parceiros de tabela.

---

## 4. Linha A — modelo de alocação

### 4.1 Princípio: tabela primeiro, spot como exceção

O ciclo comercial é de **minutos** (o cliente está à espera) e a conversão de orçamento
em serviço é **superior a 50%**. Consequência: perguntar preço a um parceiro no momento
da consulta é demasiado lento para ser a regra.

**Nível 1 — Tabela contratada.** Cada parceiro tem matriz de preços por
zona/peso/tipo/urgência. O sistema calcula instantaneamente, aplica margem e a operadora
tem orçamento em segundos. Sem consultar ninguém.

**Nível 2 — Spot.** Apenas o que não cabe em tabela vai a leilão ou cascata real.

**O leilão sobe de nível:** em vez de leiloar cada consulta, leiloam-se as *tabelas*
periodicamente (trimestral). A competição de preço acontece com tempo para negociar,
sem atrasar nenhum serviço.

### 4.2 Estratégias de encaminhamento

A estratégia é **atributo da consulta**, não da plataforma. Motor de políticas com três
estratégias configuráveis:

- **`direct`** — atribuição direta ao parceiro de tabela melhor classificado
- **`cascade`** — sequencial por ranking, 3 min por parceiro, escalona automaticamente
- **`auction`** — janela de 5 a 15 min conforme valor, aviso a 2 min do fecho

Exemplos de política:
- Urgente, cabe em tabela, < €100 → `direct`
- Dedicado agendado, €800 → `auction`
- Cliente sensível (ex.: J&J) → `cascade` restrito a parceiros certificados

### 4.3 Validade das propostas

A bid **não é um número solto** — é objeto com preço, prazo de validade e estado
(`ativa` / `reservada` / `adjudicada` / `expirada`).

Quando o cliente adjudica, o sistema valida se a bid ainda está viva. Se não estiver,
reabre automaticamente em modo rápido apenas aos parceiros que já tinham cotado.

### 4.4 Transparência entre parceiros

Separar duas coisas:
- **Saber que há concorrência** → **sim**. Cria urgência e disciplina o preço.
- **Ver os preços dos outros** → **não**. Leva a alinhamento de preços e, a prazo,
  a preços mais altos para a Yourbox.

Meio-termo: feedback *após* o fecho — *"não ganhou, ficou 14% acima do vencedor"*.

---

## 5. Linha B — venda de leads

### 5.1 Modelos de monetização

| Modelo | Uso | Notas |
|---|---|---|
| **CPL fixo** | Base para volume corrente | Simples, previsível, fatura-se na entrega |
| **Leilão da lead** | Categorias premium | Captura valor real; exige massa crítica |
| **Subscrição** | Escalão superior | Receita recorrente; desconto no CPL |
| **Success fee** | Só contratos de confiança | ❌ Não usar como base — depende de reporte honesto de serviço não controlado |

### 5.2 Grelha de preços de partida

Piso absoluto = **CPL próprio da Yourbox** (Google Ads + atribuição do `yb_dash`).
Abaixo disso, subsidia-se o parceiro.

Teto = **ticket médio × taxa de fecho × margem do parceiro**. Cobra-se 20–35% desse valor.

| Categoria | Preço/lead | Notas |
|---|---|---|
| Volumes/pesos grandes | €8–15 | Volume alto, ticket baixo |
| Transporte de viaturas | €15–25 | Mercado competitivo |
| Mudanças | €15–30 | Ticket alto, fecho razoável |
| Frio / ADR / especiais | €40–100+ | Poucos players; considerar exclusividade |

**Referência de mercado:** plataformas como a Zaask cobram por crédito (~€0,78–€1,30 +IVA
por crédito conforme pacote), com até 5 profissionais a concorrer ao mesmo pedido.
As leads Yourbox são **exclusivas e qualificadas por operadora humana** — lead exclusiva
vale 3 a 5× uma lead partilhada.

### 5.3 Descoberta de preço

Não fixar preços de secretária. Na angariação: **5 leads grátis**, medir resultado real
(fecho, ticket), e só depois negociar preço com dados.

### 5.4 Carteira pré-paga

Parceiro carrega saldo; cada lead debita. Elimina risco de crédito e cobranças, e cria
compromisso com a plataforma. Faturação a 30 dias apenas para parceiros consolidados.

---

## 6. Visibilidade de resultado — triangulação

A Yourbox não controla o serviço na Linha B. A visibilidade obtém-se por **três fontes
independentes**, nenhuma suficiente sozinha.

### 6.1 Trial pago em dados

As 5 leads grátis não são grátis — são pagas em reporte. Cláusula no acordo de adesão:
*"Em troca, reporta o resultado de cada lead — ganhou/perdeu, valor do serviço,
executado sim/não."*

### 6.2 Follow-up ao cliente (fonte principal)

A lead chegou à Yourbox. Follow-up a 48h por SMS/WhatsApp, **uma pergunta, resposta de
um toque**:

1. *"Conseguiu resolver o seu transporte?"* → 👍 Sim / 👎 Não
2. Se sim: *"Como correu? 1 a 5"*

Taxa de resposta esperada 25–40% — suficiente para estatística. Efeito secundário
valioso: mantém a Yourbox presente na relação com o cliente.

### 6.3 Janela de recusa (24h)

O parceiro pode contestar uma lead inválida (contacto errado, duplicado, fora de âmbito)
e recuperar o crédito. Passa a reportar os negativos por interesse próprio — e os
negativos são o que mede a qualidade das leads.

Para os positivos, comprar o dado: *"reporta o valor do serviço fechado e tens 10% de
desconto na próxima lead."*

### 6.4 Sinais de plataforma

Abertura, tempo até ação, contacto revelado. Não diz se fechou, mas diz se **trabalhou**
a lead.

### 6.5 O mecanismo de controlo real

Visibilidade total é impossível e desnecessária. **O que se controla é a torneira de
leads.** Parceiro sem reportes ou com má avaliação desce no ranking e recebe menos.
Parceiro colaborante sobe e acede às categorias premium.

Isto disciplina melhor que qualquer cláusula contratual: o custo é imediato e sentido
no bolso.

---

## 7. Modelo de dados

Prefixo `crm_*`. Respeitar as restrições MongoDB já conhecidas do ambiente legado.

### `crm_partners`
Perfil, NIF, contactos, canais preferidos, `device_tokens[]`, estado
(`prospect` / `trial` / `ativo` / `suspenso`), score, referência à carteira.

### `crm_capabilities`
**A peça mais crítica do sistema.** Uma linha por combinação
`categoria × zona × restrições` (peso máximo, ADR, temperatura, tipo de viatura).
Responde em milissegundos a *"quem pode fazer isto?"*. Sem esta tabela bem desenhada,
o resto não funciona.

### `crm_consultas`
Objeto central. `route: 'subcontract' | 'lead_sale'`, origem (lead/telefone/email),
dados do cliente, categoria, requisitos, estado, `history[]`.

### `crm_dispatches`
Cada envio a um parceiro concreto: canal, timestamps de envio/entrega/abertura, estado.
Registo de auditoria de comunicação e base das métricas de responsividade.

**Chave única `(consulta_id, partner_id, canal)`** — idempotência obrigatória.

### `crm_bids`
Só Linha A. Preço, validade, estado.

### `crm_wallet` + `crm_transactions`
Saldo e movimentos. Cada débito aponta para o dispatch que o originou — torna
faturação e recusas triviais de reconciliar.

### `crm_outcomes`
Resultados das três fontes (parceiro, cliente, plataforma). Alimenta o score.

### Regras invioláveis

1. **Nada muda de estado sem registo.** `history[]` com
   `{estado, timestamp, actor, motivo}` em cada consulta.
2. **Idempotência nos envios.** Um retry de webhook nunca pode gerar duas mensagens
   nem dois débitos.

---

## 8. Máquinas de estado

**Comum:** `nova` → `triada` → bifurca por rota.

**Linha B:**
`qualificada` → `distribuída` → `entregue` → `em_reporte` → `fechada` | `recusada` | `expirada`

**Linha A:**
`em_cotação` → `proposta_enviada` → `adjudicada` → `em_execução` → `concluída`

**Dispatch (paralelo):**
`enviado` → `entregue` → `visto` → `aceite` | `recusado` | `expirado`

---

## 9. Comunicação

### 9.1 Um canal, uma função

| Canal | Função | Latência | Fase |
|---|---|---|---|
| Push / app | Notificação primária | Segundos | 2 |
| WhatsApp | Notificação e interação | Segundos | **MVP** |
| SMS | Escalonamento sem resposta | Segundos | 2 |
| Email | Registo formal, resumos, faturação | Minutos | **MVP** |
| Telefone | Último recurso, manual | — | — |

### 9.2 Escada de escalonamento

`push` → sem leitura em 60s → `WhatsApp` → sem resposta no SLA → `SMS` → alerta à operadora

**Push nunca é canal único para nada com prazo** — é best-effort e falha silenciosamente.

### 9.3 Restrições WhatsApp Business API

- Desde 01-07-2025, cobrança **por mensagem entregue**, não por conversa
- Janela de 24h iniciada pelo utilizador isenta respostas livres e templates de utilidade
- **A partir de 01-10-2026 a Meta passa a cobrar também dentro dessa janela** — a
  poupança da janela de serviço termina
- Templates exigem **pré-aprovação da Meta** — desenhar cedo, não no fim

**Templates iniciais necessários:** nova lead · nova consulta de cotação · adjudicação ·
aviso de saldo baixo

**Modelação de custo:** 15 leads/dia × 5 parceiros ≈ 2.250 mensagens/mês.
A taxas europeias de utilidade, estimativa **€70–200/mês**. Absorvível com CPL de €15,
mas tem de estar na conta.

### 9.4 SLA

| Cenário | SLA |
|---|---|
| Linha B — entrega de lead | Imediata, sem SLA de aceitação |
| Linha B — janela de recusa | 24h |
| Linha A — cascata | 3 min por parceiro; alerta à operadora ao 3.º |
| Linha A — leilão | 5–15 min conforme valor; aviso a 2 min do fecho |
| Follow-up ao cliente | 48h após entrega |

### 9.5 `DispatchService`

Camada única de abstração com adaptadores por canal e interface única:

```
send(partner, template, payload)
```

O CRM **nunca sabe que canal foi usado** — decide-o uma política. Acrescentar SMS ou
trocar de BSP passa a ser um ficheiro novo, não uma refactorização. Registo em
`crm_dispatches` por construção.

---

## 10. App móvel (fase 2)

**Tecnologia recomendada: Capacitor.** Envolve a web app Next.js existente numa casca
nativa, push real via FCM/APNs, um só código para as duas lojas.

Alternativas descartadas:
- *React Native/Expo* — melhor experiência, mas obriga a manter duas frontends
- *PWA pura* — em iOS o push exige adicionar ao ecrã principal; não é fiável

### Porque a app existe (não é pelo push)

- Licitar com preço e validade
- Carregar saldo na carteira
- Gerir as próprias capabilities (zonas, cargas, disponibilidade)
- **Reportar resultados** — a fonte que resolve o problema de visibilidade
- Localização e disponibilidade em tempo real

### Alavanca de adoção

**Desconto no CPL para quem usa a app.** Push é gratuito; WhatsApp passa a ter custo em
outubro. Alinha a poupança da Yourbox com a adoção do parceiro.

### Preparação desde já

Modelo de dados já contempla `device_tokens[]` em `crm_partners` e canal `push` em
`crm_dispatches`. Custo zero agora, evita migração depois.

---

## 11. Conformidade

Passar dados de contacto de clientes a terceiros exige **base legal** (RGPD) refletida na
política de privacidade e nos formulários de origem da lead. Barato de resolver agora,
caro de resolver depois. Validar com apoio jurídico.

---

## 12. Roadmap

### Fase 1 — MVP (Linha B primeiro)
Angariação de parceiros nas categorias em falta · `crm_partners` + `crm_capabilities` ·
triagem automática por categoria · entrega de lead por WhatsApp + email · carteira
pré-paga · janela de recusa 24h · follow-up ao cliente a 48h

**Porquê Linha B primeiro:** receita nova imediata, sem tocar em processos existentes,
e valida a plataforma com risco baixo.

### Fase 2 — Linha A
Tabelas de parceiros · motor de políticas (`direct`/`cascade`/`auction`) · bids com
validade · integração de eventos com o Meteor

### Fase 3 — App e inteligência
App Capacitor + push · scoring de parceiros · leilão de tabelas trimestral · dashboard
de performance

---

## 13. Questões em aberto

- Distribuição das 15 leads/dia não servíveis por categoria
- CPL atual da Yourbox por categoria (extrair do `yb_dash`)
- ~~Stack backend atual do `leads.comgo.pt`~~ — **respondido:** API routes do Next.js 16
  no mesmo processo, MongoDB pelo driver nativo sem Mongoose, autenticação NextAuth sobre
  `dashboardUsers`. WhatsApp pela Evolution API, não pela Business API oficial — o que
  muda a conversa do §9.3. Detalhe em `CRM_IMPLEMENTACAO.md` §4
- Escolha de BSP para WhatsApp (Twilio, 360dialog, outro)
- Modelo de scoring de parceiros — pesos das três fontes
