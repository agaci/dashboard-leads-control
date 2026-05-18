/**
 * YourBox Voice Engine v1.0
 * Motor de voz para o formulário e chat da landing page.
 * Dependências: Google Maps JS API (já carregado na página).
 * Expõe: window.ybVoice
 */
(function () {
  'use strict';

  // ── Configuração (sobrescrita por ybVoice.init) ──────────────────────────────
  var cfg = {
    assistantName: 'Yox',
    gender:        'female',
    lang:          'pt-PT',
  };

  var selectedVoice  = null;
  var recognition    = null;
  var isListening    = false;
  var voiceActive    = false; // modo voz activado
  var ttsDebounce    = null;
  var lastSpokenText = '';

  // ── TTS ─────────────────────────────────────────────────────────────────────

  function cleanForTTS(text) {
    return text
      .replace(/\*([^*\n]+)\*/g, '$1')
      .replace(/_([^_\n]+)_/g, '$1')
      .replace(/~~([^~\n]+)~~/g, '$1')
      .replace(/<[^>]+>/g, ' ')
      .replace(/€/g, ' euros ')
      .replace(/→/g, ' para ')
      .replace(/·/g, ',')
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function speak(text, onEnd) {
    if (!text) { if (onEnd) onEnd(); return; }
    var clean = cleanForTTS(text);
    window.speechSynthesis.cancel();
    var utt = new SpeechSynthesisUtterance(clean);
    if (selectedVoice) utt.voice = selectedVoice;
    utt.lang  = cfg.lang;
    utt.rate  = 0.95;
    utt.pitch = cfg.gender === 'female' ? 1.05 : 0.88;
    utt.onend   = function () { setStatus(''); if (onEnd) onEnd(); };
    utt.onerror = function () { setStatus(''); if (onEnd) onEnd(); };
    setStatus('A falar...');
    window.speechSynthesis.speak(utt);
  }

  function stopSpeaking() {
    window.speechSynthesis.cancel();
  }

  // ── Selecção de voz ──────────────────────────────────────────────────────────

  function loadVoice(cb) {
    function pick() {
      var voices = window.speechSynthesis.getVoices();
      if (!voices.length) return;

      // Preferência: pt-PT, depois pt-BR, depois pt-*
      var ptpt = voices.filter(function (v) { return v.lang === 'pt-PT'; });
      var ptbr = voices.filter(function (v) { return v.lang === 'pt-BR'; });
      var ptAny = voices.filter(function (v) { return v.lang.startsWith('pt'); });
      var pool  = ptpt.length ? ptpt : (ptbr.length ? ptbr : ptAny);

      if (pool.length) {
        if (cfg.gender === 'female') {
          var femKeys = ['maria', 'joana', 'female', 'mulher', 'feminina', 'francisca', 'luciana'];
          var fem = pool.find(function (v) {
            return femKeys.some(function (k) { return v.name.toLowerCase().indexOf(k) !== -1; });
          });
          selectedVoice = fem || pool[0];
        } else {
          var maleKeys = ['daniel', 'pedro', 'male', 'homem', 'masculino', 'carlos', 'ricardo'];
          var mal = pool.find(function (v) {
            return maleKeys.some(function (k) { return v.name.toLowerCase().indexOf(k) !== -1; });
          });
          selectedVoice = mal || pool[0];
        }
      }
      if (cb) cb(selectedVoice);
    }

    if (window.speechSynthesis.getVoices().length) {
      pick();
    } else {
      window.speechSynthesis.onvoiceschanged = pick;
    }
  }

  // ── STT ─────────────────────────────────────────────────────────────────────

  function canSTT() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  function listen(onResult, onError) {
    if (!canSTT()) {
      if (onError) onError('not-supported');
      return;
    }
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SR();
    recognition.lang = cfg.lang;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 3;

    isListening = true;
    setStatus('A ouvir...');
    setListeningUI(true);

    recognition.onresult = function (e) {
      isListening = false;
      setListeningUI(false);
      var transcript = e.results[0][0].transcript.trim();
      onResult(transcript);
    };

    recognition.onerror = function (e) {
      isListening = false;
      setListeningUI(false);
      setStatus('');
      if (onError) onError(e.error);
    };

    recognition.onend = function () {
      if (isListening) {
        isListening = false;
        setListeningUI(false);
      }
    };

    try { recognition.start(); } catch (e) {
      isListening = false;
      setListeningUI(false);
      if (onError) onError('start-failed');
    }
  }

  function stopListening() {
    if (recognition) { try { recognition.stop(); } catch (_) {} }
    isListening = false;
    setListeningUI(false);
  }

  // ── Geocoding via Google Maps (já carregado) ─────────────────────────────────

  function geocodeText(text, cb) {
    if (!window.google || !window.google.maps) { cb([]); return; }
    var geocoder = new google.maps.Geocoder();
    geocoder.geocode(
      { address: text, region: 'pt', componentRestrictions: { country: 'pt' } },
      function (results, status) {
        if (status !== 'OK' || !results) { cb([]); return; }
        cb(results.slice(0, 3).map(function (r) {
          return {
            formatted: r.formatted_address,
            lat: r.geometry.location.lat(),
            lng: r.geometry.location.lng(),
          };
        }));
      }
    );
  }

  // ── Utilitários de parse ──────────────────────────────────────────────────────

  function isYes(text) {
    var t = text.toLowerCase();
    return t.indexOf('sim') !== -1 || t.indexOf('correto') !== -1
        || t.indexOf('certo') !== -1 || t.indexOf('ok') !== -1
        || t.indexOf('confirmo') !== -1 || t === 's' || t === '1';
  }

  function isNo(text) {
    var t = text.toLowerCase();
    return t.indexOf('não') !== -1 || t.indexOf('nao') !== -1
        || t.indexOf('errado') !== -1 || t.indexOf('errada') !== -1
        || t === 'n';
  }

  function parseNumber(text) {
    var t = text.toLowerCase().trim();
    var map = { 'um': 1, 'uma': 1, 'dois': 2, 'duas': 2, 'três': 3, 'tres': 3 };
    for (var w in map) { if (t.indexOf(w) !== -1) return map[w]; }
    var m = t.match(/\d/);
    if (m) return parseInt(m[0], 10);
    return -1;
  }

  // ── Colecta de endereço com Geocoding + confirmação ──────────────────────────

  function collectAddress(fieldId, label, cb) {
    speak('Qual é o ' + label + '? Podes dizer o endereço ou dizer "a minha localização".', function () {
      setStatus('A ouvir...');
      listen(function (transcript) {
        var t = transcript.toLowerCase();
        // GPS trigger
        if (t.indexOf('minha localização') !== -1 || t.indexOf('localização atual') !== -1
            || t.indexOf('aqui') !== -1 || t.indexOf('onde estou') !== -1) {
          speak('A usar a tua localização...', function () {});
          var gpsBtn = document.getElementById('gps-' + fieldId);
          if (gpsBtn) {
            gpsBtn.click();
            var attempts = 0;
            var check = setInterval(function () {
              var val = document.getElementById(fieldId) && document.getElementById(fieldId).value;
              if (val || attempts > 20) {
                clearInterval(check);
                cb(val || transcript);
              }
              attempts++;
            }, 500);
          } else {
            cb(transcript);
          }
          return;
        }

        // Geocode
        setStatus('A procurar endereço...');
        geocodeText(transcript, function (results) {
          if (!results.length) {
            speak('Não encontrei esse endereço. Pode tentar de novo?', function () {
              collectAddress(fieldId, label, cb);
            });
            return;
          }

          if (results.length === 1) {
            var addr = results[0].formatted;
            document.getElementById(fieldId) && (document.getElementById(fieldId).value = addr);
            speak('Encontrei: ' + addr + '. Está correto?', function () {
              listen(function (ans) {
                if (isYes(ans)) {
                  cb(addr);
                } else {
                  collectAddress(fieldId, label, cb);
                }
              }, function () { cb(addr); });
            });
            return;
          }

          // Múltiplas opções
          var opts = results.slice(0, 3);
          var optText = opts.map(function (r, i) { return (i + 1) + ': ' + r.formatted; }).join('. ');
          speak('Encontrei estas opções. ' + optText + '. Diz o número da opção.', function () {
            listen(function (ans) {
              var num = parseNumber(ans);
              if (num >= 1 && num <= opts.length) {
                document.getElementById(fieldId) && (document.getElementById(fieldId).value = opts[num - 1].formatted);
                cb(opts[num - 1].formatted);
              } else {
                speak('Não percebi. Vamos tentar de novo.', function () {
                  collectAddress(fieldId, label, cb);
                });
              }
            }, function () { collectAddress(fieldId, label, cb); });
          });
        });
      }, function (err) {
        if (err === 'not-supported') {
          speak('Reconhecimento de voz não disponível neste browser. Por favor escreve o endereço.', function () {});
          return;
        }
        speak('Não consegui ouvir. Tenta de novo.', function () {
          collectAddress(fieldId, label, cb);
        });
      });
    });
  }

  // ── Colecta de viatura ───────────────────────────────────────────────────────

  function collectViatura(cb) {
    speak('Que tipo de viatura precisas? Um: moto. Dois: furgão pequeno. Três: furgão grande.', function () {
      listen(function (transcript) {
        var t = transcript.toLowerCase();
        var viatura = 'Moto';
        var id = 'moto';
        if (t.indexOf('moto') !== -1 || parseNumber(t) === 1) {
          viatura = 'Moto'; id = 'moto';
        } else if (t.indexOf('pequen') !== -1 || t.indexOf('pequeno') !== -1 || parseNumber(t) === 2) {
          viatura = 'Furgão Classe 1'; id = 'furgao1';
        } else if (t.indexOf('grand') !== -1 || t.indexOf('grande') !== -1 || parseNumber(t) === 3) {
          viatura = 'Furgão Classe 2'; id = 'furgao2';
        }
        var radio = document.getElementById(id);
        if (radio) { radio.checked = true; radio.dispatchEvent(new Event('change')); }
        speak('Viatura selecionada: ' + viatura + '.', function () { cb(viatura); });
      }, function () { cb('Moto'); });
    });
  }

  // ── Colecta de urgência ──────────────────────────────────────────────────────

  function collectUrgencia(cb) {
    speak('Quando precisas da entrega? Um: uma hora. Dois: quatro horas. Três: amanhã.', function () {
      listen(function (transcript) {
        var t = transcript.toLowerCase();
        var urgencia = '1 Hora';
        var id = 'urg1';
        if (t.indexOf('uma hora') !== -1 || t.indexOf('1 hora') !== -1 || parseNumber(t) === 1) {
          urgencia = '1 Hora'; id = 'urg1';
        } else if (t.indexOf('quatro') !== -1 || t.indexOf('4 hora') !== -1 || parseNumber(t) === 2) {
          urgencia = '4 Horas'; id = 'urg4';
        } else if (t.indexOf('amanhã') !== -1 || t.indexOf('manha') !== -1
                || t.indexOf('seguinte') !== -1 || parseNumber(t) === 3) {
          urgencia = '24 Horas'; id = 'urg24';
        }
        var radio = document.getElementById(id);
        if (radio) { radio.checked = true; radio.dispatchEvent(new Event('change')); }
        speak('Urgência: ' + urgencia + '.', function () { cb(urgencia); });
      }, function () { cb('1 Hora'); });
    });
  }

  // ── Colecta de nome ──────────────────────────────────────────────────────────

  function collectNome(cb) {
    speak('Como te chamas?', function () {
      listen(function (transcript) {
        var nome = transcript.trim();
        var el = document.getElementById('ybNome');
        if (el) el.value = nome;
        speak('Nome registado: ' + nome + '.', function () { cb(nome); });
      }, function () { cb(''); });
    });
  }

  // ── Colecta de telefone ──────────────────────────────────────────────────────

  function collectTelefone(cb) {
    speak('Qual é o teu número de telefone?', function () {
      listen(function (transcript) {
        var digits = transcript.replace(/\D/g, '');
        if (digits.length < 9) {
          speak('Não percebi o número. Podes repetir?', function () { collectTelefone(cb); });
          return;
        }
        // Remove 351 prefix if present
        if (digits.length === 12 && digits.startsWith('351')) digits = digits.slice(3);

        var el = document.getElementById('ybTelefone');
        if (el) el.value = digits;

        // Read digits slowly for confirmation
        var digitsSpoken = digits.split('').join(', ');
        speak('O número é ' + digitsSpoken + '. Está correto?', function () {
          listen(function (ans) {
            if (isNo(ans)) {
              collectTelefone(cb);
            } else {
              cb(digits);
            }
          }, function () { cb(digits); });
        });
      }, function () { cb(''); });
    });
  }

  // ── Fluxo do formulário por voz ──────────────────────────────────────────────

  function startVoiceForm() {
    voiceActive = true;
    showVoicePanel(true);

    var greet = 'Olá! Sou ' + cfg.assistantName + '. Vou ajudar-te a preencher o formulário. Responde às minhas perguntas em voz alta.';

    speak(greet, function () {
      collectAddress('origem', 'local de recolha', function (origem) {
        collectAddress('destino', 'local de entrega', function (destino) {
          collectViatura(function (viatura) {
            collectUrgencia(function (urgencia) {
              collectNome(function (nome) {
                collectTelefone(function (telefone) {
                  speak('Óptimo! Vou calcular o preço agora.', function () {
                    showVoicePanel(false);
                    // Trigger form submission
                    if (window.ybFormB && typeof window.ybFormB.submit === 'function') {
                      window.ybFormB.submit();
                    }
                  });
                });
              });
            });
          });
        });
      });
    });
  }

  // ── Integração com o chat (TTS de respostas do bot) ──────────────────────────

  function patchChatForVoice() {
    var area = document.getElementById('ybChatMessages');
    if (!area) return;

    var observer = new MutationObserver(function (mutations) {
      if (!voiceActive) return;
      mutations.forEach(function (m) {
        m.addedNodes.forEach(function (node) {
          if (!node.classList || !node.classList.contains('yb-msg--bot')) return;
          var bubble = node.querySelector('.yb-bubble');
          if (!bubble || bubble.classList.contains('yb-typing')) return;
          // Debounce: espera que a animação de typing termine
          watchBubble(bubble);
        });
      });
    });

    observer.observe(area, { childList: true });
  }

  function watchBubble(bubble) {
    var lastText = '';
    var stable = 0;
    var timer = setInterval(function () {
      var current = bubble.textContent || '';
      if (current && current === lastText) {
        stable++;
        if (stable >= 3) {
          clearInterval(timer);
          if (current !== lastSpokenText) {
            lastSpokenText = current;
            speak(current, function () {
              // Após TTS da mensagem, activar microfone automaticamente
              if (voiceActive) {
                setTimeout(function () { activateChatVoiceInput(); }, 300);
              }
            });
          }
        }
      } else {
        stable = 0;
        lastText = current;
      }
    }, 150);
  }

  function activateChatVoiceInput() {
    // Verifica se o chat está em estado que aceita input
    var input = document.getElementById('ybChatInput');
    var send  = document.getElementById('ybChatSend');
    if (!input || input.disabled) return;

    setStatus('A ouvir...');
    setListeningUI(true);

    listen(function (transcript) {
      setStatus('');
      // Verifica se corresponde a um quick reply
      var qrBtns = document.querySelectorAll('#ybQuickReplies .yb-qr');
      var matched = false;
      qrBtns.forEach(function (btn) {
        if (!matched && matchesQuickReply(transcript, btn.textContent)) {
          matched = true;
          btn.click();
        }
      });
      if (!matched) {
        input.value = transcript;
        if (send && !send.disabled) send.click();
      }
    }, function (err) {
      setStatus('');
      if (err === 'not-supported') return;
      // Em caso de erro, não tenta de novo automaticamente
    });
  }

  function matchesQuickReply(transcript, replyText) {
    var t = transcript.toLowerCase().trim();
    var r = (replyText || '').toLowerCase().trim();

    if (t === r) return true;

    var pairs = [
      [['aceito', 'aceitar', 'sim', 'ok', 'quero'], ['aceito', 'aceitar', 'sim']],
      [['rejeito', 'rejeitar', 'não', 'nao'], ['rejeito', 'rejeitar', 'não', 'recuso']],
      [['amanhã', 'manha', 'seguinte', 'dia seguinte'], ['amanhã', 'dia seguinte', 'entrega amanhã']],
      [['uma hora', '1 hora', 'urgente'], ['1 hora', 'uma hora']],
      [['quatro horas', '4 horas'], ['4 horas', 'quatro horas']],
      [['análise', 'analise', 'agregação', 'agregacao'], ['análise de agregação', 'agregação']],
      [['direto', 'normal', 'avançar', 'avancar'], ['avançar com serviço direto', 'serviço direto']],
    ];

    for (var i = 0; i < pairs.length; i++) {
      var spokenKeys = pairs[i][0];
      var replyKeys  = pairs[i][1];
      var transcriptMatches = spokenKeys.some(function (k) { return t.indexOf(k) !== -1; });
      var replyMatches      = replyKeys.some(function (k) { return r.indexOf(k) !== -1; });
      if (transcriptMatches && replyMatches) return true;
    }
    return false;
  }

  // ── UI do motor de voz ───────────────────────────────────────────────────────

  function buildUI() {
    // Painel de estado flutuante
    var panel = document.createElement('div');
    panel.id = 'ybVoicePanel';
    panel.style.cssText = [
      'display:none',
      'position:fixed',
      'bottom:1.5rem',
      'left:50%',
      'transform:translateX(-50%)',
      'background:#1a2332',
      'color:#fff',
      'padding:0.75rem 1.25rem',
      'border-radius:12px',
      'font-size:0.85rem',
      'font-family:inherit',
      'z-index:9998',
      'min-width:220px',
      'text-align:center',
      'box-shadow:0 4px 20px rgba(0,0,0,.35)',
      'display:none',
    ].join(';');

    panel.innerHTML =
      '<div id="ybVoiceStatus" style="font-weight:700;color:#bed62f;margin-bottom:0.3rem;"></div>' +
      '<div id="ybVoiceMicWave" style="display:none;gap:3px;justify-content:center;align-items:flex-end;height:20px;">' +
        '<span class="yb-wave-bar"></span>' +
        '<span class="yb-wave-bar"></span>' +
        '<span class="yb-wave-bar"></span>' +
        '<span class="yb-wave-bar"></span>' +
        '<span class="yb-wave-bar"></span>' +
      '</div>' +
      '<button id="ybVoiceStop" style="margin-top:0.5rem;background:transparent;border:1px solid rgba(255,255,255,.3);color:#fff;padding:0.25rem 0.75rem;border-radius:6px;font-size:0.75rem;cursor:pointer;">Cancelar</button>';

    document.body.appendChild(panel);

    document.getElementById('ybVoiceStop').addEventListener('click', function () {
      stopSpeaking();
      stopListening();
      voiceActive = false;
      showVoicePanel(false);
    });

    // CSS para as barras de onda
    var style = document.createElement('style');
    style.textContent =
      '.yb-wave-bar{display:inline-block;width:4px;background:#bed62f;border-radius:2px;animation:ybWave 0.7s ease-in-out infinite;}' +
      '.yb-wave-bar:nth-child(1){animation-delay:0s;height:8px}' +
      '.yb-wave-bar:nth-child(2){animation-delay:.1s;height:14px}' +
      '.yb-wave-bar:nth-child(3){animation-delay:.2s;height:20px}' +
      '.yb-wave-bar:nth-child(4){animation-delay:.1s;height:14px}' +
      '.yb-wave-bar:nth-child(5){animation-delay:0s;height:8px}' +
      '@keyframes ybWave{0%,100%{transform:scaleY(.5)}50%{transform:scaleY(1)}}' +
      '#ybVoiceChatBtn{background:#1a2332;color:#fff;border:none;border-radius:8px;padding:0 0.75rem;cursor:pointer;font-size:1rem;flex-shrink:0;height:40px;line-height:1;}' +
      '#ybVoiceChatBtn.listening{background:#bed62f;color:#1a2332;}';
    document.head.appendChild(style);
  }

  function showVoicePanel(visible) {
    var panel = document.getElementById('ybVoicePanel');
    if (panel) panel.style.display = visible ? 'block' : 'none';
  }

  function setStatus(msg) {
    var el = document.getElementById('ybVoiceStatus');
    if (el) el.textContent = msg;
    var wave = document.getElementById('ybVoiceMicWave');
    if (wave) wave.style.display = (msg === 'A ouvir...') ? 'flex' : 'none';
  }

  function setListeningUI(active) {
    var btn = document.getElementById('ybVoiceChatBtn');
    if (btn) btn.classList.toggle('listening', active);
    setStatus(active ? 'A ouvir...' : '');
    var wave = document.getElementById('ybVoiceMicWave');
    if (wave) wave.style.display = active ? 'flex' : 'none';
    showVoicePanel(active || voiceActive);
  }

  // Botão de microfone na área de input do chat
  function addChatMicButton() {
    var inputRow = document.querySelector('#ybChatFooter .yb-chat-input-row');
    if (!inputRow || document.getElementById('ybVoiceChatBtn')) return;

    var btn = document.createElement('button');
    btn.id = 'ybVoiceChatBtn';
    btn.title = 'Falar';
    btn.textContent = 'Mic';
    btn.onclick = function (e) {
      e.preventDefault();
      if (isListening) {
        stopListening();
        return;
      }
      showVoicePanel(true);
      activateChatVoiceInput();
    };

    var sendBtn = document.getElementById('ybChatSend');
    if (sendBtn) {
      inputRow.insertBefore(btn, sendBtn);
    } else {
      inputRow.appendChild(btn);
    }
  }

  // ── API pública ──────────────────────────────────────────────────────────────

  window.ybVoice = {
    init: function (options, cb) {
      if (options) {
        if (options.assistantName) cfg.assistantName = options.assistantName;
        if (options.gender)        cfg.gender        = options.gender;
        if (options.lang)          cfg.lang          = options.lang;
      }
      buildUI();
      loadVoice(cb || function () {});
    },

    startForm: function () {
      if (!canSTT()) {
        alert('O reconhecimento de voz não está disponível neste browser. Use Chrome ou Edge para a funcionalidade de voz.');
        return;
      }
      startVoiceForm();
    },

    enableChatVoice: function () {
      voiceActive = true;
      // Aguardar o chat aparecer no DOM
      var attempts = 0;
      var check = setInterval(function () {
        var area = document.getElementById('ybChatMessages');
        if (area || attempts > 20) {
          clearInterval(check);
          if (area) {
            patchChatForVoice();
            addChatMicButton();
          }
        }
        attempts++;
      }, 250);
    },

    speak:   speak,
    canSTT:  canSTT,
    isVoiceActive: function () { return voiceActive; },
  };

})();
