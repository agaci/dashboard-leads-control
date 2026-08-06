# Prompt para Claude Code — Captura de GCLID e Importação de Conversões Offline

> Copia tudo abaixo da linha e cola no Claude Code, na raiz do projecto.

---

## CONTEXTO

Esta plataforma (Next.js + MongoDB) gere leads da Yourbox Lda, uma empresa portuguesa de transportes urgentes B2B. O site tem um sistema de quiz com variantes A/B/C (Quiz 6c, Quiz 6b, Quiz 6, Quiz 5, etc.) que renderizam aleatoriamente e captam leads.

**O problema a resolver:**

O Google Ads está a reportar **0 conversões**, apesar de a plataforma registar **372 leads em 30 dias**. O tag de conversão baseado em browser não é fiável (bloqueadores, consentimento de cookies, ou simplesmente partido).

Consequência prática: a campanha usa estratégia de lance "Maximizar Conversões". Sem ver conversões, o algoritmo do Google gere lances às cegas e a entrega de tráfego tornou-se erráctica (dias com 120 cliques, outros com 54 visitas totais).

**A solução:** capturar o identificador de clique do Google (`gclid`) em cada visita paga, persisti-lo até à criação da lead, e disponibilizar essa informação para importação de conversões offline no Google Ads.

---

## OBJECTIVO GERAL

Implementar captura, persistência e exportação de identificadores de clique do Google, de forma a poder alimentar o Google Ads com conversões reais em vez de depender do tag de browser.

---

## FASE 1 — Auditoria (fazer primeiro, antes de escrever código)

Antes de implementar seja o que for, analisa o código existente e responde:

1. **O `gclid` já é capturado em algum sítio?** Procura por `gclid`, `utm_`, `wbraid`, `gbraid` em todo o projecto.

2. **Qual é o schema actual do documento de lead na MongoDB?** Mostra-me a estrutura completa, incluindo que campos de origem/atribuição já existem.

3. **Como é que uma visita se torna lead?** Traça o percurso: landing page → selecção de variante → conversa/quiz → submissão final. Identifica onde o estado é guardado (sessão, cookie, localStorage, documento em base de dados).

4. **Existe já algum tag do Google Ads ou Google Tag Manager no projecto?** Se sim, onde e em que estado.

5. **Há middleware Next.js activo?** Preciso de saber se posso interceptar pedidos de entrada.

**Apresenta as respostas antes de avançar para a Fase 2. Não escrevas código nesta fase.**

---

## FASE 2 — Captura dos identificadores de clique

### Requisitos

Capturar da query string da primeira visita:

| Parâmetro | Origem |
|---|---|
| `gclid` | Google Ads — clique padrão |
| `wbraid` | Google Ads — tráfego web em iOS |
| `gbraid` | Google Ads — tráfego app em iOS |
| `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content` | Atribuição geral |

**Importante:** capturar `wbraid` e `gbraid` também, não apenas `gclid`. Como 73% do tráfego é mobile, uma fatia significativa de utilizadores iOS traz estes parâmetros em vez do `gclid`.

### Regras de implementação

- **Persistência:** guardar em cookie first-party com validade de **90 dias** (a janela de conversão padrão do Google Ads).
- **Primeiro toque ganha:** se já existir um `gclid` guardado, não sobrescrever, excepto se o novo for de uma sessão claramente distinta. Regista também a data de captura.
- **Registar sempre o timestamp** da captura — é obrigatório na importação de conversões offline.
- **Funcionar sem JavaScript no cliente** sempre que possível — usa middleware do Next.js para escrever o cookie no servidor, para ser imune a bloqueadores.

### Estrutura sugerida do cookie

```json
{
  "gclid": "Cj0KCQ...",
  "wbraid": null,
  "gbraid": null,
  "capturedAt": "2026-08-06T09:14:22.000Z",
  "landingPage": "/quiz",
  "utm": {
    "source": "google",
    "medium": "cpc",
    "campaign": "search-urgente"
  }
}
```

---

## FASE 3 — Persistência na lead

### Requisitos

Quando uma lead é criada, gravar no documento MongoDB os dados de atribuição capturados.

Campos a adicionar ao schema da lead:

```js
attribution: {
  gclid: String,          // indexado
  wbraid: String,
  gbraid: String,
  clickedAt: Date,        // quando o clique aconteceu (do cookie)
  landingPage: String,
  variant: String,        // Quiz 6c, Quiz 6b, etc. — se ainda não existir
  utm: {
    source: String,
    medium: String,
    campaign: String,
    term: String,
    content: String
  }
},
conversionSync: {
  status: String,         // 'pending' | 'exported' | 'uploaded' | 'skipped'
  exportedAt: Date,
  value: Number           // valor monetário da conversão, se aplicável
}
```

### Considerações

- Criar índice em `attribution.gclid` e em `conversionSync.status`.
- Escrever uma **migração** que adicione estes campos aos documentos existentes com valores nulos, sem quebrar nada.
- O campo `variant` deve ligar-se ao sistema de variantes já existente — verifica primeiro como está guardado actualmente e reutiliza, não dupliques.
- Garantir que a ausência de `gclid` **nunca** impede a criação da lead. Tráfego orgânico e directo continua a funcionar normalmente.

---

## FASE 4 — Exportação para o Google Ads

### Endpoint de exportação

Criar uma rota protegida que devolva um CSV no formato exacto que o Google Ads aceita para importação de conversões offline.

**Formato obrigatório do CSV** (as duas primeiras linhas são literais):

```
Parameters:TimeZone=Europe/Lisbon
Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency
Cj0KCQ...,Lead Yourbox,2026-08-06 14:22:31,0,EUR
```

**Regras críticas do formato:**

- `Conversion Time` no formato `yyyy-MM-dd HH:mm:ss`, na timezone declarada no cabeçalho.
- `Conversion Time` tem de ser **posterior** ao momento do clique — caso contrário o Google rejeita a linha.
- `Conversion Name` tem de corresponder **exactamente** ao nome da acção de conversão criada no Google Ads.
- Excluir leads sem `gclid`/`wbraid`/`gbraid`.
- Excluir leads com mais de 90 dias.
- Excluir leads já com `conversionSync.status === 'uploaded'`.

### Parâmetros da rota

- `?from=` e `?to=` para intervalo de datas
- `?status=` para filtrar por estado de sincronização
- Protecção por token no header ou variável de ambiente — **não deixar público**

### Marcação de estado

Após exportação bem-sucedida, actualizar `conversionSync.status` para `'exported'` e preencher `exportedAt`.

---

## FASE 5 — Painel de verificação

Adicionar ao dashboard existente uma secção que mostre:

- **Total de leads com `gclid`** vs **total sem**, nos últimos 30 dias
- **Percentagem de cobertura de atribuição** (quantas leads têm identificador de clique)
- **Leads pendentes de exportação**
- **Distribuição por `utm_source`** — para confirmar quanto do tráfego é realmente pago
- Botão de download do CSV do período seleccionado

Isto é essencial para validar que a captura está a funcionar antes de confiar nos dados.

---

## FASE 6 (opcional, só depois de 1-5 validadas)

Automatizar o envio via **Google Ads API** com `ClickConversion` e `UploadClickConversionsRequest`, eliminando o passo manual de upload do CSV.

**Não implementar agora.** Deixar preparado com uma nota de TODO. Primeiro validamos com o fluxo manual de CSV durante 2-3 semanas.

---

## RESTRIÇÕES E CUIDADOS

- **Não alterar** a lógica de selecção de variantes do quiz — está a funcionar e é o que sustenta o teste A/B/C em curso.
- **Não introduzir** dependências pesadas. Preferir a solução mais simples que funcione.
- **RGPD:** o `gclid` é um identificador de first-party sob interesse legítimo para medição. Verifica se a política de privacidade do site menciona medição publicitária. Se houver banner de consentimento, o cookie de atribuição deve respeitar a categoria "marketing" — mas confirma comigo antes de o condicionar ao consentimento, porque isso reduz drasticamente a cobertura.
- **Testar** com um URL real de exemplo: `https://[dominio]/?gclid=TESTE123&utm_source=google&utm_medium=cpc`
- Escrever testes para a formatação do CSV, que é a parte mais frágil.

---

## ORDEM DE TRABALHO

Faz a **Fase 1** e apresenta-me as conclusões. Só depois avançamos.

Para cada fase seguinte: mostra o plano, espera confirmação, implementa, e faz commit com mensagem descritiva.
