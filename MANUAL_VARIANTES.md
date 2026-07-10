# Manual de Variantes — YourBox (landing + quiz)

> Guia para o administrador perceber a **dinâmica de cada variante** de captação, os
> respetivos **prós e contras**, e **que novas variantes** faz sentido testar a seguir.
> Todas partilham o mesmo hero ("Entrega Ultra-Rápida em Todo Portugal"); o que muda é
> a **mecânica do formulário** e, no quiz, a **ordem dos passos**.
>
> Como se distinguem no dashboard: cada lead/visita traz a `variante`
> (Site A/B/C/D, Quiz, Quiz 3/4/5) — vês nos badges das Leads, no chip do Inbox e no
> **Funil por variante** dos Relatórios.

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
| **Quiz 5** | **Contacto a meio** | **Baixa** | Alta | **Recomendada** |

---

## 5. Que variantes testar a seguir (roadmap de experiências)

Priorizadas por impacto esperado × esforço. Testar **uma variável de cada vez** contra
a vencedora actual (Quiz 5).

1. **Quiz 6 — contacto ainda mais tarde + email antes do telefone.**
   Ordem: rota → carga → **email → (telefone opcional)** → dimensões → resto. O telefone
   é o campo que mais mata conversão; pedir **email primeiro** e telefone opcional deve
   captar mais contactos. Enquadrar como "para onde enviamos o orçamento?".

2. **Quiz 7 — urgência primeiro.**
   Perguntar a **urgência (1 clique)** logo a seguir à rota, para segmentar cedo e dar
   sensação de avanço rápido antes de pedir dados.

3. **Quiz 8 — dimensões por presets.**
   Substituir os 3 campos C×L×A por **"Caixa pequena/média/grande · Palete · Não sei"**
   (um toque). Ataca directamente o passo que mais abandona.

4. **Landing com orçamento instantâneo (mobile-first).**
   73% das visitas são **telemóvel** → uma variante desenhada primeiro para telemóvel,
   com **preço estimado imediato** (rota → preço na hora) e contacto só para confirmar.

5. **Exit-intent / nudge on-page.**
   Quem fica parado num passo ou vai sair recebe "Já temos quase tudo — carregue aqui e
   tratamos do resto" que submete com o que existe. Recupera **antes** de sair.

6. **WhatsApp-first.**
   CTA primário "Peça no WhatsApp" que abre conversa com a rota pré-preenchida. Testar
   se o canal preferido reduz fricção (ligado ao fluxo do bot).

7. **Prova social real e dinâmica.**
   Reintroduzir prova social **apenas com dados reais** (ex.: avaliações Google) e num
   **endpoint read-only** (nunca chamar o endpoint de preço para isso — foi o que gerou
   simulações falsas no passado).

8. **Menos passos (compressão).**
   Juntar volumes+peso num só ecrã, dimensões opcionais → reduzir de 11 para ~7 passos.
   Testar "quiz curto" vs "quiz completo".

### Como medir cada teste
- Mesmo período, **Quiz 5 como controlo**.
- Métrica principal: **visita → lead (funil completo)** nos Relatórios; secundária:
  conclusão **conversa → lead** e **contactos captados/visita**.
- Amostra mínima antes de concluir (evitar decidir com < ~30 leads por variante).
- Dar nome próprio a cada nova página (`window.YB_QUIZ_VARIANTE = 'QUIZ6'…`) para
  aparecer distinta no dashboard.

---

*Actualizado: Julho 2026. Manter em dia à medida que novas variantes entram em rotação.*
