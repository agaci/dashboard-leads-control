# Ideias Futuras — YourBox Dashboard

> Registado em: Maio 2026

---

## 1. Bot a Aprender com os Diálogos

### Abordagens disponíveis (sem fine-tuning — impraticável com Claude)

**a) Aprendizagem por intervenção do operador (melhor sinal)**
Quando o operador assume o chat (`ESCALATED_TO_HUMAN` → `LIVE_CHAT`), o par "bot disse X / operador corrigiu com Y" é o sinal de aprendizagem mais valioso. Pedir ao LLM que analise esse par e extraia uma nova situação para `agentSituacoes`.

**b) Conversas convertidas como exemplos positivos**
Quando uma lead chega a `LEAD_REGISTERED`, a conversa foi bem sucedida. Extrair padrões de resposta para situações específicas ou usar como few-shot examples no prompt.

**c) Interface de revisão no dashboard**
Pequeno ecrã onde o operador vê conversas recentes e marca: "esta resposta foi boa" / "aqui o bot podia ter dito melhor: ___". Ciclo de feedback mais controlado e de maior qualidade.

### Implementação prática recomendada (fase inicial)
Job automático que, quando uma conversa termina com intervenção de operador:
1. Envia o extracto ao Claude com prompt: "o que é que o operador fez diferente? Cria uma nova situação para a base de conhecimento"
2. Operador aprova/rejeita no dashboard antes de guardar em `agentSituacoes`

**Base já existente:** colecção `agentSituacoes` com 100+ situações — alimentar esta base é mais eficaz e controlável do que RAG com vectores (overkill para já).

---

## 1b. IA na triagem do CRM de Parceiros

> Registado em 08/09/2026, ao acrescentar a caixa de texto livre ao quiz 7D.
> **Decisão tomada: não usar IA como decisor. Fica como conselheira, mais tarde.**

### Porque não decide

**A decisão já é determinística e de graça.** Desde o 7D, o menu de material diz a
categoria: quem escolhe "Mudança de casa" *é* uma mudança. Pôr um modelo por cima de um
sinal certo é acrescentar incerteza a uma certeza.

**Está no caminho crítico da lead.** Uma chamada a um modelo dentro do `quiz-progress`
acrescenta latência e um modo de falha ao endpoint mais importante do negócio. A primeira
regra do `lib/crm/entrada.ts` é que o CRM não pode fazer perder uma lead.

**A decisão tem consequências para terceiros.** Vender o contacto de alguém precisa de um
motivo auditável. *"declarado no formulário: mudança"* defende-se numa reclamação;
*"a IA achou"* não.

### Onde vale mesmo a pena — dois usos, por ordem de valor

**1. Melhorar as regras (o mais valioso, e o menos óbvio).**
Periodicamente, passar ao modelo os textos livres das leads que ficaram na Linha A e
perguntar quais deviam ter saído. O que sai daí são **padrões novos** para o
`lib/crm/categorias.ts` — o ganho fica no código e não se paga a cada lead. A IA a
ensinar as regras, em vez de as substituir.

**2. Conselheira nos casos duvidosos.**
Só nas consultas que a triagem deixou sem categoria ou com `confianca: 'media' | 'baixa'`.
Corre **depois**, fora do caminho crítico, e sugere à operadora: *"o texto sugere
mudanças"*. Nunca decide, nunca distribui.

### Condições para avançar

- Haver texto livre com massa crítica (a caixa do 7D é de 08/09/2026 — é preciso histórico)
- O `crm_outcomes` mostrar onde a triagem erra, para se saber o que a IA teria de acertar
- A chave `ANTHROPIC_API_KEY` já existe no ambiente; o bot já usa Claude

### O que NÃO fazer

Chamar o modelo dentro do `quiz-progress`. Se alguma vez parecer boa ideia, reler a
secção 6 do `CRM_IMPLEMENTACAO.md`: durante uma tarde inteira a triagem não corria porque
foi lançada em segundo plano, e ninguém deu por isso. Acrescentar uma dependência de rede
a esse caminho é convidar o mesmo tipo de falha, com factura.

---

## 2. Vídeo Demonstrativo para o Site

### Formato técnico (landing page)
```html
<video autoplay muted loop playsinline>
  <source src="/demo.webm" type="video/webm">
  <source src="/demo.mp4" type="video/mp4">
</video>
```
- Auto-play, muted, loop — sem YouTube, sem cookies, sem distrações
- Tamanho alvo: abaixo de 3 MB
- Formatos: `.mp4` (H.264) + `.webm` como fallback

### Posição na página
Secção dedicada a meio da landing page — depois do hero (form progressivo) mas antes dos benefícios/preços. Moldura de telemóvel (mockup PNG iPhone/Android) com a animação da conversa dentro. Formato reconhecível como WhatsApp ou chat widget.

### Ferramentas recomendadas

| Objectivo | Ferramenta | Porquê |
|---|---|---|
| Gravar ecrã com qualidade | **Loom** ou **OBS** | Simples, gratuito |
| Editar e montar | **CapCut** (web) | Rápido para conteúdo simples |
| Mockup de telemóvel | **Rotato** ou **Canva** | Gera vídeo do ecrã dentro de iPhone |
| Animação de chat sem gravar | **Jitter** ou CSS puro | Resultado mais limpo e controlado |

### Conteúdo do vídeo (30-45 segundos, sem áudio)
1. Lead escreve "quero transportar uma moto"
2. Bot qualifica: origem, destino
3. Bot apresenta preço com desconto
4. Lead aceita — dados recolhidos — confirmação
5. Legenda simples a explicar cada passo

### Processo recomendado
Fazer uma conversa real no widget com lead fictícia (respostas bem calibradas) → gravar com Loom → colocar no Rotato para embrulhar no mockup de telemóvel. Resultado profissional em menos de uma hora.
