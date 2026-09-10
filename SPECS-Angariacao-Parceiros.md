# SPECS — Angariação de Parceiros

**Versão:** 0.1 (estudo)
**Data:** 2026-09-09
**Subprojecto de:** `SPECS-CRM-Parceiros.md` · implementação em `CRM_IMPLEMENTACAO.md`
**Estado:** estudo para discussão. Nada implementado.

---

## 1. O problema, medido

O CRM está de pé e sabe vender leads. Tem **um parceiro**, de teste.

A Fase 1 da spec principal diz "angariação de parceiros nas categorias em falta" numa
linha, como se fosse trabalho comercial e não de sistema. É trabalho comercial — mas sem
sistema não escala, e sem escala o CRM é uma máquina cara sem quem compre.

O que se pretende, nas suas palavras: trazer parceiros **de forma dinâmica, automática,
massiva, controlada, com avaliação e dimensão**. Estas palavras puxam umas contra as
outras, e a maior parte deste documento é sobre onde as separar.

---

## 2. A ideia central: a procura não servida é o plano comercial

A tentação é fazer uma lista grande de transportadoras e contactá-las todas. É a pior
maneira de fazer isto, por três razões: gasta reputação, produz parceiros que não
recebem leads, e não diz por onde começar.

**A alternativa está dentro de casa.** Cada lead que não se conseguiu vender já diz,
com precisão, que parceiro falta:

```
lead de mudanças em Setúbal, não distribuída
  motivo: nenhum parceiro cobre esta consulta
  → falta: parceiro de mudanças com cobertura em Setúbal
  → valor perdido: 22 EUR
```

Trinta destas num mês transformam-se em:

> **Mudanças · Setúbal · 12 leads em 30 dias · 264 EUR não facturados**

Isso é ao mesmo tempo **a prioridade comercial** e **o argumento de venda ao parceiro**.
Nenhuma lista comprada dá isto.

### A lacuna a fechar primeiro

Hoje esse dado evapora-se. O `distribuir()` calcula `excluidos` — com o motivo de cada
parceiro que ficou de fora — devolve-o na resposta HTTP, e ninguém o grava.

**Primeiro passo de tudo o que vem a seguir:** persistir o resultado da distribuição
falhada na consulta, e derivar dele um quadro de procura por `categoria × zona`.

Sem isto, a angariação é adivinhação. Com isto, é uma lista ordenada por dinheiro.

---

## 3. Dimensionar: quantos parceiros são precisos

Mais parceiros não é melhor. A spec defende a **lead exclusiva** — um parceiro por lead.
Com dez parceiros numa célula onde chegam quatro leads por mês, cada um recebe menos de
uma. Um parceiro que recebe uma lead por mês desliga-se, não carrega saldo, e deixa de
responder. **Angariar a mais destrói a rede que se está a construir.**

O número certo sai de uma conta:

```
parceiros por célula = leads por mês na célula ÷ leads por parceiro por mês (alvo)
                       arredondado para cima, com mínimo de 2
```

O **mínimo de 2** é redundância, não ambição: com um só, uma lead morre sempre que ele
está sem saldo, de férias, ou recusa. O `distribuir()` já percorre a fila por ordem —
o segundo existe para haver fila.

### O ritmo alvo é por categoria, não global

O que faz um parceiro ficar não é um número: **é o tamanho do serviço**. Quem faz
mudanças a 1500 EUR vive bem com uma lead por mês. Quem move paletes a 80 EUR precisa de
uma por semana para o esforço valer a pena.

Isso já está dito na grelha de CPL da spec principal — as categorias caras são as de
ticket alto, e o preço da lead foi calculado a partir dele. O ritmo alvo é a mesma
informação vista do outro lado, e por isso **vive ao lado do CPL, em `crm_config`**, e
não numa constante no código.

| Categoria | CPL | Ticket | Ritmo alvo de partida |
|---|---|---|---|
| ADR / radioactivo | 60 € | alto, poucos operadores | 1 / mês |
| Temperatura controlada | 60 € | alto | 1 / mês |
| Mudanças | 22 € | alto, fecho razoável | 2 / mês |
| Transporte de viaturas | 20 € | médio, mercado competitivo | 3 / mês |
| Fora de gabarito | 11 € | mais baixo, volume | 4 / mês |
| Peso acima da capacidade | 11 € | mais baixo, volume | 4 / mês |

**Estes números são um ponto de partida, não uma medição.** Saem da lógica do ticket, não
de dados — a spec principal diz o mesmo sobre os preços (§5.3: não fixar preços de
secretária) e vale aqui igual. O que os corrige é o `crm_outcomes`: um parceiro que
recusa leads está saturado; um que deixa de responder está esquecido.

**Consequência prática:** a angariação tem um ponto de saturação por célula, e o sistema
deve dizer quando ele foi atingido — senão continua-se a angariar por inércia.

---

## 4. Onde estão os parceiros

Por ordem de qualidade do sinal, não de facilidade.

### 4.1 Quem já compra leads (o mais quente)

Empresas presentes na **Zaask, Fixando, Habitissimo** e semelhantes já provaram a única
coisa que interessa: **estão dispostas a pagar por contactos**. Não é preciso vender-lhes
o conceito, só a diferença — a spec principal já a tem escrita: lead exclusiva e
qualificada por pessoa, contra lead partilhada por cinco.

É a lista mais valiosa e a mais pequena.

### 4.2 Registos oficiais

Em Portugal, o transporte de mercadorias é actividade licenciada e o **IMT** mantém
registo dos operadores. Um registo oficial dá o que nenhuma outra fonte dá: **prova de
que a empresa existe, está activa e tem licença** — e, se o registo o expuser, a dimensão
da frota.

**Isto é uma hipótese, não um facto.** Não sei se esse registo é consultável em bloco
nem em que condições. É pergunta para a Fase 3, quando houver descoberta automática a
construir — antes disso não muda nada, porque as fases 0 a 2 não dependem de fonte
externa nenhuma.

### 4.3 Mapas e directórios

Google Places dá cobertura geográfica e, sobretudo, **avaliações públicas** — número de
opiniões e nota média. É o único sinal de qualidade disponível antes do primeiro contacto,
e serve para não convidar quem tem duas estrelas e cinquenta queixas.

### 4.4 Associações do sector

ANTRAM, ANTRAL e associações de mudanças. Menos volume, mais credibilidade, e abrem a
porta a uma abordagem institucional em vez de contacto a frio.

### 4.5 Quem já trabalha connosco

`partnerTariffs` tem a MRW. A operação tem subcontratados de confiança que já fazem
trabalho para a YourBox. **Alguns fazem categorias da Linha B e ninguém lhes perguntou.**
É a fonte de custo zero e é por onde se começa.

### 4.6 Entrada espontânea

Uma página pública "seja parceiro YourBox" converte pouco mas custa uma vez. Quem chega
por aí chega motivado, e entra no mesmo funil.

---

## 5. O que é preciso saber de cada um

A distinção que importa: **dimensão** é quanto aguenta; **capacidade** é o que sabe fazer.
As duas decidem coisas diferentes.

| | Serve para | Onde vive |
|---|---|---|
| **Capacidade** | se pode receber esta lead | `crm_capabilities` (existe) |
| **Dimensão** | quantas leads aguenta, e se vale a pena angariá-lo | novo |
| **Reputação** | se o queremos | novo, e depois `crm_outcomes` |

### Dimensão — o que medir

- **frota** (nº de viaturas) e **classe** (ligeiro / pesado / especial)
- **pessoas** ao serviço
- **cobertura real** — não o que dizem, o que fazem
- **capacidade mensal** declarada: quantos serviços deste tipo aguentam por mês

O último é o mais útil e o mais fácil de obter: pergunta-se. E é o que alimenta a conta
da secção 3 — um parceiro que aguenta 40 mudanças por mês vale por três que aguentam 5.

### Reputação — antes de haver histórico

Antes da primeira lead não há `crm_outcomes`, e o score nasce em 50 para toda a gente.
Nessa fase só há sinais externos: avaliações públicas, anos de actividade, licenças,
se atende o telefone. Servem para **decidir se se contacta**, não para ordenar a fila.

**Depois da primeira lead, o score interno manda e os sinais externos desaparecem.** O
que a empresa faz com as nossas leads vale mais do que o que os outros dizem dela.

---

## 6. O funil

> **Revisão de 10/09/2026.** Esta secção foi reescrita depois de o Helder precisar o
> ritmo real: os prospectos entram **um a um, à mão**, escolhidos por necessidade e por
> zona, quase sempre com contacto prévio. Cem ao fim de meses é bom resultado. A versão
> anterior desenhava para volume — cadências, paragens automáticas, subdomínio de envio
> próprio — e nada disso se aplica. O que sobra é mais exigente noutro sentido: com cem
> tentativas, cada uma tem de contar.

**Correcção mantida da versão 0.1:** propus uma colecção `crm_prospects` separada de
`crm_partners`. Estava errado. Um prospecto é um parceiro num estado inicial, e duas
colecções obrigariam a migrar o documento no momento em que ele adere — perdendo o
historial da angariação exactamente quando ele passa a valer alguma coisa.

### Os estados

```
prospect ──> contactado ──> registado ──> em_avaliacao ──> trial ──> ativo
    │             │              │              │                      │
    │             │              │              └──> descartado        └──> suspenso
    │             └──────────────┴──> opos_se (nunca mais recebe angariação)
    └──> descartado (com motivo escrito)
```

| Estado | O que aconteceu | Recebe leads? |
|---|---|---|
| `prospect` | está na ficha, ninguém falou com ele | não |
| `contactado` | houve chamada, email ou reunião | não |
| `registado` | preencheu o formulário e declarou capacidades | não |
| `em_avaliacao` | a gerente de conta está a verificar NIF, alvará, certificações | não |
| `trial` | a gastar as leads grátis | **sim** |
| `ativo` | paga da carteira | **sim** |
| `suspenso` | fora de circulação, sem perder o histórico | não |
| `descartado` | não serve, com motivo escrito | não |
| `opos_se` | pediu para não ser contactado | nunca |

**Só `trial` e `ativo` entram numa distribuição.** Até aqui o `procurarParceiros()` só
excluía `suspenso`, o que significa que um `prospect` com capacidades declaradas podia
receber uma lead paga antes de alguém ter falado com ele. Com um estado só isso quase não
acontecia; com seis estados intermédios passaria a ser inevitável.

`opos_se` é diferente de `descartado`: bloqueia **angariação**, não bloqueia
**transaccional**. Se essa empresa vier a ser parceira um dia por outra via, tem de
continuar a receber as leads que compra. São duas supressões distintas.

### A ficha do prospecto

Três coisas que o `crm_partners` não tem e que esta dinâmica exige.

**Vários contactos, não um.** Hoje há `contacto`, `telefone` e `email` — três campos
soltos que assumem uma pessoa só. A realidade tem quem atende o telefone, o gerente que
decide, e o endereço para onde enviar leads. Passa a haver uma lista, cada entrada com
nome, cargo, email, telefone, e uma marca de **quem recebe as leads** — que é a que a
distribuição usa.

**Uma linha do tempo de interacções, não só de emails.** Quase sempre houve uma chamada
antes do email. Se o cartão só souber registar emails, perde-se metade da história que
explica porque é que aquele prospecto vale a pena. Tipos: `chamada`, `email`, `reuniao`,
`nota`, `formulario`. O email é um tipo com particularidades — leva modelo, versão e
registo de envio.

**Atribuição e origem.** A que gerente de conta pertence, com data — sem isso duas ligam
à mesma empresa. E de onde veio: lista, indicação, contacto de feira, entrada espontânea.
Com angariação escolhida a dedo, a origem é conhecimento a sério: diz que fontes valem a
pena repetir.

### O email de apresentação, e o reenvio a pedido

O email de apresentação **não é uma campanha**. É enviado à mão, por decisão de uma
gerente de conta, e pode ser reenviado as vezes que forem precisas — mas por pedido, não
por insistência. O caso real: *"o meu gerente estava de férias e não viu, podem reenviar
para este endereço?"*

Daí três requisitos:

1. **O registo é por envio, não um contador.** Para quem, quando, por que operadora, e
   com que motivo. O motivo em texto livre é o registo da conversa — daqui a seis meses é
   o que explica porque é que aquela empresa levou três emails.
2. **O destinatário pode ser outro.** O reenvio vai muitas vezes para um endereço
   diferente do original, e esse endereço passa a ser um contacto da ficha.
3. **O texto fica versionado.** Se a carta melhorar, o histórico tem de dizer qual das
   versões é que aquela pessoa recebeu — senão, quando alguém responder a citá-la,
   ninguém sabe ao que está a responder. Mesmo princípio do guião de consentimento.

Não há limite de reenvios nem paragem automática. Um travão automático bloquearia
exactamente o caso legítimo que o justifica.

### O formulário tem de gerar capacidades

É o que decide se isto poupa trabalho ou se o cria.

Se "tipo de serviço" e "zonas cobertas" chegarem como texto livre, alguém tem de os
traduzir à mão para linhas de `crm_capabilities` — e enquanto isso não acontecer, **o
parceiro não recebe uma única lead**, porque a distribuição cruza capacidades, não
descrições.

O formulário usa o mesmo catálogo de categorias e os mesmos distritos do dashboard.
Preenchido, cria as capacidades sozinho, **inactivas**. A gerente de conta activa-as na
avaliação. O parceiro fica configurado no momento em que carrega em enviar; à operadora
sobra o julgamento, que é o trabalho que só ela pode fazer.

O link é assinado por prospecto e a página diz, no topo, **de que empresa se trata** —
para quem o receba por engano perceber logo, em vez de registar capacidades na ficha
errada.

### Verificar antes de entregar

Qualquer pessoa marca "ADR" num formulário. Uma lead de ADR vale €60 e envolve mercadoria
perigosa. O formulário pede **NIF** — serve para desduplicar, para confirmar que a empresa
existe e para facturar depois — e o **alvará do IMT**. Só as categorias com prova geram
capacidade activa; as outras ficam declaradas e adormecidas.

### A fila de trabalho não é ecrã novo

É a lista de parceiros que já existe, filtrada: *"os meus, contactados, com follow-up para
hoje"*. E a **ordem por que se procura empresas novas sai do quadro "Por servir"** — a
célula que diz "mudanças em Setúbal, 4 leads perdidas, €88" é quem se deve procurar a
seguir. Com angariação em massa isto era uma optimização; com cem tentativas ao longo de
meses é a disciplina central.

### O trial custa dinheiro

Cinco leads grátis a €22 são €110 de inventário por parceiro. Só deve passar a trial quem
cobre uma categoria e zona onde **há procura por servir** — caso contrário gasta-se
inventário a alimentar quem não tem leads para receber.

### O que ficou de fora, e porquê

| Ideia | Porque não |
|---|---|
| Subdomínio de envio próprio | Cem emails ao longo de meses não estragam a reputação de um domínio. Era infraestrutura para um problema que não vai existir. |
| Cadência com paragem automática | Bloquearia o reenvio a pedido, que é o caso que a justifica. |
| Importação em massa com deduplicação | Os prospectos entram um a um. Fica só a verificação por NIF ao criar, para duas gerentes de conta não inserirem a mesma empresa. |
| Rastreio de aberturas por pixel | Pouco fiável desde o pré-carregamento da Apple, e com implicações de RGPD. O clique no link do formulário é sinal a sério. |

Um requisito legal mantém-se mesmo a este volume: **todo o email de angariação leva um
mecanismo de oposição**, e respeitá-lo é permanente. Uma linha no rodapé chega.

**Nada muda de estado sem motivo escrito**, como nas consultas.

---

## 7. Automático até onde, e onde pára

Esta é a decisão central, e a resposta honesta é desconfortável: **"massivo" e
"automático" aplicam-se à preparação, não ao contacto.**

### O que deve ser automático

Descoberta, enriquecimento, deduplicação, qualificação, priorização pela procura não
servida, preparação da mensagem, e todo o acompanhamento **depois** de o parceiro dizer
que sim. Isto é trabalho de sistema e não tem risco.

### Onde tem de haver uma pessoa

**No primeiro contacto.** Três razões, e nenhuma é escrúpulo:

**A legal.** Comunicação electrónica não solicitada em Portugal tem regras (Lei 41/2004),
e o RGPD abrange contactos de empresários em nome individual — que são metade deste
sector. Envio em massa a frio é o tipo de coisa que gera queixa à CNPD e o custo dessa
queixa é maior do que qualquer parceiro que se ganhasse.

**A operacional.** O WhatsApp da YourBox é o mesmo número por onde o bot fala com
clientes. Envio a frio em volume faz-se bloquear, e perde-se o canal do negócio principal
para angariar para o secundário. **Isto sozinho chega para não o fazer.**

**A comercial.** O argumento é bom — "temos 12 pedidos por mês que não conseguimos
servir" — e é desperdiçado num email em massa. Numa chamada, converte.

### O desenho que respeita as três

O sistema prepara **filas de trabalho**, não campanhas:

> **Mudanças · Setúbal — 12 leads/mês por servir, 264 EUR**
> 6 prospectos qualificados, ordenados por dimensão e avaliação
> [ver ficha] [marcar contactado] [registar resposta]

Quem liga são as **gerentes de conta**. Isso muda três coisas no desenho:

**São várias.** A fila precisa de atribuição — sem ela, duas gerentes ligam ao mesmo
prospecto na mesma semana, e o prospecto conclui que a casa é desorganizada antes de
sequer ouvir a proposta. Um prospecto pertence a quem o pegou, com data.

**Têm outro trabalho.** A angariação é secundária à gestão de contas. A fila tem de ser
**interrompível**: pega-se, faz-se uma chamada, larga-se, e o sistema lembra do resto.
Uma ferramenta que exija uma sessão dedicada não vai ser usada.

**Já têm relações.** Uma gerente de conta conhece transportadoras — as que servem os
clientes dela. Esse contacto vale mais do que qualquer lista, e a ficha deve deixá-la
registá-lo directamente, sem passar por descoberta nenhuma.

Vale a pena registar **quem trouxe cada parceiro**. Não é vaidade: é o que permite saber
que abordagem funciona, e a casa já tem maquinaria de comissões por gerente de conta
(`users.profile.commissionUser`) se um dia isso fizer sentido também aqui.

O sistema faz o resto: guião, registo do contacto, follow-up agendado, e o onboarding
inteiro se a resposta for sim.

**Email a frio, se se usar**, é para o endereço institucional publicado (`geral@`),
com identificação clara, motivo concreto, saída fácil, e em volume baixo — dezenas por
semana, não milhares. Isso é prospecção; o resto é spam, e o resto queima a marca com
quem ainda nem nos conhece.

---

## 8. A outra entrada: o parceiro vem ter connosco

As gerentes de conta ligam quando podem. **A página não dorme.** Uma entrada de
auto-serviço não é alternativa à chamada — é o segundo canal, e o único que produz
enquanto ninguém está a trabalhar.

O desenho que os junta: **um funil, duas entradas.**

```
descoberto → enriquecido → qualificado → contactado ─┐
                                                     ├→ interessado → aderiu
   página pública "seja parceiro" ───────────────────┘
```

Quem chega pela página entra directamente em `interessado`: já disse que sim, ninguém
teve de o convencer. Daí em diante o caminho é o mesmo, e é o mesmo código.

### A assimetria que não se pode ignorar

Um prospecto que a gerente escolheu foi visto por alguém antes de ser contactado. **Um
que se inscreve sozinho não foi visto por ninguém** — e vai receber nome, telefone e
morada de clientes reais.

Por isso a entrada espontânea precisa de um **portão que a outra não precisa**: alguém
confirma que a empresa existe, tem a licença que diz ter, e é quem diz ser, antes da
primeira lead. Não é desconfiança — é a mesma razão pela qual a Linha B exige
autorização do cliente. Estamos a passar dados de pessoas a terceiros, e quem os recebe
tem de ser conhecido.

Na prática: quem se inscreve fica em `interessado` com um aviso na fila, e a adesão só
avança depois de verificado.

### O que a página precisa de ter

- o argumento, com números reais: *"recebemos X pedidos por mês de mudanças que não
  fazemos"* — o mesmo quadro de procura da §2, virado para fora
- o que se ganha e o que custa: lead exclusiva, CPL da categoria, 5 primeiras grátis
- o que se exige em troca: reportar o resultado (§6.1 da spec principal)
- o formulário de capacidades — que é o mesmo da §9, e é onde o parceiro faz o trabalho
  que hoje a operadora faz por ele

---

## 9. A adesão

O momento em que um "sim" se torna um parceiro que recebe leads. É onde a automação
volta a ganhar, e onde hoje não existe nada.

1. **Acordo de adesão** — com a cláusula que a spec principal já exige: reportar o
   resultado de cada lead em troca das 5 grátis (§6.1), e a base de RGPD para receber
   dados de clientes como responsável autónomo (§11 da spec, ainda por resolver).
2. **Declaração de capacidades** — a peça mais crítica do CRM, e hoje preenchida à mão
   pela operadora. Devia ser o parceiro a declará-la, num formulário próprio: é ele que
   sabe se tem ADR, e passa a ser dele a responsabilidade de o dizer certo.
3. **Carteira** — as 5 leads de trial não precisam de saldo. O saldo entra quando o
   trial mostrar que vale a pena, o que é a ordem certa: primeiro provar, depois cobrar.
4. **Primeira lead** — e a partir daqui o CRM já sabe o que fazer.

O ponto 2 é o que mais poupa trabalho e o que mais reduz erro. Um formulário de
capacidades para o parceiro é provavelmente a peça de maior retorno deste subprojecto.

---

## 10. O que medir

Sobre a angariação, e não sobre o CRM:

| Métrica | Diz o quê |
|---|---|
| Células com procura e **zero** parceiros | onde se está a perder dinheiro agora |
| Células **saturadas** | onde parar de angariar |
| Taxa de resposta ao primeiro contacto, por fonte | que fontes valem a pena |
| Conversão contactado → aderiu | se o argumento funciona |
| **Aderiu → primeira lead entregue** | se o onboarding trava |
| Sobrevivência aos 90 dias | se se está a angariar quem devia |

A quinta é a que costuma esconder o problema: parceiros que dizem sim e nunca recebem
nada, porque ninguém lhes preencheu as capacidades ou ficaram sem saldo.

---

## 11. Faseamento

**Fase 0 — ver a procura.** Persistir o resultado das distribuições falhadas e construir
o quadro `categoria × zona`. É pequeno, é dentro do que já existe, e sem isto o resto é
opinião. *Faz-se em horas, não em dias.*

**Fase 1 — os que já cá estão.** Perguntar aos subcontratados actuais quais destas
categorias fazem. Custo zero, confiança já estabelecida, e resolve provavelmente as
primeiras células.

**Fase 2 — funil no `crm_partners`.** Estados novos, gestão (notas, follow-up,
comentários, histórico), atribuição à gerente de conta, importação da lista, e a fila de
trabalho como filtro da listagem que já existe. Ela liga; o sistema lembra, regista e mede.

**Fase 3 — a segunda entrada.** Página pública, formulário de capacidades, verificação
antes da primeira lead. Sobe de lugar por três razões: produz enquanto ninguém trabalha,
não tem risco legal nenhum, e o formulário de capacidades tira à operação o trabalho que
hoje faz pelo parceiro — que é a peça de maior retorno deste subprojecto.

**Fase 4 — descoberta automática.** Fontes externas, enriquecimento, deduplicação,
qualificação. É o "massivo", na preparação. Fica para o fim porque é a que dá mais
trabalho, a única com risco legal, e a menos necessária se as três anteriores produzirem.

A ordem tem dois pontos que não são negociáveis:

- **A Fase 0 vem primeiro.** Tudo o resto depende de se ver a procura.
- **A Fase 1 vem antes de qualquer contacto a frio.** Angariar a frio quando há
  subcontratados por perguntar é trabalho a mais para resultado pior.

E uma inversão em relação ao rascunho anterior: **o auto-serviço vem antes da descoberta
automática.** Se as gerentes de conta estiverem ocupadas — e vão estar — é a página que
continua a produzir.

---

## 12. Riscos

**Angariar a mais.** O maior, e o menos evidente. Uma rede diluída não dá leads que
cheguem a ninguém, e parceiros que não recebem leads desaparecem — levando consigo a
credibilidade para uma segunda tentativa.

**Queimar o número de WhatsApp.** O canal do negócio principal. Não se arrisca por causa
do secundário.

**Contacto a frio em massa.** Queixa à CNPD, e a marca associada a spam junto de um
sector pequeno onde toda a gente se conhece.

**Dados de prospectos.** Nomes e contactos de pessoas em empresas pequenas são dados
pessoais. Guardá-los em `crm_partners` antes de haver relação nenhuma precisa de base
legal (interesse legítimo, com registo de oposição) e de prazo de retenção — um prospecto
contactado há dois anos que nunca respondeu não deve continuar em base. Não é o mesmo problema do §11 da spec
principal, mas é da mesma família — e desta vez sabemos disso antes de construir.

**Prometer volume que não existe.** Dizer a um parceiro "temos 12 leads por mês" e
entregar duas é a forma mais rápida de o perder. O número tem de vir do quadro de
procura, não do entusiasmo.

---

## 13. Questões em aberto

- **Os ritmos alvo da §3 estão perto?** Saem da lógica do ticket, não de medição. São a
  primeira coisa a corrigir com os primeiros parceiros reais de cada categoria.
- **Quanto tempo por semana é que as gerentes de conta têm para isto?** Dimensiona a
  fila e decide se a Fase 3 tem de vir ainda mais cedo.
- **Quem verifica um parceiro que se inscreve sozinho?** É trabalho novo, e sem ele a
  segunda entrada não pode abrir.
- **O acordo de adesão existe?** Precisa de redacção jurídica, e há-de partilhar
  fundamentos com a base legal da Linha B que continua por resolver.
- **Uma célula é `categoria × distrito` ou algo mais fino?** Distrito é o que a triagem
  já produz (`zonaDeMorada`), e provavelmente chega. Vale a pena confirmar com dados.
