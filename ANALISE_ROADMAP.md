# Análise e Roadmap — YourBox Dashboard Leads Control

> Documento gerado em Maio 2026. Análise profunda ao código-fonte da aplicação.  
> Última actualização: Maio 2026 (sessões 2-4 com Claude Code).

---

## Contexto

Aplicação Next.js 16 (App Router) + MongoDB + Tailwind CSS 4.  
Objectivo: gerir leads, cálculo de preços, bot IA e conversas para a YourBox — empresa de entregas urgentes B2B/B2C em Portugal.  
Stack: Google Maps, WhatsApp Business (Evolution API), Stripe, Ifthenpay, Resend, Anthropic Claude.

---

## SECÇÃO 1 — Funcionalidades Implementadas

### 1.1 Autenticação e Utilizadores
- NextAuth.js com JWT + Credentials (email/password bcrypt)
- Roles: `administrator`, `Operator`, `commissionOperator`
- Colecção MongoDB: `dashboardUsers`
- **Estado**: Completo

### 1.2 Gestão de Leads
- Tipos: `preLeadSimulation` (sem contacto), `newLead` (com contacto), `clientSimulation`
- Motor de preços: `fixCityPrice` → cálculo → desconto 10% → roteamento AUTO/MANUAL
- Urgência 24h: sem cálculo, directo para contacto manual
- Dashboard: filtros, paginação, busca, auto-select recente
- **Estado**: Completo

### 1.3 Gestão de Conversas / Chat
- 20+ estados (INIT → LEAD_REGISTERED / ESCALATED_TO_HUMAN / CLOSED)
- Fluxo direto (1h/4h): cálculo preço + apresentação + objecção
- Fluxo arrasto (24h): peso + volumes + tarifas parceiro
- Recolha moradas completas + detalhes recolha/entrega
- Escalamento automático (objecção repetida, preço alto, carga limite)
- **Estado**: Completo

### 1.4 Bot / Assistente IA
- 100 situações de conhecimento (`data/yourbox_situacoes_100.json`)
- Matching por regex de sinais de detecção
- Parse morada com LLM (Anthropic Claude SDK)
- Sugestão de agregação em background
- Suporte mensagem pré-preenchida da landing page
- **Estado**: Completo

### 1.10 Melhorias ao Fluxo 24h (Maio 2026)
- **Pré-preenchimento de carga** a partir das observações do formulário: `nVolumes`, `totalCm`, `weightKg` detectados automaticamente — bot salta perguntas já respondidas
- **Bypass LLM para troca de serviço**: se peso pré-preenchido + lead em passo de preço + mensagem "amanhã", o sistema fabrica directamente `{type:'calculate_tomorrow'}` sem chamar o LLM
- **Cargo recap** em toda mensagem de orçamento: `_Carga confirmada: *N caixas* · C+L+A *X cm* · *Y kg*_`
- **Cutoff 16h00**: após as 16h o cabeçalho passa de "Amanhã" para "2 dias úteis" com aviso ⚠️
- **Fim-de-semana**: sábado e domingo → cabeçalho "3ª feira" com nota de recolha na 2ª-feira
- **Estado**: Completo

### 1.11 Configuração do Bot via BD (Maio 2026)
- **Telefone de urgência** (`urgencyPhone`) e **nome do assistente** (`assistantName`) configuráveis no Dashboard sem necessidade de deploy
- `URGENCY_NOTE` construído dinamicamente em cada handler a partir da BD
- UI de configuração em Dashboard → Perfil com preview em tempo real
- **Estado**: Completo

### 1.12 Exibição de Preço por Tipo de Serviço (Maio 2026)
- Corrigido bug em que leads que mudaram de serviço direto → arrasto continuavam a mostrar o preço direto na lista
- Discriminação explícita por `serviceType` em `page.tsx` de Leads, Clientes e Conversas
- **Estado**: Completo

### 1.5 Widgets e Embed
- `widget.html` + `embed.js` — widget autónomo para sites terceiros
- `index-chat-b.html` — landing page com form progressivo + GPS geolocalização
- Config remota: `GET /api/widget-config/[clientId]`
- Admin CRUD de widget clients
- **Estado**: Completo

### 1.6 Pagamentos
- **Stripe**: MB Way via PaymentIntent + webhook `payment_intent.succeeded`
- **Ifthenpay MB Way**: push directo + callback anti-phishing
- **Ifthenpay Pay By Link**: link multi-método (MB Way, Multibanco, Cartão), expira 24h
- Step `AWAITING_PAYMENT` na máquina de estados
- **Estado**: Completo (3 providers)

### 1.7 API Pública / Estatísticas
- `GET /api/v1/stats` — autenticação Bearer, filtro por domínio, resumo por período
- Retorna: leads, conversas, byServiceType, valores, médias
- CORS configurado
- **Estado**: Completo

### 1.8 Dashboard e UI
- 9 abas: Inbox, Leads, Clientes, Serviços, Preços, Base IA, Agregações, Relatórios, Widgets
- Real-time polling + notificações (escalamento, novas leads, hints agregação)
- Controlo de som (3 tipos) + controlo de voz TTS
- Design tokens: CYAN `#00bcd4`, NAVY `#1a2332`, YB_GREEN `#bed62f`
- **Estado**: Funcional

### 1.9 Infraestrutura
- Next.js 16 App Router + MongoDB nativo + Tailwind CSS 4
- Integrações: Google Maps, WhatsApp Business (Evolution — infra pronta), Stripe, Ifthenpay, Resend, Anthropic
- `routingConfig` com ~15 parâmetros (horas auto, markup, pagamento, recolha moradas, etc.)
- Deploy: Docker + NodeChef
- **Estado**: Stack sólido

---

## SECÇÃO 2 — Funcionalidades Sugeridas para o Futuro

| # | Funcionalidade | Complexidade | Impacto | Prioridade |
|---|---|---|---|---|
| 1 | WhatsApp Webhook (completar Evolution) | Média | Alto | **Alta** |
| 2 | Rastreamento Tempo Real do Serviço | Média | Alto | **Alta** |
| 3 | Testes Automatizados (motor preços + fluxos bot) | Média | Alto | **Alta** |
| 4 | Add-ons de Serviço (embalagem, seguro, SMS premium) | Média | Alto (+20% margem/lead) | **Alta** |
| 5 | Custom Pricing Rules (contratos B2B, promoções) | Média | Alto | **Alta** |
| 6 | Driver App Mobile (serviços, GPS, foto entrega) | Alta | Alto (escala ops) | **Alta** |
| 7 | IA Margens Dinâmicas (desconto mínimo para fechar) | Alta | Alto | Média |
| 8 | Reputação de Cliente + Desconto Automático | Baixa | Médio | Média |
| 9 | Leilão Dinâmico de Leads entre parceiros | Alta | Alto | Média |
| 10 | Bot com Visão (foto encomenda → peso/dimensões) | Média | Médio | Média |
| 11 | Integração Contabilidade (Moloni, fatura automática) | Média-Alta | Médio | Média |
| 12 | Programa de Referência (códigos, créditos) | Baixa | Médio | Média |
| 13 | Histórico Conversas Full-Text Search | Baixa | Médio | Baixa |
| 14 | Feedback Pós-Entrega (rating + reclamações) | Baixa | Médio | Baixa |
| 15 | Analytics Avançado (cohort, churn prediction) | Alta | Alto | Baixa |
| 16 | Internacionalização PT/EN/ES | Média | Médio | Baixa |
| 17 | API Docs Pública (Swagger/OpenAPI) | Baixa | Médio | Baixa |
| 18 | SSO Google/Azure para BO | Baixa | Baixo | Baixa |
| 19 | Status Page Pública | Baixa | Baixo | Baixa |
| 20 | Middleware sync Meteor ↔ Next.js | Média | Médio | Baixa |

---

## Roadmap Sugerido

### Q3 2025 — Fundação operacional
- WhatsApp webhook (70% infra já existe — só falta activar)
- Testes automatizados no motor de preços
- Add-ons de serviço (margem imediata)

### Q4 2025 — Crescimento de receita
- Custom Pricing Rules (contratos B2B)
- Rastreamento em tempo real
- Feedback pós-entrega

### Q1 2026 — Escala operacional
- Driver App Mobile
- IA de margens dinâmicas

### Q2 2026 — Compliance e expansão
- Integração contabilidade (Moloni)
- Internacionalização EN/ES

---

*Análise realizada sobre o código-fonte completo da aplicação em Maio 2026.*
