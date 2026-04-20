/**
 * YourBox Web Chat Widget
 * Conecta ao backend Next.js — sem dependencias externas
 */

(function () {
  'use strict';

  const API_BASE = 'http://localhost:3000'; // dev local
  //const API_BASE = 'https://leads.comgo.pt'; // producao
  const POLL_INTERVAL = 3000; // ms
  const TYPING_SPEED_MS = 11; // ms por caracter (typewriter)

  let chatState = {
    conversationId: null,
    sessionId: null,
    step: null,
    polling: null,
    lastMsgCount: 0,
    sending: false,
    typing: false, // true enquanto animação typewriter está a correr
  };

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

  // Adicionar bolha de mensagem instantânea
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

  // Adicionar bolha do bot com efeito typewriter
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

    let i = 0;
    let accumulated = '';

    function typeNext() {
      if (i >= text.length) {
        // Terminou — aplicar HTML com formatação
        bubble.innerHTML = mdToHtml(text);
        area.scrollTop = area.scrollHeight;
        chatState.typing = false;
        if (onDone) onDone();
        return;
      }

      // Avançar por blocos de 1-2 caracteres para ser mais fluido
      const chunk = text.slice(i, i + (Math.random() > 0.7 ? 2 : 1));
      accumulated += chunk;
      i += chunk.length;

      bubble.textContent = accumulated;

      // Scroll suave — só a cada 5 chars para não ser pesado
      if (i % 5 === 0 || i >= text.length) {
        area.scrollTop = area.scrollHeight;
      }

      // Variação ligeira de velocidade para parecer natural
      const delay = TYPING_SPEED_MS + (Math.random() > 0.85 ? 30 : 0);
      setTimeout(typeNext, delay);
    }

    typeNext();
  }

  // Indicador "a escrever..."
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

  // Botões de resposta rápida — só aparecem após typewriter terminar
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
      if (footer) footer.innerHTML = '<p class="yb-done yb-done--escalated">A falar com um agente. Pode continuar a escrever aqui.</p>';
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

  // Polling — só acrescenta mensagens novas (não limpa o DOM)
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
    if (!chatState.conversationId || chatState.sending || chatState.typing) return;
    try {
      const res = await fetch(API_BASE + '/api/conversations/' + chatState.conversationId);
      const data = await res.json();
      if (!data.success) return;

      const conv = data.conversation;
      const msgs = conv.history || [];

      if (msgs.length > chatState.lastMsgCount) {
        const newMsgs = msgs.slice(chatState.lastMsgCount);
        chatState.lastMsgCount = msgs.length;

        // Enfileirar mensagens novas para não se sobreporem
        let chain = Promise.resolve();
        newMsgs.forEach(function (m) {
          chain = chain.then(function () {
            return new Promise(function (resolve) {
              var role = m.role === 'lead' ? 'lead' : 'bot';
              if (role === 'bot') {
                appendBubbleTyped(m.text, resolve);
              } else {
                appendBubble('lead', m.text);
                resolve();
              }
            });
          });
        });
      }

      const done = ['LEAD_REGISTERED', 'CLOSED', 'ESCALATED_TO_HUMAN'];
      if (done.includes(conv.step)) {
        showFinalState(conv.step);
      }
    } catch (_) {}
  }

  // Enviar mensagem
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

      if (!data.success && data.step) {
        showFinalState(data.step);
        return;
      }

      if (data.message) {
        chatState.lastMsgCount += 2;
        appendBubbleTyped(data.message, function () {
          // Quick replies só aparecem após o bot "terminar de escrever"
          if (data.quickReplies && data.quickReplies.length) {
            showQuickReplies(data.quickReplies);
          }
          const done = ['LEAD_REGISTERED', 'ESCALATED_TO_HUMAN', 'CLOSED'];
          if (done.includes(data.step)) {
            showFinalState(data.step);
          }
        });
      } else {
        if (data.quickReplies && data.quickReplies.length) showQuickReplies(data.quickReplies);
        const done = ['LEAD_REGISTERED', 'ESCALATED_TO_HUMAN', 'CLOSED'];
        if (done.includes(data.step)) showFinalState(data.step);
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

  // Iniciar conversa
  window.ybChat = {
    start: async function (formData) {
      const sessionId = newSessionId();
      chatState.sessionId = sessionId;

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
            origem: formData.origem,
            destino: formData.destino,
            viatura: formData.viatura,
            urgencia: formData.urgencia,
            sessionId: sessionId,
          }),
        });
        const data = await res.json();
        removeTyping();

        if (!data.success) {
          appendBubble('bot', 'Erro ao ligar ao assistente: ' + (data.error || 'resposta invalida') + '. Tente novamente ou contacte-nos.');
          setInputDisabled(false);
          return;
        }

        chatState.conversationId = data.conversationId;
        chatState.step = data.step;
        chatState.lastMsgCount = 1;

        appendBubbleTyped(data.message, function () {
          if (data.quickReplies && data.quickReplies.length) {
            showQuickReplies(data.quickReplies);
          }
          setInputDisabled(false);
          document.getElementById('ybChatInput') && document.getElementById('ybChatInput').focus();
        });

        startPolling();
      } catch (e) {
        console.error('[YB Chat] start error:', e);
        removeTyping();
        appendBubble('bot', 'Não foi possível ligar ao assistente. Verifique a sua ligação e tente novamente.');
        setInputDisabled(false);
      }
    },
  };

  // Inicializar listeners
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
