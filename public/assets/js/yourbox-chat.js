/**
 * YourBox Web Chat Widget
 * Conecta ao backend Next.js — sem dependencias externas
 */

(function () {
  'use strict';

  // Apontar para o servidor Next.js local (alterar em producao)
  const API_BASE = 'http://localhost:3000';
  const POLL_INTERVAL = 3000; // ms

  let chatState = {
    conversationId: null,
    sessionId: null,
    step: null,
    polling: null,
    lastMsgCount: 0,
    sending: false,
  };

  // Gerar sessionId fresco a cada conversa (evita reutilizar estado antigo)
  function newSessionId() {
    return 'web_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
  }

  // Converter markdown simples para HTML
  function mdToHtml(text) {
    return text
      .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
      .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
      .replace(/_([^_\n]+)_/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  // Adicionar bolha de mensagem ao chat
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

  // Mostrar indicador "a escrever..."
  function showTyping() {
    const area = document.getElementById('ybChatMessages');
    if (!area) return;
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

  // Mostrar botoes de resposta rapida
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

  // Bloquear/desbloquear input
  function setInputDisabled(disabled) {
    const input = document.getElementById('ybChatInput');
    const btn = document.getElementById('ybChatSend');
    if (input) input.disabled = disabled;
    if (btn) btn.disabled = disabled;
  }

  // Mostrar estado final (lead registada / escalada)
  function showFinalState(step) {
    document.getElementById('ybQuickReplies').innerHTML = '';
    const footer = document.getElementById('ybChatFooter');

    if (step === 'ESCALATED_TO_HUMAN') {
      // Manter input e polling — utilizador pode escrever ao agente humano
      if (footer) footer.innerHTML = '<p class="yb-done yb-done--escalated">A falar com um agente. Pode continuar a escrever aqui.</p>';
      return;
    }

    // Nos outros estados finais: bloquear input e parar polling
    setInputDisabled(true);
    stopPolling();
    if (!footer) return;
    if (step === 'LEAD_REGISTERED') {
      footer.innerHTML = '<p class="yb-done">Obrigado! A nossa equipa vai entrar em contacto brevemente.</p>';
    } else {
      footer.innerHTML = '<p class="yb-done">Conversa encerrada.</p>';
    }
  }

  // Polling — verificar novas mensagens
  function startPolling() {
    stopPolling();
    chatState.polling = setInterval(pollMessages, POLL_INTERVAL);
  }

  function stopPolling() {
    if (chatState.polling) {
      clearInterval(chatState.polling);
      chatState.polling = null;
    }
  }

  async function pollMessages() {
    if (!chatState.conversationId) return;
    try {
      const res = await fetch(API_BASE + '/api/conversations/' + chatState.conversationId);
      const data = await res.json();
      if (!data.success) return;
      const conv = data.conversation;
      const msgs = conv.history || [];
      // Sincronizar mensagens novas
      if (msgs.length > chatState.lastMsgCount) {
        const area = document.getElementById('ybChatMessages');
        if (area) area.innerHTML = '';
        msgs.forEach(function (m) {
          var role = m.role === 'lead' ? 'lead' : 'bot';
          appendBubble(role, m.text);
        });
        chatState.lastMsgCount = msgs.length;
      }
      // Verificar estado final
      const done = ['LEAD_REGISTERED', 'CLOSED', 'ESCALATED_TO_HUMAN'];
      if (done.includes(conv.step)) {
        showFinalState(conv.step);
      }
    } catch (_) {}
  }

  // Enviar mensagem
  async function sendMessage(text) {
    if (!text || !text.trim() || chatState.sending) return;
    if (!chatState.conversationId) return;

    const msg = text.trim();
    chatState.sending = true;
    setInputDisabled(true);
    document.getElementById('ybQuickReplies').innerHTML = '';

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

      if (!data.success && data.step) {
        showFinalState(data.step);
        return;
      }

      if (data.message) {
        appendBubble('bot', data.message);
        chatState.lastMsgCount += 2;
      }

      if (data.quickReplies && data.quickReplies.length) {
        showQuickReplies(data.quickReplies);
      }

      const done = ['LEAD_REGISTERED', 'ESCALATED_TO_HUMAN', 'CLOSED'];
      if (done.includes(data.step)) {
        showFinalState(data.step);
        return;
      }
    } catch (e) {
      removeTyping();
      appendBubble('bot', 'Erro de ligacao. Por favor tente novamente.');
    } finally {
      chatState.sending = false;
      setInputDisabled(false);
      const input = document.getElementById('ybChatInput');
      if (input) { input.value = ''; input.focus(); }
    }
  }

  // Iniciar conversa — chamado apos obter resultado da API de simulacao
  window.ybChat = {
    start: async function (formData) {
      // formData: { origem, destino, viatura, urgencia, priceData }
      const sessionId = newSessionId();
      chatState.sessionId = sessionId;

      const chatSection = document.getElementById('ybChatSection');
      if (chatSection) {
        chatSection.style.display = 'block';
      }

      // Limpar mensagens anteriores
      const area = document.getElementById('ybChatMessages');
      if (area) area.innerHTML = '';
      document.getElementById('ybQuickReplies').innerHTML = '';

      showTyping();

      try {
        const res = await fetch(API_BASE + '/api/conversations/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            origem: formData.origem,
            destino: formData.destino,
            viatura: formData.viatura,
            urgencia: formData.urgencia,
            sessionId: sessionId,
          }),
        });
        const data = await res.json();
        console.log('[YB Chat] /start response:', data);
        removeTyping();

        if (!data.success) {
          appendBubble('bot', 'Erro ao ligar ao assistente: ' + (data.error || 'resposta invalida') + '. Tente novamente ou contacte-nos.');
          setInputDisabled(false);
          return;
        }

        chatState.conversationId = data.conversationId;
        chatState.step = data.step;
        chatState.lastMsgCount = 1;

        appendBubble('bot', data.message);

        if (data.quickReplies && data.quickReplies.length) {
          showQuickReplies(data.quickReplies);
        }

        setInputDisabled(false);
        document.getElementById('ybChatInput')?.focus();
        startPolling();
      } catch (e) {
        removeTyping();
        appendBubble('bot', 'Erro de ligacao ao assistente. Por favor tente novamente.');
      }
    },
  };

  // Inicializar listeners do chat quando DOM estiver pronto
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
        const input = document.getElementById('ybChatInput');
        if (input) sendMessage(input.value);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChatListeners);
  } else {
    initChatListeners();
  }
})();
