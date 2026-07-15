/**
 * ============================================
 * YOURBOX QUIZ - dinamica de quiz dentro do #form do index-b
 * Um card de cada vez. Mesma dinamica de envio da variante B:
 *   - Lead: POST submitDirectLead  (sem mostrar preco; apenas confirma contacto)
 * Convive com yourbox-form-b.js (popups, tour, WhatsApp, tracking).
 * ============================================
 */

(function () {
    'use strict';

    const CONFIG = {
        LEAD_API: 'https://weby-5204.nodechef.com/api/submitDirectLead',
        WHATSAPP_NUMBER: '351964078194',
        // Variante por pagina (para o dashboard distinguir a origem da lead).
        // Cada pagina do quiz pode definir window.YB_QUIZ_VARIANTE; default 'QUIZ'.
        VARIANTE: (typeof window !== 'undefined' && window.YB_QUIZ_VARIANTE) ? String(window.YB_QUIZ_VARIANTE) : 'QUIZ'
    };

    // Passos do quiz (review e o ultimo cartao, nao conta para a barra)
    var DEFAULT_STEPS = ['nome', 'telefone', 'email', 'origem', 'destino',
                         'volumes', 'peso', 'dimensoes', 'urgencia', 'material', 'embalado', 'review'];
    // Ordem configuravel por pagina (window.YB_QUIZ_STEPS). So aceita se for uma
    // reordenacao EXACTA dos mesmos passos; senao usa a ordem por defeito.
    const STEPS = (function () {
        var custom = (typeof window !== 'undefined') ? window.YB_QUIZ_STEPS : null;
        if (Array.isArray(custom) && custom.length === DEFAULT_STEPS.length &&
            DEFAULT_STEPS.every(function (s) { return custom.indexOf(s) >= 0; })) {
            return custom;
        }
        return DEFAULT_STEPS;
    })();
    const DATA_STEPS = STEPS.length - 1; // 11

    // Atalho "Concluir e pedir orcamento" (opcional, activado por pagina via flag global).
    // Deixa concluir a lead assim que ha contacto + rota, sem obrigar aos passos de carga.
    // OFF por defeito -> as paginas actuais mantem-se exactamente iguais.
    var EARLY_SUBMIT = !!(typeof window !== 'undefined' && window.YB_QUIZ_EARLY_SUBMIT);
    // Modo widget (iframe em site de 3.os): NÃO posta para o weby antigo — a lead vive
    // só no dashboard (via quiz-progress) — e avisa o pai para ajustar a altura do iframe.
    var WIDGET = !!(typeof window !== 'undefined' && window.YB_QUIZ_WIDGET);
    function widgetResize() {
        if (!WIDGET || typeof window === 'undefined' || window.parent === window) return;
        try {
            var cid = new URLSearchParams(location.search).get('clientId'); // embed.js exige o clientId
            window.parent.postMessage({ type: 'ybw-resize', clientId: cid, height: document.body.scrollHeight }, '*');
        } catch (e) {}
    }

    const URGENCIA_MAP = {
        'Imediata':    '1 Hora',
        'Proprio dia': '4 Horas',
        '24H':         '24 Horas'
    };

    const data = {
        nome: '', telefone: '', email: '', origem: '', destino: '',
        volumes: '', peso: '', comprimento: '', largura: '', altura: '',
        urgencia: '', material: '', embalado: ''
    };

    let cur = 0;

    // ------------------------------------------------
    // Tracking de progresso para o dashboard (quase tempo real)
    // ------------------------------------------------
    var PROGRESS_API = 'https://leads.comgo.pt/api/quiz-progress';
    var STEP_LABELS = {
        nome: 'Nome', telefone: 'Telemovel', email: 'Email',
        origem: 'Local de recolha', destino: 'Local de entrega',
        volumes: 'Numero de volumes', peso: 'Peso medio por volume',
        dimensoes: 'Dimensoes por volume', urgencia: 'Urgencia',
        material: 'Material', embalado: 'Embalagem', review: 'Resumo'
    };
    var sessionId = (function () {
        try {
            var k = 'yb_quiz_sid';
            var s = sessionStorage.getItem(k);
            if (!s) {
                s = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
                    : ('q' + Date.now() + Math.random().toString(36).slice(2));
                sessionStorage.setItem(k, s);
            }
            return s;
        } catch (e) { return 'q' + Date.now(); }
    })();

    // ID da VISITA (o mesmo do yourbox-visit.js, chave 'yb_vsid') — liga esta conversa
    // a `visits.sessionId`, para o apagar em cascata visita -> conversa -> lead.
    function visitSid() {
        try {
            var v = sessionStorage.getItem('yb_vsid');
            if (!v) { v = 's_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8); sessionStorage.setItem('yb_vsid', v); }
            return v;
        } catch (e) { return null; }
    }

    // Geo aproximada por IP — pedida no BROWSER (vê o IP real do visitante; contorna o
    // IP mascarado pelo Docker no servidor). Vai no payload dos eventos de progresso.
    var clientGeo = null;
    function fetchClientGeo() {
        try {
            fetch('https://get.geojs.io/v1/ip/geo.json')
                .then(function (r) { return r.json(); })
                .then(function (j) {
                    if (j && (j.city || j.latitude)) {
                        clientGeo = {
                            source: 'ip',
                            city: j.city || null, region: j.region || null, country: j.country || null,
                            lat: j.latitude != null ? Number(j.latitude) : null,
                            lng: j.longitude != null ? Number(j.longitude) : null
                        };
                    }
                })
                .catch(function () {});
        } catch (e) {}
    }

    function snapshot() {
        return {
            nome: data.nome, telefone: data.telefone, email: data.email,
            origem: data.origem, destino: data.destino,
            volumes: data.volumes, peso: data.peso,
            comprimento: data.comprimento, largura: data.largura, altura: data.altura,
            urgencia: data.urgencia, material: data.material, embalado: data.embalado
        };
    }

    function track(event, step) {
        try {
            var payload = JSON.stringify({
                sessionId: sessionId,
                visitSid: visitSid(),
                event: event,
                step: step,
                stepIndex: STEPS.indexOf(step),
                total: DATA_STEPS,
                label: STEP_LABELS[step] || step,
                data: snapshot(),
                variante: CONFIG.VARIANTE,
                geo: clientGeo
            });
            if (navigator.sendBeacon) {
                navigator.sendBeacon(PROGRESS_API, new Blob([payload], { type: 'text/plain' }));
            } else {
                fetch(PROGRESS_API, { method: 'POST', body: payload, headers: { 'Content-Type': 'text/plain' }, keepalive: true }).catch(function () {});
            }
        } catch (e) {}
    }

    // Envia a localizacao PRECISA (GPS) para o dashboard quando o user usa o botao das moradas
    function sendGeo(lat, lng, address, field) {
        try {
            var payload = JSON.stringify({ sessionId: sessionId, event: 'geo', geo: { lat: lat, lng: lng, address: address, field: field } });
            if (navigator.sendBeacon) {
                navigator.sendBeacon(PROGRESS_API, new Blob([payload], { type: 'text/plain' }));
            } else {
                fetch(PROGRESS_API, { method: 'POST', body: payload, headers: { 'Content-Type': 'text/plain' }, keepalive: true }).catch(function () {});
            }
        } catch (e) {}
    }

    // ------------------------------------------------
    // Helpers
    // ------------------------------------------------
    function card(step) { return document.querySelector('.quiz-card[data-step="' + step + '"]'); }
    function refreshIcons() { if (window.lucide) try { window.lucide.createIcons(); } catch (e) {} }

    function setError(step, msg) {
        const el = document.getElementById('qerr-' + step);
        if (el) el.textContent = msg || '';
    }
    function clearErrors() {
        document.querySelectorAll('.quiz-err').forEach(function (e) { e.textContent = ''; });
    }

    function focusInput(step) {
        const map = {
            nome: 'nome', telefone: 'telefone', email: 'email',
            origem: 'origem', destino: 'destino', volumes: 'quizVolumes',
            peso: 'quizPeso', dimensoes: 'quizComprimento', material: 'quizMaterial'
        };
        const id = map[step];
        if (!id) return;
        const inp = document.getElementById(id);
        if (inp) setTimeout(function () { try { inp.focus(); } catch (e) {} }, 60);
    }

    // ------------------------------------------------
    // Mostrar passo
    // ------------------------------------------------
    function showStep(i) {
        cur = Math.max(0, Math.min(i, STEPS.length - 1));
        const step = STEPS[cur];

        document.querySelectorAll('.quiz-card').forEach(function (c) { c.classList.remove('active'); });
        const el = card(step);
        if (el) el.classList.add('active');

        // Progresso
        const pct = Math.round((cur / DATA_STEPS) * 100);
        const fill = document.getElementById('quizProgressFill');
        if (fill) fill.style.width = Math.min(100, pct) + '%';

        // Contador
        const countEl = document.querySelector('.quiz-step-count');
        if (countEl) {
            if (step === 'review') countEl.textContent = 'Confirmacao final';
            else countEl.innerHTML = 'Pergunta <span>' + (cur + 1) + '</span> de <span>' + DATA_STEPS + '</span>';
        }

        // Botoes de navegacao
        const back = document.getElementById('quizBack');
        const next = document.getElementById('quizNext');
        if (back) back.classList.toggle('show', cur > 0);
        if (next) next.style.display = (step === 'review') ? 'none' : '';

        if (step === 'review') buildSummary();

        // Nudge do botao GPS nos campos de morada (recolha / entrega)
        hideGeoNudge();
        if (step === 'origem' || step === 'destino') showGeoNudge(step);

        focusInput(step);
        updateEarlyButton();
        refreshIcons();
        widgetResize();
    }

    // ------------------------------------------------
    // Validacao + captura do passo actual
    // ------------------------------------------------
    function capture(step) {
        setError(step, '');
        switch (step) {
            case 'nome': {
                const v = (document.getElementById('nome').value || '').trim();
                if (v.length < 3) { setError(step, 'Indique o seu nome completo.'); return false; }
                data.nome = v; return true;
            }
            case 'telefone': {
                const limpo = (document.getElementById('telefone').value || '').replace(/\s/g, '').replace(/\+351/g, '');
                if (!/^[0-9]{9}$/.test(limpo)) { setError(step, 'Telemovel invalido (9 digitos).'); return false; }
                data.telefone = limpo; return true;
            }
            case 'email': {
                const v = (document.getElementById('email').value || '').trim();
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { setError(step, 'Email invalido.'); return false; }
                data.email = v; return true;
            }
            case 'origem': {
                const v = (document.getElementById('origem').value || '').trim();
                if (v.length < 3) { setError(step, 'Indique o local de recolha.'); return false; }
                data.origem = v; return true;
            }
            case 'destino': {
                const v = (document.getElementById('destino').value || '').trim();
                if (v.length < 3) { setError(step, 'Indique o local de entrega.'); return false; }
                data.destino = v; return true;
            }
            case 'volumes': {
                // Aceita input livre OU presets (botoes) que ja gravaram data.volumes.
                const elV = document.getElementById('quizVolumes');
                const rawV = (elV && elV.value !== '') ? elV.value : data.volumes;
                const v = parseInt(rawV, 10);
                if (!v || v < 1 || v > 99) { setError(step, 'Indique um numero entre 1 e 99.'); return false; }
                data.volumes = v; return true;
            }
            case 'peso': {
                // Aceita input livre OU presets de faixa (botoes) que ja gravaram data.peso.
                const elP = document.getElementById('quizPeso');
                const rawP = (elP && elP.value !== '') ? elP.value : data.peso;
                const v = parseFloat(String(rawP == null ? '' : rawP).replace(',', '.'));
                if (!v || v <= 0) { setError(step, 'Indique o peso medio por volume.'); return false; }
                data.peso = v; return true;
            }
            case 'dimensoes': {
                // Aceita inputs livres OU presets (botoes data-dims) que ja gravaram data.*
                const elC = document.getElementById('quizComprimento');
                const elL = document.getElementById('quizLargura');
                const elA = document.getElementById('quizAltura');
                const c = parseInt((elC && elC.value !== '') ? elC.value : data.comprimento, 10);
                const l = parseInt((elL && elL.value !== '') ? elL.value : data.largura, 10);
                const a = parseInt((elA && elA.value !== '') ? elA.value : data.altura, 10);
                if (!c || !l || !a || c <= 0 || l <= 0 || a <= 0) { setError(step, 'Preencha comprimento, largura e altura.'); return false; }
                data.comprimento = c; data.largura = l; data.altura = a; return true;
            }
            case 'urgencia':
                if (!data.urgencia) { setError(step, 'Escolha a urgencia.'); return false; }
                return true;
            case 'material': {
                const v = document.getElementById('quizMaterial').value;
                if (!v) { setError(step, 'Escolha o tipo de material.'); return false; }
                data.material = v; return true;
            }
            case 'embalado':
                if (!data.embalado) { setError(step, 'Indique se a carga esta embalada.'); return false; }
                return true;
        }
        return true;
    }

    // ------------------------------------------------
    // Navegacao
    // ------------------------------------------------
    function next() {
        const step = STEPS[cur];
        if (step === 'review') return;
        if (!capture(step)) return;
        track('progress', step);
        showStep(cur + 1);
    }

    function back() {
        if (cur > 0) showStep(cur - 1);
    }

    function choose(group, value, btn) {
        data[group] = value;
        const parent = card(group);
        if (parent) parent.querySelectorAll('.quiz-choice').forEach(function (b) { b.classList.remove('selected'); });
        if (btn) btn.classList.add('selected');
        setError(group, '');
        track('progress', group);
        // auto-avanca
        setTimeout(function () { if (STEPS[cur] === group) showStep(cur + 1); }, 220);
    }

    // Presets de dimensoes (variantes com o passo 'dimensoes' por botoes, ex: Quiz 6c).
    // Cada preset grava C/L/A representativos de uma so vez (choose() so grava 1 campo).
    var DIM_PRESETS = {
        P:      { c: 40,  l: 30, a: 30 },   // caixa pequena
        M:      { c: 60,  l: 50, a: 50 },   // caixa media
        G:      { c: 100, l: 80, a: 80 },   // caixa grande
        PALETE: { c: 120, l: 80, a: 120 },  // palete
        NAOSEI: { c: 60,  l: 50, a: 50 }    // estimativa media
    };
    function chooseDims(code, btn) {
        var p = DIM_PRESETS[code] || DIM_PRESETS.NAOSEI;
        data.comprimento = p.c; data.largura = p.l; data.altura = p.a;
        data.dimensaoPreset = code;
        const parent = card('dimensoes');
        if (parent) parent.querySelectorAll('.quiz-choice').forEach(function (b) { b.classList.remove('selected'); });
        if (btn) btn.classList.add('selected');
        setError('dimensoes', '');
        track('progress', 'dimensoes');
        setTimeout(function () { if (STEPS[cur] === 'dimensoes') showStep(cur + 1); }, 220);
    }

    // ------------------------------------------------
    // Resumo
    // ------------------------------------------------
    function buildSummary() {
        const total = +(data.volumes * data.peso).toFixed(1);
        const rows = [
            ['Nome', data.nome],
            ['Telemovel', data.telefone],
            ['Email', data.email],
            ['Recolha', data.origem],
            ['Entrega', data.destino],
            ['Volumes', data.volumes + ' un.'],
            ['Peso', data.peso + ' kg/vol (' + total + ' kg total)'],
            ['Dimensoes', data.comprimento + ' x ' + data.largura + ' x ' + data.altura + ' cm'],
            ['Urgencia', data.urgencia],
            ['Material', data.material],
            ['Embalagem', data.embalado]
        ];
        const ul = document.getElementById('quizSummary');
        if (ul) ul.innerHTML = rows.map(function (r) {
            return '<li><span class="qs-k">' + esc(r[0]) + '</span><span class="qs-v">' + esc(String(r[1])) + '</span></li>';
        }).join('');
    }

    function esc(s) {
        return s.replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    // ------------------------------------------------
    // Derivados para a API
    // ------------------------------------------------
    function totalKg() { return +(data.volumes * data.peso).toFixed(1); }
    function maxDimCm() { return Math.max(data.comprimento, data.largura, data.altura); }
    function deriveViatura() {
        const kg = totalKg(), dim = maxDimCm();
        if (!kg || isNaN(kg)) return 'A confirmar'; // atalho: carga ainda por preencher
        if (kg <= 2 && dim <= 60) return 'Moto';
        if (kg <= 150) return 'Furgão Classe 1';
        return 'Furgão Classe 2';
    }
    function apiUrgencia() { return URGENCIA_MAP[data.urgencia] || '4 Horas'; }
    function buildObservacoes() {
        return data.volumes + ' volumes' +
               ' · ' + data.comprimento + 'x' + data.largura + 'x' + data.altura + ' cm (por volume)' +
               ' · ' + totalKg() + ' kg (total)' +
               ' · Peso medio: ' + data.peso + ' kg/volume' +
               ' · Material: ' + data.material +
               ' · ' + data.embalado;
    }

    // Observacoes do atalho "concluir agora" — so o que ja existe + nota de carga pendente.
    function buildObservacoesPartial() {
        var parts = [];
        if (data.volumes) parts.push(data.volumes + ' volumes');
        if (data.comprimento && data.largura && data.altura)
            parts.push(data.comprimento + 'x' + data.largura + 'x' + data.altura + ' cm (por volume)');
        if (data.peso) parts.push('Peso medio: ' + data.peso + ' kg/volume');
        if (data.material) parts.push('Material: ' + data.material);
        if (data.embalado) parts.push(data.embalado);
        parts.push('[PEDIDO RAPIDO - detalhes de carga a confirmar no contacto]');
        return parts.join(' · ');
    }

    // ------------------------------------------------
    // Atalho "Concluir e pedir orcamento" (flag EARLY_SUBMIT)
    // ------------------------------------------------
    function earlyEligible() {
        var emailOk = data.email && data.email.indexOf('@') > 0;
        var telOk = /^[0-9]{9}$/.test(String(data.telefone || '').replace(/\s/g, ''));
        return !!(data.nome && (emailOk || telOk) && data.origem && data.destino);
    }

    function ensureEarlyButton() {
        if (!EARLY_SUBMIT) return null;
        var controls = document.getElementById('quizControls');
        if (!controls || !controls.parentNode) return null;
        var b = document.getElementById('quizEarlySubmit');
        if (!b) {
            b = document.createElement('button');
            b.type = 'button';
            b.id = 'quizEarlySubmit';
            b.style.cssText = 'display:none;width:100%;margin-top:.7rem;background:transparent;' +
                'border:1.5px solid var(--green,#bed62f);color:var(--dark,#1a1a1a);font-weight:700;' +
                'padding:.8rem 1rem;border-radius:12px;cursor:pointer;font-size:.95rem;transition:background .15s';
            b.innerHTML = 'Concluir e pedir or&ccedil;amento agora';
            b.addEventListener('click', function () { submit(true); });
            b.addEventListener('mouseenter', function () { b.style.background = 'rgba(190,214,47,.14)'; });
            b.addEventListener('mouseleave', function () { b.style.background = 'transparent'; });
            controls.parentNode.insertBefore(b, controls.nextSibling);
        }
        return b;
    }

    function updateEarlyButton() {
        if (!EARLY_SUBMIT) return;
        var b = ensureEarlyButton();
        if (!b) return;
        b.style.display = (STEPS[cur] !== 'review' && earlyEligible()) ? 'block' : 'none';
    }

    // ------------------------------------------------
    // Submeter lead (mesma dinamica do index-b: POST submitDirectLead -> success screen)
    // ------------------------------------------------
    function submit(early) {
        // No modo normal exige o ultimo passo; no atalho "concluir agora" nao.
        if (!early && !data.embalado) { showStep(STEPS.indexOf('embalado')); return; }

        const btn = document.getElementById(early ? 'quizEarlySubmit' : 'quizSubmit');
        const original = btn ? btn.innerHTML : '';
        if (btn) { btn.disabled = true; btn.innerHTML = 'A enviar...'; }

        // Modo widget: regista a lead só no dashboard (track 'submit' -> quiz-progress)
        // e mostra o ecrã de sucesso. Não chama o weby antigo.
        if (WIDGET) {
            track('submit', 'review');
            showSuccess();
            widgetResize();
            if (window.dataLayer) window.dataLayer.push({ event: 'lead_submitted', lead_type: 'widget', variante: CONFIG.VARIANTE });
            return;
        }

        const leadData = {
            origem: data.origem,
            destino: data.destino,
            viatura: deriveViatura(),
            urgencia: apiUrgencia(),
            nome: data.nome,
            email: data.email,
            telefone: data.telefone,
            observacoes: early ? buildObservacoesPartial() : buildObservacoes(),
            variante: early ? (CONFIG.VARIANTE + '-RAPIDO') : CONFIG.VARIANTE,
            timestamp: new Date().toISOString()
        };

        fetch(CONFIG.LEAD_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(leadData)
        })
            .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(function () {
                track('submit', 'review');
                showSuccess();
                if (window.dataLayer) window.dataLayer.push({ event: 'lead_submitted', lead_type: 'quiz', variante: CONFIG.VARIANTE });
            })
            .catch(function (err) {
                console.log('Erro ao enviar lead:', err && err.message);
                if (btn) { btn.disabled = false; btn.innerHTML = original; refreshIcons(); }
                alert('Nao foi possivel enviar. Contacte-nos: 214 304 546');
            });
    }

    // ------------------------------------------------
    // Horario de operacao (texto de confirmacao) — dias uteis + feriados PT + horario
    // Ajustar BUSINESS se o horario mudar no dashboard (Horario de operacao automatica).
    // ------------------------------------------------
    var BUSINESS = { startHour: 8, endHour: 20, weekends: false };

    function easterSundayPT(y) {
        var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4,
            f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30,
            i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7,
            m = Math.floor((a + 11 * h + 22 * l) / 451),
            month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
        return new Date(y, month - 1, day);
    }
    function isHolidayPT(dt) {
        var md = (dt.getMonth() + 1) + '-' + dt.getDate();
        // Feriados nacionais fixos
        if (['1-1', '4-25', '5-1', '6-10', '8-15', '10-5', '11-1', '12-1', '12-8', '12-25'].indexOf(md) >= 0) return true;
        // Moveis: Sexta-feira Santa (-2), Pascoa (0), Corpo de Deus (+60)
        var eas = easterSundayPT(dt.getFullYear());
        return [-2, 0, 60].some(function (off) {
            var x = new Date(eas); x.setDate(eas.getDate() + off);
            return (x.getMonth() + 1) + '-' + x.getDate() === md;
        });
    }
    function isBusinessOpen() {
        var now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Lisbon' }));
        var dow = now.getDay(); // 0=dom, 6=sab
        if (!BUSINESS.weekends && (dow === 0 || dow === 6)) return false;
        if (isHolidayPT(now)) return false;
        var h = now.getHours();
        return h >= BUSINESS.startHour && h < BUSINESS.endHour;
    }

    function updateSuccessMessage() {
        var box = document.querySelector('#successScreen .next-steps');
        if (!box) return;
        var phone = '214 304 546';
        if (isBusinessOpen()) {
            box.innerHTML =
                '<p style="font-size:1.1rem;margin-bottom:1rem;"><strong>Pr&oacute;ximos Passos:</strong></p>' +
                '<p>A nossa equipa ir&aacute; analisar o seu pedido</p>' +
                '<p>Entraremos em contacto em <strong>menos de 5 minutos</strong></p>' +
                '<p>Apresentaremos o or&ccedil;amento personalizado</p>' +
                '<p>Detalhes enviados para o seu email</p>';
        } else {
            box.innerHTML =
                '<p style="font-size:1.1rem;margin-bottom:1rem;"><strong>Recebemos o seu pedido!</strong></p>' +
                '<p>Estamos <strong>fora do hor&aacute;rio de atendimento</strong> (dias &uacute;teis, das ' + BUSINESS.startHour + 'h &agrave;s ' + BUSINESS.endHour + 'h).</p>' +
                '<p>A nossa equipa entra em contacto consigo <strong>no pr&oacute;ximo per&iacute;odo &uacute;til</strong>.</p>' +
                '<p>&Eacute; <strong>urgente</strong>? Ligue j&aacute; para <strong>' + phone + '</strong> e falamos consigo agora.</p>';
        }
    }

    function showSuccess() {
        const flow = document.getElementById('quizFlow');
        const success = document.getElementById('successScreen');
        const nm = document.getElementById('confirmedName');
        const em = document.getElementById('confirmedEmail');
        if (nm) nm.textContent = data.nome;
        if (em) em.textContent = data.email;
        if (flow) flow.style.display = 'none';
        if (success) success.classList.add('active');
        updateSuccessMessage();

        setTimeout(function () {
            const form = document.getElementById('form');
            if (form) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
        refreshIcons();
    }

    // ------------------------------------------------
    // Integracao com a pagina (botoes do hero / success)
    // ------------------------------------------------
    function scrollToForm() {
        const form = document.getElementById('form');
        if (!form) return;
        const yOffset = window.innerWidth <= 968 ? -20 : -100;
        const y = form.getBoundingClientRect().top + window.pageYOffset + yOffset;
        window.scrollTo({ top: y, behavior: 'smooth' });
    }

    function patchYourboxForm() {
        if (!window.yourboxForm) { setTimeout(patchYourboxForm, 60); return; }

        // Os CTAs do hero passam a conduzir o quiz (em vez do antigo focus no input origem)
        window.yourboxForm.focusOrigem = function () { scrollToForm(); };
        window.yourboxForm.focusOrigemComUrgencia = function (urgId) {
            const m = { urg1: 'Imediata', urg4: 'Proprio dia', urg24: '24H' };
            if (m[urgId]) data.urgencia = m[urgId];
            scrollToForm();
        };
        // "Fazer Novo Pedido" no success screen
        window.yourboxForm.novoOrcamento = function () { window.location.reload(); };
        // WhatsApp a partir dos dados do quiz
        window.yourboxForm.abrirWhatsApp = function () {
            const msg = 'Ola! Acabei de solicitar um orcamento:\n' +
                'De: ' + data.origem + '\n' +
                'Para: ' + data.destino + '\n' +
                'Urgencia: ' + data.urgencia + '\n' +
                'Carga: ' + data.volumes + ' volumes, ' + totalKg() + ' kg\n' +
                'Gostaria de confirmar os detalhes.';
            window.open('https://wa.me/' + CONFIG.WHATSAPP_NUMBER + '?text=' + encodeURIComponent(msg), '_blank');
        };
    }

    // ------------------------------------------------
    // Geolocalizacao inversa (igual ao index-chat-b)
    // ------------------------------------------------

    // NOTA: removida a prova social por avaliacoes no ecra de sucesso. Para obter o
    // rating chamava-se o endpoint de preco (freeGetServicePriceAPI2026), que GRAVA um
    // preLeadSimulation em CADA chamada -> poluia a coleccao `messages` a cada
    // carregamento do quiz (aparecia como "Simulacao Web ... Lisboa->Porto", inflando
    // as leads e distorcendo o CPL). Nao reintroduzir sem um endpoint read-only dedicado
    // so para as stats, que nao grave simulacoes.

    // ------------------------------------------------
    // Nudge de geolocalizacao — chama atencao para o botao GPS.
    // Uma vez usado (recolha OU entrega), deixa de sugerir no outro campo.
    // ------------------------------------------------
    var geoUsed = false;

    function injectGeoNudgeStyles() {
        if (document.getElementById('yb-gps-nudge-css')) return;
        var st = document.createElement('style');
        st.id = 'yb-gps-nudge-css';
        st.textContent =
            '@keyframes ybGpsPulse{0%{box-shadow:0 0 0 0 rgba(190,214,47,.5)}70%{box-shadow:0 0 0 9px rgba(190,214,47,0)}100%{box-shadow:0 0 0 0 rgba(190,214,47,0)}}' +
            '.btn-gps.gps-hint{color:var(--green,#bed62f);background:rgba(190,214,47,.16);animation:ybGpsPulse 1.5s ease-out infinite}' +
            '.gps-nudge{position:absolute;right:.25rem;bottom:calc(100% + 9px);background:#1a1a1a;color:#fff;font-size:.72rem;font-weight:600;line-height:1.2;padding:.42rem .62rem;border-radius:9px;white-space:nowrap;box-shadow:0 6px 16px rgba(0,0,0,.22);z-index:30;opacity:0;transform:translateY(5px);transition:opacity .28s ease,transform .28s ease;pointer-events:none}' +
            '.gps-nudge.show{opacity:1;transform:translateY(0)}' +
            '.gps-nudge::after{content:"";position:absolute;top:100%;right:14px;border:6px solid transparent;border-top-color:#1a1a1a}';
        document.head.appendChild(st);
    }

    function hideGeoNudge(only) {
        ['origem', 'destino'].forEach(function (id) {
            if (only && id !== only) return;
            var btn = document.getElementById('gps-' + id);
            if (btn) btn.classList.remove('gps-hint');
            var inp = document.getElementById(id);
            var wrap = inp && inp.parentNode;
            var pill = wrap && wrap.querySelector('.gps-nudge');
            if (pill) pill.classList.remove('show');
        });
    }

    function showGeoNudge(step) {
        if (geoUsed) return;
        var inp = document.getElementById(step);
        var btn = document.getElementById('gps-' + step);
        if (!inp || !btn) return;
        if ((inp.value || '').trim().length > 0) return; // ja preenchido: nao sugerir
        var wrap = inp.parentNode;
        if (!wrap) return;
        var pill = wrap.querySelector('.gps-nudge');
        if (!pill) {
            pill = document.createElement('div');
            pill.className = 'gps-nudge';
            pill.innerHTML = 'Usar a minha localiza&ccedil;&atilde;o';
            wrap.appendChild(pill);
        }
        btn.classList.add('gps-hint');
        setTimeout(function () { pill.classList.add('show'); }, 350);
    }

    function geolocateField(inputId) {
        const btn = document.getElementById('gps-' + inputId);
        const input = document.getElementById(inputId);
        if (!btn || !input) return;

        // O utilizador descobriu o botao GPS: parar de sugerir em ambos os campos.
        geoUsed = true;
        hideGeoNudge();

        if (!navigator.geolocation) { showGeoToast('Geolocalizacao nao suportada neste browser.'); return; }
        if (!window.google || !google.maps || !google.maps.Geocoder) { showGeoToast('Servico de mapas indisponivel.'); return; }

        btn.classList.add('gps-loading');
        navigator.geolocation.getCurrentPosition(
            function (pos) {
                const latLng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                try {
                    const geocoder = new google.maps.Geocoder();
                    geocoder.geocode({ location: latLng, region: 'pt' }, function (results, status) {
                        btn.classList.remove('gps-loading');
                        if (status === 'OK' && results && results.length > 0) {
                            const best =
                                results.find(function (r) { return r.types.includes('street_address') || r.types.includes('premise'); }) ||
                                results.find(function (r) { return r.types.includes('route'); }) ||
                                results[0];
                            input.value = best.formatted_address;
                            if (inputId === 'origem') data.origem = best.formatted_address;
                            if (inputId === 'destino') data.destino = best.formatted_address;
                            sendGeo(latLng.lat, latLng.lng, best.formatted_address, inputId);
                            setError(inputId, '');
                            input.dispatchEvent(new Event('input', { bubbles: true }));
                            input.focus();
                            refreshIcons();
                        } else {
                            showGeoToast('Nao foi possivel determinar o endereco.');
                        }
                    });
                } catch (e) {
                    btn.classList.remove('gps-loading');
                    showGeoToast('Erro ao processar localizacao.');
                }
            },
            function (err) {
                btn.classList.remove('gps-loading');
                if (err.code === 1) showGeoToast('Permissao de localizacao negada. Active nas definicoes do browser.');
                else showGeoToast('Nao foi possivel obter a sua localizacao.');
            },
            { timeout: 10000, maximumAge: 60000 }
        );
    }

    function showGeoToast(msg) {
        const t = document.createElement('div');
        t.textContent = msg;
        t.style.cssText = 'position:fixed;bottom:1.5rem;left:50%;transform:translateX(-50%);background:rgba(30,30,30,.92);color:#fff;padding:0.55rem 1.1rem;border-radius:8px;font-size:0.85rem;z-index:99999;max-width:90vw;text-align:center;box-shadow:0 4px 14px rgba(0,0,0,.25);';
        document.body.appendChild(t);
        setTimeout(function () { t.style.opacity = '0'; t.style.transition = 'opacity .4s'; setTimeout(function () { t.remove(); }, 400); }, 3000);
    }

    // ------------------------------------------------
    // Eventos
    // ------------------------------------------------
    function bindEvents() {
        document.querySelectorAll('.quiz-choice[data-choice]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                choose(btn.getAttribute('data-choice'), btn.getAttribute('data-value'), btn);
            });
        });

        // Presets de dimensoes (data-dims) — gravam C/L/A de uma so vez
        document.querySelectorAll('.quiz-choice[data-dims]').forEach(function (btn) {
            btn.addEventListener('click', function () { chooseDims(btn.getAttribute('data-dims'), btn); });
        });

        // Enter avanca nos inputs
        const enterIds = ['nome', 'telefone', 'email', 'origem', 'destino',
                          'quizVolumes', 'quizPeso', 'quizComprimento', 'quizLargura', 'quizAltura'];
        enterIds.forEach(function (id) {
            const inp = document.getElementById(id);
            if (inp) inp.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') { e.preventDefault(); next(); }
            });
        });

        const mat = document.getElementById('quizMaterial');
        if (mat) mat.addEventListener('change', function () { setError('material', ''); });

        // Ao escrever a morada manualmente, dispensa o nudge desse campo
        ['origem', 'destino'].forEach(function (id) {
            const inp = document.getElementById(id);
            if (inp) inp.addEventListener('input', function () {
                if ((inp.value || '').trim().length > 0) hideGeoNudge(id);
            });
        });
    }

    function init() {
        injectGeoNudgeStyles();
        bindEvents();
        patchYourboxForm();
        fetchClientGeo();
        showStep(0);
        refreshIcons();
    }

    window.ybQuiz = { next: next, back: back, choose: choose, submit: submit, showStep: showStep };
    window.geolocateField = geolocateField;

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
