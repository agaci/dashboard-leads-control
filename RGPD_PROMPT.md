# Prompt para o Claude (web) — actualizar textos legais (RGPD) da YourBox

> Cola o texto abaixo no Claude. Anexa também os teus documentos actuais (Política de
> Privacidade, Política de Cookies, Termos e Condições) se os tiveres, para ele actualizar
> em vez de criar do zero. **Nota:** o resultado deve ser revisto por um jurista antes de publicar.

---

És um jurista especializado em proteção de dados (RGPD / Regulamento (UE) 2016/679) e direito
do consumidor em **Portugal**. Vais **rever e actualizar** os textos legais do site da **YourBox
(estafetas e transportes)** — `yourbox.com.pt` — para refletir novas funcionalidades de recolha
de dados. Escreve em **português de Portugal**, claro e acessível, mas juridicamente correcto.

## Contexto do negócio
A YourBox é uma transportadora/estafetas. O site tem uma landing page com um **formulário em
formato "quiz"** (passo a passo) onde o visitante pede um **orçamento de transporte**. Os dados
fluem para um backoffice interno (dashboard de leads) e para a plataforma de gestão da YourBox.

## Dados pessoais que passam a ser recolhidos (novidades a cobrir)
1. **Identificação e contacto:** nome, telemóvel, email.
2. **Moradas:** local de recolha e de entrega (texto, com autocompletar do Google Places).
3. **Detalhes da carga:** número de volumes, peso, dimensões, tipo de material, se está embalado.
4. **Urgência** do serviço pretendido.
5. **Localização aproximada por IP** — cidade/região/país e coordenadas aproximadas, obtida
   **automaticamente** no início do quiz (serviço externo de geolocalização por IP).
6. **Localização precisa (GPS)** — **apenas se** o utilizador carregar no botão de localização e
   **autorizar** no browser (coordenadas exactas + morada). É opcional e consentida.
7. **Identificador de sessão** guardado no `sessionStorage` do browser (`yb_quiz_sid`).
8. **Cookie de teste A/B** (`variant`) que determina qual versão da página é mostrada.
9. **Progresso passo-a-passo no quiz** (cada passo e os valores introduzidos) enviado em
   **tempo quase real** para o backoffice, mesmo que o utilizador **não conclua**.
10. **Dados de navegação/analytics** via Google Tag Manager / Google Analytics (se aceites).

## Finalidades do tratamento
- Calcular e preparar o **orçamento** e contactar o cliente para concluir o pedido (pré-contratual).
- **Reengajamento de pedidos abandonados:** se o visitante fornecer **nome + um contacto**
  (telefone ou email) e **não concluir** o quiz, a YourBox pode enviar **uma mensagem** (WhatsApp
  e/ou email) a oferecer ajuda para terminar o orçamento.
- Melhoria do serviço e **testes A/B** das versões da página.
- Localização para **contexto comercial/logístico**.

## Subcontratantes / terceiros que recebem ou tratam dados
- **Google** (Maps/Places para autocompletar e geocodificar moradas; Tag Manager/Analytics).
- **Serviço de geolocalização por IP** (terceiro; ex.: geojs.io) — recebe o IP do visitante.
- **OpenStreetMap** (mosaicos de mapa, usados só no backoffice).
- **Resend** (envio de emails transacionais/reengajamento).
- **Evolution API / WhatsApp** (envio de mensagens).
- **Fornecedor de alojamento da base de dados** (MongoDB / nodechef).
- **Plataforma de gestão YourBox** (recebe a lead final).
> Vários destes fornecedores estão **fora da UE (EUA)** — trata as **transferências internacionais**
> (Cláusulas Contratuais-Tipo / EU-US Data Privacy Framework).

## O que tens de produzir (3 documentos, em PT-PT)
1. **Política de Privacidade** — cobrindo: responsável pelo tratamento e contactos (incl. DPO se
   aplicável); categorias de dados (incluindo as novidades 1–10); finalidades e **bases legais**
   para cada uma; **localização precisa só com consentimento**; **reengajamento** com a sua base
   legal (interesse legítimo de quem iniciou o pedido vs. consentimento) e **direito de oposição/
   opt-out**; lista de subcontratantes/terceiros; transferências internacionais; prazos de
   **conservação**; **direitos do titular** (acesso, retificação, apagamento, oposição,
   portabilidade, limitação, retirar consentimento, reclamar à CNPD); decisões automatizadas (não há).
2. **Política de Cookies e Armazenamento Local** — cobrindo o `sessionStorage` (`yb_quiz_sid`), o
   **cookie `variant`** (teste A/B — explicar finalidade e duração: 30 dias), cookies de
   analytics/marketing (Google), e o **banner de consentimento** (necessários sempre activos;
   analíticos/marketing/funcionais só com consentimento).
3. **Termos e Condições** — cobrindo: que o **orçamento é uma estimativa** sujeita a confirmação;
   que a YourBox **contacta** o utilizador para concluir; que pode haver **mensagem de seguimento**
   se o pedido ficar incompleto; e remissão para a Política de Privacidade.

## Requisitos de redação
- Linguagem clara, em PT-PT; secções com títulos; tom profissional mas legível.
- Destaca claramente os pontos sensíveis para o cliente: **localização (aproximada por IP vs.
  precisa por GPS consentida)** e **as mensagens de reengajamento** (e como recusar/opor-se).
- No fim de cada documento, acrescenta um aviso: *"Este texto é um modelo e deve ser revisto por
  um advogado/jurista antes de publicação."*
- Pergunta-me, no início, **apenas** os dados que faltam para preencher (nome legal da empresa,
  NIF, morada da sede, email de contacto de privacidade, prazo de conservação pretendido, se tem
  DPO) — e gera os documentos com marcadores `[...]` onde faltar informação.
