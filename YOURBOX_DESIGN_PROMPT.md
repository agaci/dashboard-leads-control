# Prompt — YourBox Dashboard · Design System (Cores Reais da Plataforma)

Vou partilhar imagens de mockup e um screenshot da plataforma real YourBox.
Constrói o layout completo em Next.js 14 com Tailwind CSS, fiel ao design das imagens.
Esta fase é **apenas design e layout** — sem lógica de negócio, sem MongoDB, sem API. Dados todos em mock.

---

## Tokens de cor — extraídos da plataforma real YourBox

```css
/* Primárias */
--yb-navy:       #1a2332   /* nav fundo, painel direito fundo */
--yb-cyan:       #00bcd4   /* accent principal, botões, links, item activo */
--yb-yellow:     #ffc107   /* alertas, badges, dots não lidos, avisos */

/* Superfícies */
--yb-bg-page:    #f5f6fa   /* fundo geral, sidebar */
--yb-bg-card:    #ffffff   /* cards, lead items, chat */
--yb-border:     #dde1e8   /* bordas gerais */

/* Texto */
--yb-text-dark:  #1a2332   /* texto principal */
--yb-text-mid:   #666666   /* labels, subtítulos */
--yb-text-muted: #aaaaaa   /* timestamps, hints */

/* No painel escuro (fundo #1a2332) */
--yb-panel-text:       #ffffff
--yb-panel-muted:      rgba(255,255,255,0.45)
--yb-panel-border:     rgba(255,255,255,0.08)
--yb-panel-surface:    rgba(255,255,255,0.04)
--yb-panel-cyan-bg:    rgba(0,188,212,0.12)
--yb-panel-cyan-bdr:   rgba(0,188,212,0.35)

/* Tags / badges */
--tag-bot:     bg #e3f2fd  text #1565c0
--tag-auto:    bg #e8f5e9  text #2e7d32
--tag-manual:  bg #fff8e1  text #e65100
--tag-urgente: bg #ffebee  text #c62828
--tag-novo:    bg #e0f7fa  text #006064
--tag-perdido: bg #f5f5f5  text #757575
```

---

## Tailwind config — adicionar ao `tailwind.config.ts`

```typescript
colors: {
  yb: {
    navy:   '#1a2332',
    cyan:   '#00bcd4',
    yellow: '#ffc107',
    bg:     '#f5f6fa',
    border: '#dde1e8',
  }
}
```

---

## Layout — grid 4 colunas, altura 100vh

```
┌──────┬──────────────┬──────────────────┬─────────────┐
│  82px│    276px     │      flex 1      │    260px    │
│  Nav │  Lista leads │      Chat        │   Painel    │
│ navy │   branco     │   branco/cinza   │    navy     │
└──────┴──────────────┴──────────────────┴─────────────┘
```

Sem scroll exterior. Cada coluna gere o seu próprio scroll interno.

---

## Coluna 1 — Navegação (82px) — fundo `#1a2332`

**Logo** — topo, pill com texto "YourBox", fundo `#00bcd4`, texto branco bold, `border-radius: 6px`, `font-size: 11px`, `letter-spacing: 1px`, `padding: 5px 8px`

**Cada item de menu:**
- `width: 72px`, `flex-direction: column`, `align-items: center`, `gap: 4px`
- `padding: 8px 4px`, `border-radius: 8px`
- Ícone SVG 17×17px + label 10px 600
- **Inactivo:** `color: rgba(255,255,255,0.4)`
- **Hover:** `background: rgba(255,255,255,0.06)`, `color: rgba(255,255,255,0.75)`
- **Activo:** `background: #00bcd4`, `color: #fff`

**Badge Inbox:** círculo 15px, `background: #ffc107`, `color: #1a2332`, 9px 800, posição absolute top-right

**Contadores no fundo da nav** (como na plataforma real — "41 | 53"):
- Dois pills lado a lado
- Cyan: `background: #00bcd4`, `color: #fff` → count de leads activas
- Amarelo: `background: #ffc107`, `color: #1a2332` → count de alertas

**Itens do menu:**
1. Leads *(activo)*
2. Inbox *(badge amarelo com "7")*
3. Clientes
4. Serviços
5. Preços
6. Base IA
7. `<divider>` — `width: 38px; height: 1px; background: rgba(255,255,255,0.08)`
8. Relatórios
9. `flex: 1` spacer
10. Contadores (41 cyan | 53 amarelo)
11. `<divider>`
12. Perfil
13. Config

---

## Coluna 2 — Lista de leads (276px) — fundo `#f5f6fa`

**Border-right:** `1px solid #dde1e8`

### Header (fundo `#fff`)
- Título "Leads" — 15px 700 `#1a2332`
- Campo pesquisa — 32px, fundo `#f5f6fa`, `border: 1px solid #dde1e8`, `border-radius: 6px`

### Filtros em pills (fundo `#fff`)
- Pills: Todas · Bot · Manual · Urgente
- **Inactiva:** branco, `border: 1px solid #dde1e8`, `color: #666`, `border-radius: 4px`
- **Activa:** `background: #00bcd4`, `color: #fff`, `border-color: #00bcd4`

### Lead items
`padding: 10px 12px`, `background: #fff`, `border-bottom: 1px solid #e8eaf0`, `margin-bottom: 2px`

- **Hover:** `background: #f0f8ff`
- **Activo:** `border-left: 3px solid #00bcd4`, nome com `color: #007a8a`

```
Linha 1: [nome 13px 600 #1a2332]           [tempo 11px #aaa]
Linha 2: [rota 11px #666 truncada]          [preço 12px 700 #00bcd4]
Linha 3: [badge] [badge]     [dot 8px #ffc107 se não lido — à direita]
```

**6 leads mock:**

| Nome | Rota | Preço | Badges | Não lido |
|---|---|---|---|---|
| Carlos Mendes *(activo)* | Lisboa → Setúbal | 28–45€ | Bot, 1h | sim |
| Ana Ferreira | Porto → Braga | 14–22€ | Auto, Novo | não |
| Rui Costa | Évora → Cacém | A calcular | Manual, 24h | não |
| Farmácia Central | Almada → Seixal | 15€ | Bot, Urgente | sim |
| Logística XL Lda | Lisboa → Madrid | Orçamento | Manual | não |
| Maria Santos | Cascais → Sintra | 18–28€ | Sem resposta | não |

---

## Coluna 3 — Chat (flex 1)

**Corpo:** `background: #f5f6fa`
**Header e input:** `background: #fff`

### Header
`padding: 12px 16px`, `border-bottom: 1px solid #dde1e8`
- Avatar circular 36px — `background: #00bcd4`, iniciais brancas "CM" 700
- Nome: 13px 700 `#1a2332`
- Indicador online: dot verde 6px + "WhatsApp · Lisboa → Setúbal · há 2 min" 11px `#888`
- Botões:
  - "Transferir" — `background: #fff8e1`, `color: #e65100`, `border: 1px solid #ffe082`
  - "Ligar" — `background: #00bcd4`, `color: #fff`
  - "Fechar" — `background: #ffebee`, `color: #c62828`, `border: 1px solid #ffcdd2`

### Mensagens

**Sistema** (centrada):
`background: #fff`, `border: 1px solid #dde1e8`, `border-radius: 20px`, 11px `#aaa`

**Lead** (esquerda, max-width 78%):
`background: #fff`, `border: 1px solid #dde1e8`, `border-radius: 2px 8px 8px 8px`, 12px `#1a2332`

**Bot escuro** (direita):
- Sender: "YOURBOX BOT" 10px 700 `#00bcd4`
- Bubble: `background: #1a2332`, `color: #fff`, `border-radius: 8px 2px 8px 8px`

**Bot cyan** (direita, confirmações positivas):
- Bubble: `background: #00bcd4`, `color: #fff`, `border-radius: 8px 2px 8px 8px`

**Conversa mock — Carlos Mendes:**
```
[SISTEMA] Lead entrou via formulário web — 18:42

[LEAD]      Boa tarde, preciso de um transporte urgente de Lisboa para Setúbal
            o mais rápido possível   18:42

[BOT dark]  Boa tarde! Para calcular o melhor preço preciso de 2 dados:
            1. Qual o peso total da carga?
            2. Quais as dimensões (cm)?   18:42

[LEAD]      São 3 caixas, umas 15kg, cada uma 40×30×30cm   18:43

[BOT dark]  Perfeito. Tenho duas opções:
            A — Viatura dedicada já → 45€
            B — Partilhada às 16h30 → 28€
            Qual prefere?   18:43

[LEAD]      A opção B serve, tenho flexibilidade   18:44

[BOT cyan]  Excelente escolha. A aguardar confirmação da logística —
            resposta em menos de 1 minuto.   18:44

[SISTEMA]   BO notificado · a aguardar confirmação de agregação
```

### Input
- Textarea: fundo `#f5f6fa`, `border: 1px solid #dde1e8`, placeholder "Escrever como BO..."
- Botão enviar: `background: #00bcd4`, ícone seta branca, `border-radius: 6px`
- Hint: "O BO pode intervir a qualquer momento" — 10px `#bbb`, centrado

---

## Coluna 4 — Painel de contexto (260px) — fundo `#1a2332`

**Border-left:** `1px solid rgba(255,255,255,0.08)`
Secções com `border-bottom: 1px solid rgba(255,255,255,0.08)`

**Título de secção:** 10px 700 `rgba(255,255,255,0.4)`, uppercase, `letter-spacing: 0.07em`

### Preço calculado
Card (`background: #00bcd4`, `border-radius: 8px`):
- Label: 10px `rgba(255,255,255,0.8)` 600
- Preço "28€": 24px 800 `#fff`
- Sub: 11px `rgba(255,255,255,0.8)`

Row alt (`background: rgba(255,255,255,0.06)`, `border-radius: 6px`):
- Label `rgba(255,255,255,0.5)` / valor `#fff` 700

Rows (label `rgba(255,255,255,0.45)` / valor `#fff` 600):
- Urgência em `#ffc107`

### Dados da lead
- Telefone e Origem em `#00bcd4`
- Restantes em `#fff`

### Situação activa
Card (`background: rgba(0,188,212,0.12)`, `border: 1px solid rgba(0,188,212,0.35)`):
- ID "SIT-002": 10px 800 `#00bcd4`
- Nome: 12px 600 `#fff`

Botões:
- "Ver SIT ↗": `background: #00bcd4`, `color: #fff`
- "Escalar BO": `background: rgba(255,82,82,0.15)`, `color: #ff8a80`

### Roteamento
Rows (`background: rgba(255,255,255,0.04)`, `border-radius: 6px`):
- On: `#00bcd4` · Off: `rgba(255,255,255,0.25)`

### Últimas leads do bot
Mini-cards escuros:
- Nome `#fff` · sub `rgba(255,255,255,0.4)` · preço `#ffc107` 800

---

## Estrutura de componentes

```
src/
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx
│   │   └── NavSidebar.tsx
│   ├── leads/
│   │   ├── LeadList.tsx
│   │   ├── LeadItem.tsx
│   │   └── LeadFilters.tsx
│   ├── chat/
│   │   ├── ChatPanel.tsx
│   │   ├── ChatHeader.tsx
│   │   ├── ChatBody.tsx
│   │   ├── ChatMessage.tsx      ← variantes: lead | bot-dark | bot-cyan | system
│   │   └── ChatInput.tsx
│   └── panel/
│       ├── ContextPanel.tsx
│       ├── PriceCard.tsx
│       ├── LeadData.tsx
│       ├── SituacaoCard.tsx
│       ├── RoutingConfig.tsx
│       └── BotLeadMini.tsx
├── data/
│   └── mockLeads.ts
└── app/
    └── page.tsx
```

---

## Notas

- **Apenas design** — mock data, sem API, sem MongoDB
- **Tailwind + tokens** — cores no `tailwind.config.ts`, sem CSS modules
- **Desktop first** — ≥ 1280px, mobile na próxima fase
- **Interactividade mínima** — clicar num lead activa-o; pills clicáveis
- **Referência visual** — screenshot da plataforma real YourBox + mockups em anexo

---

*Cores dominantes extraídas da plataforma real: navy `#1a2332` · cyan `#00bcd4` · yellow `#ffc107`*
