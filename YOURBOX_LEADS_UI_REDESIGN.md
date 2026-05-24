# YourBox Leads Dashboard — Especificação de Redesign UI

**Versão:** 1.0  
**Data:** Maio 2026  
**Âmbito:** Redesign visual e UX do dashboard `leads.comgo.pt` — sem alterações à lógica de negócio, status, fluxos de dados ou API.

---

## 1. Contexto e Princípios

### O que NÃO muda
- Toda a lógica de negócio (routing AUTO/MANUAL, janelas horárias, cálculo de preço)
- Os status existentes e as transições entre eles
- O fluxo entrada → lead → cliente
- As coleções MongoDB e os campos dos documentos
- As permissões e autenticação NextAuth
- Os endpoints de API

### O que muda
- Visual: nova paleta, tipografia, densidade, dark mode
- Layout: estrutura de 3 colunas (inbox-style) em vez de estrutura atual
- Componentes: cards, badges, inputs, modais — todos redesenhados
- Micro-interações: hover states, loading states, transições

### Filosofia de design
O modelo de referência é **Crisp Chat** adaptado ao contexto de logistics BO:
- Coluna esquerda: lista de entradas/leads com filtros rápidos
- Coluna central: detalhe da entrada/lead selecionada (dados + ações)
- Coluna direita: painel contextual (preço calculado, histórico, configurações)

---

## 2. Sistema de Status — Mapeamento Completo

> ⚠️ Estes status e transições são imutáveis. O redesign apenas altera a apresentação visual.

### Entidades e seu ciclo de vida

```
ENTRADA (mensagem/simulação anónima)
   │
   ├── sem contacto → permanece como entrada (fase 1 do formulário)
   │
   └── com contacto (nome + email/tel) → promovida a LEAD
          │
          ├── status: "nova"          → lead acabou de entrar, não vista
          ├── status: "em análise"    → BO está a trabalhar
          ├── status: "proposta"      → preço enviado ao cliente
          ├── status: "aguarda"       → aguarda decisão/pagamento cliente
          ├── status: "convertida"    → tornou-se cliente / serviço criado
          └── status: "perdida"       → não avançou
                 │
                 └── CLIENTE (serviço inserido na plataforma Yourbox)
```

### Routing (campo separado do status)
| Valor | Descrição | Cor |
|-------|-----------|-----|
| `AUTO` | Sistema calculou e criou automaticamente | Cyan `#00bcd4` |
| `MANUAL` | BO tem de qualificar e contactar | Amarelo `#ffc107` |

### Urgência (campo do pedido)
| Valor | Badge |
|-------|-------|
| `1 Hora` | Vermelho urgente |
| `4 Horas` | Laranja |
| `24 Horas` | Cinzento → força MANUAL |

---

## 3. Paleta de Cores

```css
/* Cores base */
--navy-900: #0F1B2D;     /* fundo principal */
--navy-800: #162236;     /* sidebar, cards */
--navy-700: #1E3050;     /* hover states, separadores */
--navy-600: #243a60;     /* bordas activas */

/* Acentos */
--cyan:     #00bcd4;     /* AUTO, ações primárias, links */
--cyan-dim: rgba(0,188,212,0.12);
--yellow:   #ffc107;     /* MANUAL, avisos */
--yellow-dim: rgba(255,193,7,0.12);

/* Semânticas */
--success:  #10b981;     /* convertida, pago */
--danger:   #ef4444;     /* perdida, urgente */
--warning:  #f59e0b;     /* aguarda, 4h */
--muted:    #8B9EC9;     /* texto secundário */

/* Texto */
--text-1: #F0F4FF;       /* primário */
--text-2: #8B9EC9;       /* secundário */
--text-3: #4a6080;       /* placeholder, hint */

/* Bordas */
--border: rgba(255,255,255,0.07);
--border-active: rgba(0,188,212,0.35);
```

### Tipografia
- **Font:** Inter (já carregada na app)
- **Weights usados:** 400 regular, 500 medium, 600 semibold
- **Sizes:** 11px (meta), 12px (labels), 13px (corpo), 14px (detalhe), 16px (títulos secção), 20px (headings)

---

## 4. Layout Global

### Estrutura de 3 colunas (viewport ≥ 1024px)

```
┌──────────┬──────────────────────────┬─────────────────────┐
│ Sidebar  │   Lista de Leads         │   Painel Detalhe    │
│  (60px)  │   (320px fixo)           │   (flex restante)   │
│          │                          │                     │
│  nav     │  [filtros rápidos]       │  [dados do lead]    │
│  icons   │  [search]                │  [conversa]         │
│          │  [card] [card] [card]... │  [ações]            │
│          │                          │  [preço calculado]  │
└──────────┴──────────────────────────┴─────────────────────┘
```

### Mobile (< 768px)
- Apenas a lista é visível por defeito
- Toque num card → abre o detalhe em full screen (slide-in)
- Botão "← Voltar" no topo do detalhe

### Tablet (768px–1023px)
- Sidebar + Lista (sem coluna direita)
- Toque num card → drawer lateral com detalhe (overlay)

---

## 5. Componentes de Layout

### 5.1 Sidebar (60px)

Ícones verticais, sem texto. Estado ativo com destaque cyan.

```
┌──────┐
│  YB  │  ← logo mark
├──────┤
│  ≡   │  ← Dashboard / Entradas (ativo)
│  👤  │  ← Leads
│  ✓   │  ← Convertidos / Clientes
│  ⚙   │  ← Configurações routing
├──────┤
│  🔔  │  ← Notificações (com badge de contagem)
│  ?   │  ← Ajuda
└──────┘
```

Itens da sidebar (rotas existentes na app, manter as mesmas):
- `/dashboard` — Entradas & Leads (vista principal)
- `/leads` — Leads qualificadas
- `/clientes` — Convertidos
- `/settings` — Configurações de routing e sistema

### 5.2 Coluna Lista (320px)

**Header da coluna:**
```
[Entradas  Leads  Clientes]    ← tabs de contexto (manter lógica atual)
[🔍 Pesquisar...]
[Filtros: AUTO | MANUAL | Urgente | Hoje | ▼ Mais]
```

**Card de entrada/lead:**
```
┌─────────────────────────────────────────────┐
│ 🔴 novo  ·  MANUAL  ·  há 3 min            │
│ Carlos Rodrigues                            │
│ Sintra → Odivelas  ·  12 kg                │
│ ─────────────────────────────               │
│ €28–€34  ·  1 Hora  ·  Ana               │
└─────────────────────────────────────────────┘
```

**Elementos do card (todos extraídos de campos existentes):**
- Ponto de cor = status (nova=cinza, em análise=azul, proposta=amarelo, aguarda=laranja, convertida=verde, perdida=vermelho)
- Badge routing = AUTO (cyan) | MANUAL (amarelo)
- Timestamp relativo
- Nome do lead (ou "Anónimo" para entradas sem contacto)
- Rota: origem → destino
- Peso (se disponível)
- Intervalo de preço (se calculado)
- Urgência
- Avatar do BO assignado (Ana, Márcia, ou ícone AI para AUTO)

**Estado selecionado:** fundo `--navy-700`, borda esquerda 2px `--cyan`

**Estado não lido:** ponto branco no topo-direito do card

### 5.3 Coluna Detalhe

Dividida em secções verticais com scroll:

```
─── HEADER DO LEAD ──────────────────────
Nome + contacto + badges (status, routing, urgência)
Botões de ação rápida: [Contactar] [Marcar status ▼] [Criar serviço]

─── DADOS DO PEDIDO ─────────────────────
Origem / Destino
Peso / Dimensões / Viatura
Urgência / Data pedido

─── PREÇO CALCULADO ──────────────────────
(Apenas se AUTO ou se preço já foi calculado)
€ min — € max    Distância: X km    Duração: X h
Milestone: Lisboa | Porto
Tipo de viatura: Moto/Carro/Furgão

─── HISTÓRICO / NOTAS ───────────────────
Timeline vertical de eventos:
  [ícone] Entrada recebida — 14:23
  [ícone] Preço calculado (AUTO) — 14:23
  [ícone] Contacto tentado por Ana — 14:30
  [ícone] Proposta enviada — 14:45
Campo de nota livre (textarea)

─── CONFIGURAÇÃO ROUTING (se settings) ──
Apenas na vista /settings
Toggles e horários do leadRoutingConfig
```

---

## 6. Componentes Visuais

### 6.1 Badge de Status

```tsx
// Tamanho: 10px uppercase, padding 2px 8px, border-radius 4px
const statusStyles = {
  nova:       { bg: 'rgba(139,158,201,0.15)', text: '#8B9EC9', border: 'rgba(139,158,201,0.3)' },
  'em análise': { bg: 'rgba(96,165,250,0.15)', text: '#60a5fa', border: 'rgba(96,165,250,0.3)' },
  proposta:   { bg: 'rgba(255,193,7,0.15)',   text: '#ffc107', border: 'rgba(255,193,7,0.3)' },
  aguarda:    { bg: 'rgba(245,158,11,0.15)',   text: '#f59e0b', border: 'rgba(245,158,11,0.3)' },
  convertida: { bg: 'rgba(16,185,129,0.15)',   text: '#10b981', border: 'rgba(16,185,129,0.3)' },
  perdida:    { bg: 'rgba(239,68,68,0.15)',    text: '#ef4444', border: 'rgba(239,68,68,0.3)' },
}
```

### 6.2 Badge de Routing

```tsx
// AUTO: cyan  /  MANUAL: yellow
// 10px uppercase, 500 weight
const routingBadge = {
  AUTO:   { bg: 'var(--cyan-dim)',   text: 'var(--cyan)',   border: 'rgba(0,188,212,0.3)' },
  MANUAL: { bg: 'var(--yellow-dim)', text: 'var(--yellow)', border: 'rgba(255,193,7,0.3)' },
}
```

### 6.3 Badge de Urgência

```tsx
const urgenciaBadge = {
  '1 Hora':   { bg: 'rgba(239,68,68,0.12)',  text: '#f87171' },
  '4 Horas':  { bg: 'rgba(245,158,11,0.12)', text: '#fbbf24' },
  '24 Horas': { bg: 'rgba(139,158,201,0.1)', text: '#8B9EC9' },
}
```

### 6.4 Avatar do BO

Círculo 24px com iniciais, fundo semi-transparente na cor do utilizador:
- Ana → cyan
- Márcia → amarelo
- AI (AUTO) → azul `#60a5fa`
- Não assignado → cinzento

### 6.5 Indicador de Preço

```
€28 — €34
```
- Valor em `--cyan`, font-weight 600, 15px
- Traço em `--text-3`
- Se não calculado: `"—"` em `--text-3`

### 6.6 Linha do Tempo (Timeline)

Verticalmente encadeada com linha pontilhada entre eventos:
```
● Entrada recebida (auto)              14:23
● Preço calculado: €28–€34 · 12km     14:23
● Em análise — Ana                     14:30
● Proposta enviada por WhatsApp        14:45
```
Cada evento tem ícone Tabler outline, timestamp, e descrição.

---

## 7. Filtros e Pesquisa

### Filtros rápidos (chips horizontais)
```
[Todos] [AUTO] [MANUAL] [Urgente] [Hoje] [Não lidos]
```
- Um activo de cada vez (ou "Todos")
- Estado activo: fundo `--cyan-dim`, borda `--border-active`, texto `--cyan`

### Filtros avançados (dropdown "Mais ▼")
- Intervalo de datas
- Urgência (checkbox)
- BO assignado
- Milestone (Lisboa / Porto)
- Faixa de preço

### Pesquisa
- Campo de texto: filtra por nome, email, telefone, endereço
- Pesquisa em tempo real (debounce 300ms)
- Highlight do termo no resultado

---

## 8. Estados Especiais

### Empty state (lista vazia)
```
[ícone inbox]
Nenhuma entrada encontrada
Ajusta os filtros ou aguarda novas entradas
```

### Loading state
- Skeleton cards na lista (3 cards placeholder animados)
- Spinner no centro da coluna detalhe

### Erro de conectividade
- Banner subtil no topo: `● Sem ligação — a tentar reconectar...`

### Lead não selecionada
- Coluna detalhe mostra placeholder:
  ```
  [ícone]
  Seleciona uma entrada para ver os detalhes
  ```

---

## 9. Ações por Lead

> A lógica e os endpoints de cada ação são os existentes. Apenas muda a UI.

### Ações disponíveis (botões no header do detalhe)
| Ação | Condição | Resultado |
|------|----------|-----------|
| **Contactar** | Tem telefone | Abre whatsapp:// ou tel: |
| **Marcar status** | Sempre | Dropdown com status disponíveis |
| **Criar serviço** | Status ≠ convertida | Abre modal de criação de serviço |
| **Calcular preço** | Sem preço calculado | Chama API de cálculo |
| **Atribuir** | MANUAL | Atribui a Ana ou Márcia |
| **Arquivar** | Qualquer | Move para arquivo |

### Modal "Criar Serviço"
- Confirmar dados: origem, destino, peso, viatura, urgência
- Campo de confirmação do preço final
- Botão primário: `Criar e notificar parceiro`
- O modal NÃO mostra o nome do parceiro (regra de negócio imutável)

---

## 10. Configurações de Routing (vista `/settings`)

### Toggle principal
```
Sistema AUTO activo  [●────]  ON
```

### Horário automático
```
De [09]:00  a [20]:00   Seg → Sex
Fim de semana:  [────●]  OFF
```

### Delay antes de bot
```
Aguardar  [5] minutos  antes de passar ao agente AI
```

### Todos os campos mapeiam 1:1 para `leadRoutingConfig` na MongoDB.

---

## 11. Topbar / Header Global

```
[YB logo]    Leads Dashboard       [🔔 3]  [Ana Gomes ▼]
```
- Logo: "YB" ou logotype YourBox
- Título da página activa
- Sino de notificações com badge de contagem (entradas novas não lidas)
- Avatar + nome do utilizador com dropdown (Perfil / Sair)

---

## 12. Ficheiros a Criar/Modificar no Projeto

> Baseado na estrutura Next.js 14 App Router já existente.

### Novos componentes (`/components/`)
```
/components/layout/
  Sidebar.tsx              ← substituir sidebar existente
  LeadsList.tsx            ← coluna lista (substituir tabela atual)
  LeadDetail.tsx           ← coluna detalhe (substituir vista atual)
  LeadCard.tsx             ← card individual na lista
  LeadTimeline.tsx         ← linha do tempo de eventos

/components/ui/
  StatusBadge.tsx          ← badge de status (reutilizável)
  RoutingBadge.tsx         ← badge AUTO/MANUAL
  UrgencyBadge.tsx         ← badge urgência
  PriceDisplay.tsx         ← exibição de preço (min–max)
  AssigneAvatar.tsx        ← avatar do BO assignado
  FilterChips.tsx          ← chips de filtro rápido
  SearchInput.tsx          ← input de pesquisa
  EmptyState.tsx           ← placeholder lista vazia
  SkeletonCard.tsx         ← loading placeholder
```

### Páginas a modificar (`/app/`)
```
/app/(dashboard)/
  layout.tsx               ← estrutura de 3 colunas
  page.tsx                 ← dashboard principal (entradas)
  leads/page.tsx           ← leads qualificadas
  settings/page.tsx        ← configurações routing
```

### CSS global (`/app/globals.css`)
Adicionar as variáveis CSS da paleta (secção 3 deste doc).  
Manter as variáveis Tailwind v4 já existentes.

---

## 13. Responsividade — Breakpoints

| Breakpoint | Comportamento |
|------------|---------------|
| `< 768px` | Apenas lista (full width). Detalhe em full screen ao selecionar. |
| `768–1023px` | Sidebar + Lista. Detalhe como drawer lateral. |
| `≥ 1024px` | 3 colunas completas (sidebar 60px + lista 320px + detalhe flex). |

---

## 14. Animações e Transições

Todas as animações são subtis e funcionais, nunca decorativas:

| Elemento | Animação |
|----------|----------|
| Card selecionado | `transition: background 150ms ease` |
| Badge status | `transition: color, background 150ms` |
| Nova entrada na lista | Slide-in do topo `transform: translateY(-8px) → 0, opacity 0→1, 200ms` |
| Drawer móvel | `transform: translateX(100%) → 0, 250ms ease-out` |
| Loading skeleton | `opacity: 0.5 ↔ 1, 1.2s ease-in-out infinite` |
| Notificação badge | `scale: 0 → 1.1 → 1, 200ms` ao incrementar |

---

## 15. Notas de Implementação para Claude Code

1. **Não alterar a data layer** — todos os `fetch`, `useQuery`, `SWR` calls existentes mantêm-se. O redesign é puramente de apresentação.

2. **Manter os hooks existentes** de polling/SSE para actualizações em tempo real.

3. **Preservar a lógica de permissões** — a visibilidade de ações (ex: só admin pode criar serviço) não muda.

4. **Tailwind v4** — usar as CSS variables já configuradas. Não adicionar classes de cor hardcoded.

5. **Dark mode only** — a app é dark-only, não implementar light mode toggle.

6. **Testar polling** — a lista atualiza automaticamente (novo card aparece no topo). Este comportamento deve ser visível no redesign.

7. **O nome do parceiro nunca aparece** em nenhum componente cliente — esta regra mantém-se.

8. **Ordem de implementação sugerida:**
   - [ ] CSS variables e tokens globais
   - [ ] `StatusBadge`, `RoutingBadge`, `UrgencyBadge` (componentes folha)
   - [ ] `LeadCard` (usa os badges)
   - [ ] `FilterChips` + `SearchInput`
   - [ ] `LeadsList` (usa LeadCard + filtros)
   - [ ] `LeadTimeline`
   - [ ] `LeadDetail` (usa timeline + ações)
   - [ ] `Sidebar` (substituir)
   - [ ] Layout de 3 colunas
   - [ ] Responsividade mobile

---

*Este documento é o único contrato de design entre Claude chat e Claude Code para este redesign. Qualquer ambiguidade deve ser resolvida consultando o ficheiro `YOURBOX_CLAUDE_CODE_START.md` para lógica de negócio e este documento para apresentação visual.*
