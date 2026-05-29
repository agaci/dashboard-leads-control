/**
 * YOURBOX — Ghost Chat Demo: Diálogos
 *
 * Ficheiro editável. Cada entrada em YOURBOX_DEMO_DIALOGUES é um diálogo
 * independente. O motor selecciona um aleatoriamente a cada ciclo.
 *
 * Tipos de step:
 *   { type: 'bot',     text: '...' }
 *   { type: 'user',    text: '...' }
 *   { type: 'typing',  ms: 1200 }
 *   { type: 'result',  prices: [{label, value}, ...], seconds: 8 }
 */

window.YOURBOX_DEMO_DIALOGUES = [

  // ── 1. Moto 1h · Lisboa → Porto · documentos urgentes ──────────────────────
  {
    label: 'Lisboa → Porto · Moto · 1h',
    steps: [
      { type: 'bot',    text: 'Olá! De onde recolhemos e para onde entregamos?' },
      { type: 'user',   text: 'Lisboa → Porto. Envelope com contratos — é urgente.' },
      { type: 'typing', ms: 1100 },
      { type: 'bot',    text: 'Para Lisboa–Porto com moto: Express 1h ou Standard 4h?' },
      { type: 'user',   text: '1 hora, preciso já.' },
      { type: 'typing', ms: 1400 },
      { type: 'result', prices: [{ label: 'Express 1h', value: '€28' }, { label: 'Standard 4h', value: '€19' }], seconds: 9 },
      { type: 'user',   text: 'Confirmo o Express 1h.' },
      { type: 'typing', ms: 700 },
      { type: 'bot',    text: 'Mota a caminho! Chega aí em menos de 10 minutos.' },
    ],
  },

  // ── 2. Auto 4h · Porto → Lisboa · peças electrónicas ───────────────────────
  {
    label: 'Porto → Lisboa · Auto · 4h',
    steps: [
      { type: 'bot',    text: 'Bom dia! Qual a origem, destino e peso da encomenda?' },
      { type: 'user',   text: 'Porto → Lisboa. Peças electrónicas para reparação, 8 kg.' },
      { type: 'typing', ms: 1200 },
      { type: 'bot',    text: 'Auto disponível. Para 8 kg: 1h ou 4h?' },
      { type: 'user',   text: '4 horas chega. Qual o preço?' },
      { type: 'typing', ms: 1300 },
      { type: 'result', prices: [{ label: 'Express 1h', value: '€52' }, { label: 'Standard 4h', value: '€34' }], seconds: 7 },
      { type: 'user',   text: 'Standard 4h. Como faço o pagamento?' },
      { type: 'typing', ms: 800 },
      { type: 'bot',    text: 'Enviamos link de pagamento por SMS. Simples e seguro!' },
    ],
  },

  // ── 3. Furgão C1 1h · Lisboa → Setúbal · equipamento para obra ─────────────
  {
    label: 'Lisboa → Setúbal · Furgão C1 · 1h',
    steps: [
      { type: 'bot',    text: 'Bom dia! Qual a rota e que tipo de carga precisa transportar?' },
      { type: 'user',   text: 'Lisboa → Setúbal. Equipamento informático, cerca de 80 kg.' },
      { type: 'typing', ms: 1000 },
      { type: 'bot',    text: 'Para 80 kg temos Furgão Classe 1. Precisa em 1h ou 4h?' },
      { type: 'user',   text: '1 hora — é para uma instalação que não pode esperar.' },
      { type: 'typing', ms: 1500 },
      { type: 'result', prices: [{ label: 'Express 1h', value: '€38' }, { label: 'Standard 4h', value: '€24' }], seconds: 8 },
      { type: 'user',   text: 'Express 1h, confirmo agora.' },
      { type: 'typing', ms: 700 },
      { type: 'bot',    text: 'Furgão confirmado! Tracking em tempo real pelo link que enviamos.' },
    ],
  },

  // ── 4. Moto 1h · Braga → Porto · amostras laboratoriais ────────────────────
  {
    label: 'Braga → Porto · Moto · 1h',
    steps: [
      { type: 'bot',    text: 'Olá! Em que posso ajudar com a sua entrega?' },
      { type: 'user',   text: 'Braga → Porto. Amostras para análise laboratorial, urgente.' },
      { type: 'typing', ms: 1100 },
      { type: 'bot',    text: 'Entendido. Moto disponível para Braga–Porto. Express 1h possível. Qual o preço pretende?' },
      { type: 'user',   text: 'Quanto custa o Express 1h?' },
      { type: 'typing', ms: 1200 },
      { type: 'result', prices: [{ label: 'Express 1h', value: '€22' }, { label: 'Standard 4h', value: '€15' }], seconds: 6 },
      { type: 'user',   text: 'Ótimo. Express 1h, obrigado pela rapidez!' },
      { type: 'typing', ms: 600 },
      { type: 'bot',    text: 'Estafeta já saiu! Chega ao laboratório em menos de 1 hora.' },
    ],
  },

  // ── 5. 24h Nacional · Lisboa → Faro · e-commerce pesada ───────────────────
  {
    label: 'Lisboa → Faro · 24h Nacional',
    steps: [
      { type: 'bot',    text: 'Olá! Diga-me de onde e para onde vai a encomenda.' },
      { type: 'user',   text: 'Lisboa → Faro. 35 kg, encomenda de loja online.' },
      { type: 'typing', ms: 1300 },
      { type: 'bot',    text: 'Para 35 kg e distância Lisboa–Faro: serviço 24h Nacional. Recolha hoje, entrega amanhã.' },
      { type: 'user',   text: 'Perfeito. E o preço?' },
      { type: 'typing', ms: 1600 },
      { type: 'result', prices: [{ label: '24h Nacional', value: '€18' }, { label: '48h Eco', value: '€12' }], seconds: 11 },
      { type: 'user',   text: '24h Nacional, confirmo.' },
      { type: 'typing', ms: 800 },
      { type: 'bot',    text: 'Recolha confirmada para hoje antes das 16h. Entrega amanhã garantida.' },
    ],
  },

  // ── 6. Auto 1h · Lisboa → Cascais · contrato de negócios ──────────────────
  {
    label: 'Lisboa → Cascais · Auto · 1h',
    steps: [
      { type: 'bot',    text: 'Bom dia! Como posso ajudar na sua entrega?' },
      { type: 'user',   text: 'Preciso de levar um contrato assinado de Lisboa a Cascais — já!' },
      { type: 'typing', ms: 900 },
      { type: 'bot',    text: 'Lisboa–Cascais em 1h com Auto. A ver preço...' },
      { type: 'typing', ms: 1300 },
      { type: 'result', prices: [{ label: 'Express 1h', value: '€16' }, { label: 'Standard 4h', value: '€11' }], seconds: 5 },
      { type: 'user',   text: 'Express 1h. Pode recolher no Marquês de Pombal?' },
      { type: 'typing', ms: 700 },
      { type: 'bot',    text: 'Sim! Morada confirmada. Estafeta chega em 15 minutos.' },
    ],
  },

  // ── 7. Moto 4h · Porto → Aveiro · material gráfico ─────────────────────────
  {
    label: 'Porto → Aveiro · Moto · 4h',
    steps: [
      { type: 'bot',    text: 'Olá! Qual o percurso e o tipo de carga?' },
      { type: 'user',   text: 'Porto → Aveiro. Material gráfico para exposição, 1,5 kg.' },
      { type: 'typing', ms: 1000 },
      { type: 'bot',    text: 'Moto para Porto–Aveiro. Que urgência precisa — 1h ou 4h?' },
      { type: 'user',   text: '4 horas é suficiente. Quanto custa?' },
      { type: 'typing', ms: 1400 },
      { type: 'result', prices: [{ label: 'Express 1h', value: '€19' }, { label: 'Standard 4h', value: '€13' }], seconds: 7 },
      { type: 'user',   text: 'Standard 4h. Obrigado.' },
      { type: 'typing', ms: 700 },
      { type: 'bot',    text: 'Entrega agendada! Acompanhe pelo link de tracking que enviamos.' },
    ],
  },

  // ── 8. Furgão C2 4h · Lisboa → Coimbra · mobiliário empresa ────────────────
  {
    label: 'Lisboa → Coimbra · Furgão C2 · 4h',
    steps: [
      { type: 'bot',    text: 'Bom dia! Qual a rota e o que precisamos transportar?' },
      { type: 'user',   text: 'Lisboa → Coimbra. Mobiliário de escritório, uns 200 kg.' },
      { type: 'typing', ms: 1200 },
      { type: 'bot',    text: '200 kg requer Furgão Classe 2. Lisboa–Coimbra: 4h ou 1h?' },
      { type: 'user',   text: '4 horas está bem. Qual o valor?' },
      { type: 'typing', ms: 1500 },
      { type: 'result', prices: [{ label: 'Express 1h', value: '€68' }, { label: 'Standard 4h', value: '€44' }], seconds: 10 },
      { type: 'user',   text: 'Standard 4h. Perfeito.' },
      { type: 'typing', ms: 800 },
      { type: 'bot',    text: 'Furgão reservado! Confirmação e data exacta chegam por SMS.' },
    ],
  },

  // ── 9. Auto 1h · Setúbal → Lisboa · peças de reposição ─────────────────────
  {
    label: 'Setúbal → Lisboa · Auto · 1h',
    steps: [
      { type: 'bot',    text: 'Olá! Para onde vai a encomenda e qual o peso?' },
      { type: 'user',   text: 'Setúbal → Lisboa. Peças de reposição para máquina, 25 kg.' },
      { type: 'typing', ms: 1100 },
      { type: 'bot',    text: 'Auto para 25 kg. Setúbal–Lisboa: 1h ou 4h?' },
      { type: 'user',   text: '1 hora! Máquina parada é prejuízo.' },
      { type: 'typing', ms: 1300 },
      { type: 'result', prices: [{ label: 'Express 1h', value: '€22' }, { label: 'Standard 4h', value: '€15' }], seconds: 6 },
      { type: 'user',   text: 'Express 1h, sem hesitar!' },
      { type: 'typing', ms: 700 },
      { type: 'bot',    text: 'Estafeta a sair agora! Previsão: menos de 1h na sua porta.' },
    ],
  },

  // ── 10. Moto 1h · Coimbra → Porto · medicação urgente ──────────────────────
  {
    label: 'Coimbra → Porto · Moto · 1h',
    steps: [
      { type: 'bot',    text: 'Bom dia! Que entrega posso ajudar a organizar?' },
      { type: 'user',   text: 'Medicação urgente de Coimbra para Porto. Volume pequeno, 0,5 kg.' },
      { type: 'typing', ms: 1000 },
      { type: 'bot',    text: 'Mota disponível para Coimbra–Porto. Express 1h ou Standard 4h?' },
      { type: 'user',   text: 'Urgente — 1 hora, obrigatório.' },
      { type: 'typing', ms: 1200 },
      { type: 'result', prices: [{ label: 'Express 1h', value: '€24' }, { label: 'Standard 4h', value: '€16' }], seconds: 7 },
      { type: 'user',   text: 'Express 1h. Quando chega o estafeta?' },
      { type: 'typing', ms: 700 },
      { type: 'bot',    text: 'Em 10–15 minutos está à porta. Tracking por SMS já enviado.' },
    ],
  },

];
