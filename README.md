# YourBox Dashboard — Leads Control

Plataforma de gestão de leads, bot IA e operações para a YourBox (entregas urgentes B2B/B2C em Portugal).

**App em produção:** https://leads.comgo.pt/dashboard

## Stack

- Next.js 16 (App Router) + TypeScript
- MongoDB (hosted NodeChef, DB `weby`) — driver nativo, sem Mongoose
- Tailwind CSS 4
- Anthropic Claude (bot IA)
- Google Maps (geocodificação + distâncias)
- WhatsApp Business via Evolution API
- Pagamentos: Stripe, Ifthenpay MB Way, Ifthenpay Pay By Link

## Desenvolvimento local

```bash
npm install
cp .env.local.example .env.local  # preencher com credenciais reais
npm run dev
```

## Deploy

Ver `DEPLOY.md` para instruções completas.

```bash
# Push para o servidor
git push origin master:main

# No servidor
git pull && docker compose build --no-cache app && docker compose up -d app
```

## Documentação

| Ficheiro | Conteúdo |
|---|---|
| `CLAUDE.md` | Contexto para Claude Code (sempre carregado) |
| `YOURBOX_CLAUDE_CODE_START.md` | Arquitectura inicial detalhada |
| `ANALISE_ROADMAP.md` | Estado actual + roadmap |
| `DEPLOY.md` | Instruções de deploy e infra |
| `public/manual.html` | Manual de utilizador |

## Módulos principais

- **Inbox** — conversas em tempo real (bot + operador)
- **Leads** — gestão de pedidos de cotação
- **Clientes** — CRM de widget clients
- **Preços** — motor de cálculo + tarifas de parceiros
- **Base IA** — 100+ situações de conhecimento do bot
- **Agregações** — partilha de viatura / análise geográfica
- **Relatórios** — métricas e analytics
- **Widgets** — gestão de embeds para sites externos
