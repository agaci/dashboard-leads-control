/**
 * YourBox Web Chat B — variante com dados de contacto pré-preenchidos
 * O nome, email e telefone são capturados no formulário antes do chat.
 * Este script pre-seed esses dados e responde automaticamente quando o
 * bot os solicita, tornando o fluxo invisível para o utilizador.
 */

(function () {
  'use strict';

  const API_BASE = 'http://localhost:3000'; // dev local
  //const API_BASE = 'https://leads.comgo.pt'; // producao
  const POLL_INTERVAL = 3000;
  const TYPING_SPEED_MS = 11;
  const AUTO_RESPOND_DELAY_MS = 750; // pausa antes de auto-responder (naturalidade)

  let chatState = {
    conversationId: null,
    step: null,
    polling: null,
    lastMsgCount: 0,
    sending: false,
    typing: false,
    preSeededNome: null,
    preSeededEmail: null, // null = não auto-responder; '' = responder 'não'
    autoRespondPending: false,
  };

  // ── Helpers de DOM ───────────────────────────────────────────────────────────

  function mdToHtml(text) {
    return text
      .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
      .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
      .replace(/_([^_\n]+)_/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  function appendBubble(role, text) {
    const area = document.getElementById('ybChatMessages');
    if (!area) return;
    const wrap = document.createElement('div');
    wrap.className = 'yb-msg yb-msg--' + role;
    const bubble = document.createElement('div');
    bubble.className = 'yb-bubble';
    bubble.innerHTML = mdToHtml(text);
    wrap.appendChild(bubble);
    area.appendChild(wrap);
    area.scrollTop = area.scrollHeight;
  }

  function appendBubbleTyped(text, onDone) {
    const area = document.getElementById('ybChatMessages');
    if (!area) return;
    const wrap = document.createElement('div');
    wrap.className = 'yb-msg yb-msg--bot';
    const bubble = document.createElement('div');
    bubble.className = 'yb-bubble';
    bubble.textContent = '';
    wrap.appendChild(bubble);
    area.appendChild(wrap);
    area.scrollTop = area.scrollHeight;

    chatState.typing = true;
    let i = 0, accumulated = '';

    function typeNext() {
      if (i >= text.length) {
        bubble.innerHTML = mdToHtml(text);
        area.scrollTop = area.scrollHeight;
        chatState.typing = false;
        if (onDone) onDone();
        return;
      }
      const chunk = text.slice(i, i + (Math.random() > 0.7 ? 2 : 1));
      accumulated += chunk;
      i += chunk.length;
      bubble.textContent = accumulated;
      if (i % 5 === 0 || i >= text.length) area.scrollTop = area.scrollHeight;
      setTimeout(typeNext, TYPING_SPEED_MS + (Math.random() > 0.85 ? 30 : 0));
    }
    typeNext();
  }

  function showTyping() {
    const area = document.getElementById('ybChatMessages');
    if (!area || document.getElementById('ybTyping')) return;
    const el = document.createElement('div');
    el.id = 'ybTyping';
    el.className = 'yb-msg yb-msg--bot';
    el.innerHTML = '<div class="yb-bubble yb-typing"><span></span><span></span><span></span></div>';
    area.appendChild(el);
    area.scrollTop = area.scrollHeight;
  }

  function removeTyping() {
    const el = document.getElementById('ybTyping');
    if (el) el.remove();
  }

  function showQuickReplies(replies) {
    const container = document.getElementById('ybQuickReplies');
    if (!container || !replies || !replies.length) return;
    container.innerHTML = '';
    replies.forEach(function (r) {
      const btn = document.createElement('button');
      btn.className = 'yb-qr';
      btn.textContent = r;
      btn.onclick = function () {
        container.innerHTML = '';
        sendMessage(r);
      };
      container.appendChild(btn);
    });
  }

  function setInputDisabled(disabled) {
    const input = document.getElementById('ybChatInput');
    const btn = document.getElementById('ybChatSend');
    if (input) input.disabled = disabled;
    if (btn) btn.disabled = disabled;
  }

  function showFinalState(step) {
    var qr = document.getElementById('ybQuickReplies'); if (qr) qr.innerHTML = '';
    const footer = document.getElementById('ybChatFooter');
    if (step === 'ESCALATED_TO_HUMAN') {
      // Manter input activo — utilizador pode enviar mensagem adicional ao agente
      setInputDisabled(false);
      if (footer) footer.innerHTML = '<p class="yb-done yb-done--escalated">Um agente vai entrar em contacto. Pode deixar uma mensagem adicional aqui.</p>';
      return;
    }
    setInputDisabled(true);
    stopPolling();
    if (!footer) return;
    if (step === 'LEAD_REGISTERED') {
      footer.innerHTML = '<p class="yb-done">Obrigado! A nossa equipa vai entrar em contacto brevemente.</p>';
    } else {
      footer.innerHTML = '<p class="yb-done">Conversa encerrada.</p>';
    }
  }

  // ── Gestão de step ───────────────────────────────────────────────────────────
  // Chamado após cada resposta do bot — trata estados finais, pagamento e quick replies.
  // Nota: o servidor já salta COLLECTING_NOME e COLLECTING_EMAIL quando os dados
  // estão pré-preenchidos (web-b), por isso estes passos normalmente não aparecem.
  // O auto-respond abaixo serve apenas de fallback caso o pre-seed não tenha funcionado.

  function handleNewStep(step, quickReplies) {
    chatState.step = step;

    const done = ['LEAD_REGISTERED', 'CLOSED', 'ESCALATED_TO_HUMAN'];
    if (done.includes(step)) { showFinalState(step); return; }

    // AWAITING_PAYMENT — chat fica aberto, utilizador pode acompanhar
    if (step === 'AWAITING_PAYMENT') {
      var qr = document.getElementById('ybQuickReplies'); if (qr) qr.innerHTML = '';
      return;
    }

    // Fallback: se por algum motivo o servidor pedir nome/email já pré-preenchidos
    if (step === 'COLLECTING_NOME' && chatState.preSeededNome && !chatState.autoRespondPending) {
      chatState.autoRespondPending = true;
      setTimeout(function () { chatState.autoRespondPending = false; sendMessage(chatState.preSeededNome); }, AUTO_RESPOND_DELAY_MS);
      return;
    }
    if (step === 'COLLECTING_EMAIL' && chatState.preSeededEmail !== null && !chatState.autoRespondPending) {
      chatState.autoRespondPending = true;
      var emailToSend = chatState.preSeededEmail.trim() || 'não';
      setTimeout(function () { chatState.autoRespondPending = false; sendMessage(emailToSend); }, AUTO_RESPOND_DELAY_MS);
      return;
    }

    if (quickReplies && quickReplies.length) showQuickReplies(quickReplies);
  }

  // ── Polling ──────────────────────────────────────────────────────────────────

  function startPolling() {
    stopPolling();
    chatState.polling = setInterval(pollMessages, POLL_INTERVAL);
  }

  function stopPolling() {
    if (chatState.polling) { clearInterval(chatState.polling); chatState.polling = null; }
  }

  async function pollMessages() {
    if (!chatState.conversationId || chatState.sending || chatState.typing || chatState.autoRespondPending) return;
    try {
      const res = await fetch(API_BASE + '/api/conversations/' + chatState.conversationId);
      const data = await res.json();
      if (!data.success) return;
      const conv = data.conversation;
      const msgs = conv.history || [];

      if (msgs.length > chatState.lastMsgCount) {
        const newMsgs = msgs.slice(chatState.lastMsgCount);
        chatState.lastMsgCount = msgs.length;

        let chain = Promise.resolve();
        newMsgs.forEach(function (m) {
          chain = chain.then(function () {
            return new Promise(function (resolve) {
              if (m.role !== 'lead') {
                appendBubbleTyped(m.text, resolve);
              } else {
                appendBubble('lead', m.text);
                resolve();
              }
            });
          });
        });

        chain.then(function () { handleNewStep(conv.step, []); });
      }
    } catch (_) {}
  }

  // ── Envio de mensagem ────────────────────────────────────────────────────────

  async function sendMessage(text) {
    if (!text || !text.trim() || chatState.sending || chatState.typing) return;
    if (!chatState.conversationId) return;

    const msg = text.trim();
    chatState.sending = true;
    setInputDisabled(true);
    var qr = document.getElementById('ybQuickReplies'); if (qr) qr.innerHTML = '';

    appendBubble('lead', msg);
    showTyping();

    try {
      const res = await fetch(API_BASE + '/api/conversations/' + chatState.conversationId + '/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: msg }),
      });
      const data = await res.json();
      removeTyping();

      if (!data.success && data.step) { showFinalState(data.step); return; }

      if (data.message) {
        chatState.lastMsgCount += 2;
        appendBubbleTyped(data.message, function () {
          handleNewStep(data.step, data.quickReplies || []);
        });
      } else {
        handleNewStep(data.step, data.quickReplies || []);
      }
    } catch (e) {
      removeTyping();
      appendBubble('bot', 'Erro de ligação. Por favor tente novamente.');
    } finally {
      chatState.sending = false;
      setInputDisabled(false);
      const input = document.getElementById('ybChatInput');
      if (input) { input.value = ''; input.focus(); }
    }
  }

  // ── Iniciar conversa ─────────────────────────────────────────────────────────

  window.ybChatB = {
    /**
     * @param {object} formData
     * @param {string} formData.nome
     * @param {string} formData.email        — pode ser vazio
     * @param {string} formData.telemovel    — número PT (ex: "912345678")
     * @param {string} formData.origem
     * @param {string} formData.destino
     * @param {string} formData.viatura
     * @param {string} formData.urgencia
     */
    start: async function (formData) {
      chatState.preSeededNome = formData.nome || null;
      // email pode ser string vazia (utilizador não preencheu) → auto-responde 'não'
      chatState.preSeededEmail = typeof formData.email === 'string' ? formData.email : null;

      const chatSection = document.getElementById('ybChatSection');
      if (chatSection) chatSection.style.display = 'block';

      const area = document.getElementById('ybChatMessages');
      if (area) area.innerHTML = '';
      var qr = document.getElementById('ybQuickReplies'); if (qr) qr.innerHTML = '';

      showTyping();

      try {
        const res = await fetch(API_BASE + '/api/conversations/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            origem:    formData.origem,
            destino:   formData.destino,
            viatura:   formData.viatura,
            urgencia:  formData.urgencia,
            telemovel: formData.telemovel,
            nome:      formData.nome  || undefined,
            email:     formData.email || undefined,
          }),
        });
        const data = await res.json();
        removeTyping();

        if (!data.success) {
          appendBubble('bot', 'Erro ao ligar ao assistente: ' + (data.error || 'resposta inválida') + '. Tente novamente ou contacte-nos.');
          setInputDisabled(false);
          return;
        }

        chatState.conversationId = data.conversationId;
        chatState.step = data.step;
        chatState.lastMsgCount = 1;

        appendBubbleTyped(data.message, function () {
          handleNewStep(data.step, data.quickReplies || []);
          setInputDisabled(false);
          var inp = document.getElementById('ybChatInput');
          if (inp) inp.focus();
        });

        startPolling();
      } catch (e) {
        console.error('[YB Chat B] start error:', e);
        removeTyping();
        appendBubble('bot', 'Não foi possível ligar ao assistente. Verifique a sua ligação e tente novamente.');
        setInputDisabled(false);
      }
    },
  };

  // ── Listeners de teclado/clique ──────────────────────────────────────────────

  function initChatListeners() {
    const input = document.getElementById('ybChatInput');
    const btn = document.getElementById('ybChatSend');
    if (input) {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage(input.value);
        }
      });
    }
    if (btn) {
      btn.addEventListener('click', function () {
        var inp = document.getElementById('ybChatInput');
        if (inp) sendMessage(inp.value);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChatListeners);
  } else {
    initChatListeners();
  }
})();
