# Manual de Variantes — YourBox (landing + quiz)

> Guia para o administrador perceber a **dinâmica de cada variante** de captação, os
> respetivos **prós e contras**, e **que novas variantes** faz sentido testar a seguir.
> Todas partilham o mesmo hero ("Entrega Ultra-Rápida em Todo Portugal"); o que muda é
> a **mecânica do formulário** e, no quiz, a **ordem dos passos**.
>
> Como se distinguem no dashboard: cada lead/visita traz a `variante`
> (Site A/B/C/D, Quiz, Quiz 3/4/5/6/6b/6c) — vês nos badges das Leads, no chip do Inbox,
> no **Funil por variante** e no **drop-off por passo** dos Relatórios.
>
> Para o mapa visual da sequência de cada variante, ver **§5. Fluxograma completo**.

---

## 1. Como ler este manual

- **Dinâmica** = como a pessoa preenche e o que acontece.
- **Fricção** = quanto esforço/compromisso é pedido, e quando.
- **Sinal** = quão "quente" é a lead que gera (intenção de compra).
- Regra de ouro do funil: **começar pelo que envolve, deixar os dados pessoais para
  depois**. Quem chega para pedir um preço não veio dar o telefone.

---

## 2. Variantes de LANDING (calculadora) — `index-a/b/c/d`

Formulário embutido no hero, movido pelos `yourbox-form-a/b/c/d.js`. Chamam o backend
de preço (`freeGetServicePriceAPI2026`).

### Site A — Calculadora em 2 passos (preço → contacto)
- **Dinâmica:** passo 1 recolhe rota/serviço e **calcula o preço**; passo 2 pede o
  contacto para receber/confirmar. "Vê o preço, depois deixa o contacto."
- **Prós:** mostra valor (preço) antes de pedir dados → boa troca; lead traz preço.
- **Contras:** o preço pode "assustar"/fazer sair; 2 ecrãs.
- **Quando:** público que quer sobretudo saber **quanto custa**.

### Site B — Captura directa em 1 passo
- **Dinâmica:** um único ecrã com tudo; submete **lead directa** (`submitDirectLead`)
  sem obrigar a ver o preço. "Preenche e pedimos nós o contacto."
- **Prós:** menos ecrãs, rápido; capta contacto sem depender do preço.
- **Contras:** sem "momento preço" a criar desejo; pode parecer um formulário longo
  num só ecrã.
- **Quando:** campanhas de captação onde o objetivo é **o contacto**, não o preço.

### Site C — Híbrido (preço + "prefiro falar" / callback)
- **Dinâmica:** 5 passos com **dupla via** — fluxo normal (preço) **ou** botão
  "prefiro falar" que agenda um **callback** (a YourBox liga). "LIGAMOS-lhe."
- **Prós:** dá saída a quem não quer preencher tudo (pede para ligarmos) → recupera
  indecisos; dois caminhos para converter.
- **Contras:** mais complexo; o callback gera uma lead **mais fria** (menos dados) que
  exige seguimento; mais passos.
- **Quando:** público que prefere falar com uma pessoa (serviços mais complexos/urgentes).

### Site D — Progressive profiling + callback
- **Dinâmica:** 5 passos de **perfilamento progressivo** (pede pouco de cada vez,
  vai construindo o pedido) com opção de callback ("LIGAMOS").
- **Prós:** cada passo é leve → menos abandono por ecrã; sensação de progresso.
- **Contras:** mais passos no total; risco de cansaço a meio.
- **Quando:** testar se "muitos passos fáceis" bate "poucos passos densos".

---

## 3. Variantes de QUIZ (funil passo-a-passo) — `index-quiz*`

Movidas pelo `yourbox-quiz.js` (partilhado). O quiz **guarda cada passo em tempo real**
(mesmo sem concluir) → alimenta o **reengajamento** e o **funil de visitas→conversas→leads**.
Ordem base: `nome · telefone · email · recolha · entrega · volumes · peso · dimensões ·
urgência · material · embalagem · confirmação` (11 passos).

### Quiz (base) — `index-quiz`
- **Dinâmica:** funil clássico, contacto primeiro, **sem animação**.
- **Prós:** simples e leve.
- **Contras:** contacto no início (passos 1–3) é um muro antes de qualquer valor.

### Quiz B — `index-quiz-b`
- **Dinâmica:** igual ao base **+ animação de "montar a encomenda"** (pilha de caixas
  que se enche à medida que avança).
- **Prós:** mais envolvente/lúdico; feedback visual de progresso.
- **Contras:** distração possível; peso visual maior.
- **Quando:** testar se o **gamificado** aumenta a conclusão.

### Quiz 3 — `index-quiz-3`  ·  **variante-base do A/B actual (`QUIZ3`)**
- **Dinâmica:** funil limpo, contacto primeiro, sem animação. É a **referência**.
- **Prós:** limpo, rápido, foco.
- **Contras:** mantém o problema do **contacto-primeiro** (muita gente sai antes de
  chegar ao contacto — nos dados, ~15% dos visitantes chegam a conversa).

### Quiz 4 — `index-quiz-4`  ·  atalho "Concluir agora"
- **Dinâmica:** contacto-primeiro **+ botão "Concluir e pedir orçamento agora"** que
  aparece assim que há **nome + contacto + rota**, tornando os passos de carga
  (dimensões/material/embalagem) **opcionais**. Leads assim ficam marcadas
  `QUIZ4-RAPIDO` com nota "detalhes de carga a confirmar".
- **Prós:** elimina o **muro do passo das dimensões**; deixa concluir sem a parte chata;
  lead ainda **quente** (a pessoa carregou em concluir).
- **Contras:** lead com **menos detalhe** de carga (confirmar na chamada).
- **Quando:** quando o passo das dimensões está a matar conclusões.

### Quiz 5 — `index-quiz-5`  ·  contacto a MEIO  ·  **melhor no A/B actual**
- **Dinâmica:** reordenado — `recolha · entrega · volumes · peso · **nome · telefone ·
  email** · dimensões · urgência · material · embalagem · confirmação`. O contacto é
  capturado **depois** de haver rota + carga inicial e **antes** das dimensões.
- **Prós:** os primeiros passos (fáceis) criam compromisso → **muito menos abandono
  inicial** (nos dados, ~71% dos visitantes chegam a conversa vs ~15% na Quiz 3); e se
  saírem nas dimensões, **já temos contacto + rota + peso** para reengajar.
- **Contras:** o contacto ainda não está no fim (ideal seria ainda mais tarde), mas é
  o compromisso a tempo de captar quem vai sair.
- **Quando:** é a abordagem recomendada — captura contacto **cedo o suficiente** para
  reengajar, **tarde o suficiente** para não ser um muro.

> **Leitura do A/B actual (Quiz 3 vs Quiz 5):** ambas fecham ~80% de conversa→lead, mas
> a Quiz 5 ganha de longe no funil **completo** (visita→lead ~57% vs ~12%), porque
> prende muito mais visitantes na passagem visita→conversa. Confirma a hipótese de que
> **contacto-primeiro afasta gente logo à entrada**.

### Quiz 6 — `index-quiz-6`  ·  contacto a meio, **email antes do telefone** + **urgência cedo**
- **Dinâmica:** evolução da Quiz 5. Ordem: `recolha · entrega · **urgência** · volumes ·
  peso · **nome · email · telefone** · dimensões · material · embalagem · confirmação`.
  Duas mudanças face à Quiz 5: (1) o **email vem antes do telefone** — o telefone é o
  campo de maior fricção, e pedindo email primeiro ("para onde enviamos o orçamento?")
  captamos contacto mesmo que desistam no telefone; (2) a **urgência sobe para 3º**
  (1 toque, logo após a rota) para segmentar cedo e dar sensação de progresso. Traz ainda
  uma **advertência no topo** ("responda a todas as perguntas — mais completo, mais
  rigoroso é o orçamento") e um subtítulo sem promessa de espera ("tratamos já do seu
  orçamento").
- **Prós:** reforça a rede de reengajamento (basta o email para tocar quem desiste); urgência precoce.
- **Contras:** contacto continua a meio (não no fim).

### Quiz 6b — `index-quiz-6b`  ·  Quiz 6 + **carga inteligente**
- **Dinâmica:** igual à Quiz 6, mas os passos de carga deixam de ser texto livre:
  **volumes por chips** (1–5, um toque, + campo para "mais de 5") e **peso por faixas**
  com exemplos concretos ("Até 5 kg — ex.: caixa de roupa", …, "Não sei — estimamos").
- **Porquê:** o drop-off por passo mostrou que o **peso** ("peso médio por volume") é o
  novo muro da família 5/6 (~28% de fuga). As faixas com exemplos e o "Não sei" desarmam-no.
- **Isola:** 6b vs 6 mede o efeito puro da carga inteligente (ambas email-first).

### Quiz 6c — `index-quiz-6c`  ·  Quiz 6b + **dimensões por presets**
- **Dinâmica:** igual à Quiz 6b, mas as dimensões (C×L×A) passam a **presets**: "Caixa
  pequena / média / grande · Palete · Não sei" (um toque). Cada preset guarda um C×L×A
  representativo, mantendo a precisão do preço (espaço ocupado ≠ peso).
- **Porquê:** elimina a sensação de "pedir o tamanho outra vez" e a fricção dos 3 campos,
  coerente com o estilo das outras faixas. As dimensões têm fuga baixa (0–3% nos dados),
  por isso convertem-se — não se apagam (perder-se-ia a precisão do peso volumétrico).
- **Isola:** 6c vs 6b mede o efeito das dimensões por presets.

---

## 4. Resumo rápido (matriz)

| Variante | Dinâmica-chave | Fricção inicial | Sinal da lead | Nota |
|---|---|---|---|---|
| Site A | Preço → contacto | Média | Alta (traz preço) | Vê preço primeiro |
| Site B | Captura directa 1 passo | Baixa | Média | Contacto sem preço |
| Site C | Preço + callback | Média | Mista (callback = frio) | Dupla via |
| Site D | Progressive + callback | Baixa por passo | Média | Muitos passos leves |
| Quiz / Quiz 3 | Contacto-primeiro | **Alta** (muro cedo) | Alta se concluir | Base A/B (Quiz 3) |
| Quiz B | Igual + animação | Alta | Alta | Gamificado |
| Quiz 4 | + atalho concluir | Alta | Alta (menos carga) | Tira o muro das dimensões |
| Quiz 5 | Contacto a meio | Baixa | Alta | Vencedora anterior |
| Quiz 6 | Contacto a meio, email→telefone, urgência cedo | Baixa | Alta | Base actual da família 6 |
| Quiz 6b | Quiz 6 + carga inteligente (chips/faixas) | Baixa | Alta | Ataca o muro do peso |
| **Quiz 6c** | **Quiz 6b + dimensões por presets** | **Baixa** | Alta | **Mais recente** |

---

## 5. Fluxograma completo das variantes

Sequência de cada variante, com o **momento do contacto**, os **muros conhecidos** (fuga
real medida no *drop-off por passo* dos Relatórios) e a partir de onde o **reengajamento**
consegue tocar o visitante.

**Legenda:**
- `(contacto)` — passo(s) onde se capta nome / email / telefone
- `[MURO]` — passo com abandono elevado nos dados
- `>> reengajável` — a partir daqui há contacto suficiente (nome + email) para o toque de quiz abandonado
- Fim: `-> LEAD` (submeteu) **ou** abandono silencioso (fica "Activa" até fecho manual / expiração 24h)

### Landing (calculadora) — 1 ecrã ou poucos passos

```
Site A   Rota + serviço -> [PREÇO] -> (contacto) -> LEAD
Site B   Tudo num ecrã -> submete -> (contacto) -> LEAD
Site C   5 passos -> preço   ||   "prefiro falar" -> (callback) -> LEAD fria
Site D   perfil progressivo (pouco de cada vez) -> (contacto/callback) -> LEAD
```

### Quiz — família CONTACTO-PRIMEIRO (base / B / 3 / 4)

```
QUIZ  ·  QUIZ B  ·  QUIZ 3
 1  Nome      ]
 2  Telefone  ] (contacto)     [MURO: ~21-23% saem logo no passo 1]
 3  Email     ]  >> reengajável a partir daqui
 4  Recolha
 5  Entrega
 6  Volumes
 7  Peso
 8  Dimensões
 9  Urgência
10  Material
11  Embalagem
12  Resumo  -> LEAD
   (Quiz B = igual + animação de caixas;  Quiz 3 = referência limpa)

QUIZ 4  (= base + atalho)
   Assim que há Nome + Contacto + Rota aparece "Concluir e pedir orçamento agora"
   -> salta dimensões / material / embalagem -> LEAD marcada QUIZ4-RAPIDO
```

### Quiz — família CONTACTO-A-MEIO (5 / 6 / 6b / 6c)

```
QUIZ 5
 1  Recolha
 2  Entrega
 3  Volumes
 4  Peso            [MURO: ~28% — "peso médio por volume" é confuso]
 5  Nome      ]
 6  Telefone  ] (contacto)
 7  Email     ]  >> reengajável a partir daqui (precisa do email)
 8  Dimensões
 9  Urgência
10  Material
11  Embalagem
12  Resumo  -> LEAD

QUIZ 6  (email antes do telefone + urgência cedo + advertência no topo)
 1  Recolha
 2  Entrega
 3  Urgência        (1 toque — segmenta cedo, dá progresso)
 4  Volumes
 5  Peso            [MURO do peso]
 6  Nome      ]
 7  Email     ] (contacto)   >> reengajável a partir daqui (basta o email)
 8  Telefone  ]
 9  Dimensões
10  Material
11  Embalagem
12  Resumo  -> LEAD

QUIZ 6b  (= Quiz 6, mas Volumes por chips 1-5 e Peso por FAIXAS com exemplos)
   -> desarma o [MURO do peso]

QUIZ 6c  (= Quiz 6b, mas Dimensões por PRESETS: Caixa P/M/G · Palete · Não sei)
```

### Cobertura do reengajamento por família

| Família | Contacto captado em | Reengajável a partir de | Nota |
|---|---|---|---|
| Contacto-primeiro (base/B/3/4) | passos 1–3 | passo 3 (email) | rede ampla, mas muitos saem no passo 1 |
| Contacto-a-meio (Quiz 5) | passos 5–7 | passo 7 (email) | menos abandono inicial |
| Contacto-a-meio (Quiz 6/6b/6c) | passos 6–8 | **passo 7 (email)** | email antes do telefone reforça a rede |

> Quem abandona **antes do email** não é reengajável (não há contacto) — é inerente, não é
> falha. Por isso vale a pena continuar a baixar as fugas iniciais (peso por faixas,
> dimensões por presets) para levar mais gente até ao passo do contacto.

---

## 6. Que variantes testar a seguir (roadmap de experiências)

Testar **uma variável de cada vez**. A cadeia actual já isola cada mudança:
**Quiz 6 → 6b** (carga inteligente: volumes/peso) e **6b → 6c** (dimensões por presets).

**[FEITO]** — eram as ideias 1–3 deste roadmap:
- **Email antes do telefone** → Quiz 6 (o telefone é o campo de maior fricção).
- **Urgência cedo** → subiu para 3º na família 6 (antes "Quiz 7 — urgência primeiro").
- **Dimensões por presets** → Quiz 6c; **peso por faixas** → Quiz 6b (antes "Quiz 8").

**Ainda por testar** (por impacto esperado × esforço):

1. **Landing com orçamento instantâneo (mobile-first).**
   73% das visitas são **telemóvel** → uma variante desenhada primeiro para telemóvel,
   com **preço estimado imediato** (rota → preço na hora) e contacto só para confirmar.

2. **Exit-intent / nudge on-page.**
   Quem fica parado num passo ou vai sair recebe "Já temos quase tudo — carregue aqui e
   tratamos do resto" que submete com o que existe. Recupera **antes** de sair.

3. **WhatsApp-first.**
   CTA primário "Peça no WhatsApp" que abre conversa com a rota pré-preenchida. Testar
   se o canal preferido reduz fricção (ligado ao fluxo do bot).

4. **Prova social real e dinâmica.**
   Reintroduzir prova social **apenas com dados reais** (ex.: avaliações Google) e num
   **endpoint read-only** (nunca chamar o endpoint de preço para isso — foi o que gerou
   simulações falsas no passado).

5. **Menos passos (compressão).**
   Juntar volumes+peso num só ecrã, dimensões opcionais → reduzir de 11 para ~7 passos.
   Testar "quiz curto" vs "quiz completo".

### Como medir cada teste
- Mesmo período, **controlo = a variante anterior da cadeia** (ex.: 6b para avaliar a 6c);
  face à família anterior, usar a **Quiz 5** como referência histórica.
- Métrica principal: **visita → lead (funil completo)** nos Relatórios; secundárias:
  conclusão **conversa → lead**, **contactos captados/visita** e o **drop-off por passo**
  (confirma se o muro visado — ex.: peso, dimensões — realmente caiu).
- Amostra mínima antes de concluir (evitar decidir com < ~30 leads por variante).
- Dar nome próprio a cada nova página (`window.YB_QUIZ_VARIANTE = 'QUIZ6C'…`) e registá-la
  na rotação (config de variantes) para aparecer distinta no dashboard.

---

*Actualizado: Julho 2026 — após Quiz 6/6b/6c, advertência no topo, urgência cedo e §5 Fluxograma completo. Manter em dia à medida que novas variantes entram em rotação.*
