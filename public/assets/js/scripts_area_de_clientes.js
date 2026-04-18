// ============================================
// ÁREA DE CLIENTES - YOURBOX
// Gestão de iframe, loading, erros e offline
// ============================================

(function() {
    'use strict';

    // ============================================
    // CONFIGURAÇÕES
    // ============================================
    const CONFIG = {
        platformUrl: 'https://weby-5204.nodechef.com',
        loadTimeout: 15000, // 15 segundos
        retryAttempts: 3,
        retryDelay: 2000 // 2 segundos
    };

    // ============================================
    // ELEMENTOS DO DOM
    // ============================================
    const elements = {
        iframe: document.getElementById('platformFrame'),
        loadingScreen: document.getElementById('loadingScreen'),
        errorScreen: document.getElementById('errorScreen'),
        offlineNotice: document.getElementById('offlineNotice')
    };

    // ============================================
    // ESTADO DA APLICAÇÃO
    // ============================================
    let state = {
        isLoaded: false,
        loadAttempts: 0,
        isOnline: navigator.onLine,
        loadStartTime: Date.now()
    };

    // ============================================
    // INICIALIZAÇÃO
    // ============================================
    function init() {
        console.log('🚀 Inicializando Área de Clientes YOURBOX...');
        
        // Setup event listeners
        setupIframeListeners();
        setupNetworkListeners();
        setupVisibilityListener();
        
        // Iniciar carregamento
        loadPlatform();
        
        // Timeout de segurança
        startLoadTimeout();
    }

    // ============================================
    // CARREGAMENTO DA PLATAFORMA
    // ============================================
    function loadPlatform() {
        state.loadAttempts++;
        console.log(`📡 Tentativa ${state.loadAttempts} de carregar plataforma...`);

        // Verificar se está online
        if (!navigator.onLine) {
            console.warn('❌ Sem conexão à Internet');
            showOfflineNotice();
            return;
        }

        // Garantir que o iframe está visível
        if (elements.iframe) {
            elements.iframe.style.display = 'block';
            
            // Se já tiver src, forçar reload
            if (state.loadAttempts > 1) {
                elements.iframe.src = CONFIG.platformUrl + '?reload=' + Date.now();
            }
        }
    }

    // ============================================
    // EVENT LISTENERS - IFRAME
    // ============================================
    function setupIframeListeners() {
        if (!elements.iframe) {
            console.error('❌ Iframe não encontrado!');
            showError();
            return;
        }

        // Evento: Carregamento bem-sucedido
        elements.iframe.addEventListener('load', function() {
            console.log('✔ Plataforma carregada com sucesso');
            onPlatformLoaded();
        });

        // Evento: Erro no carregamento
        elements.iframe.addEventListener('error', function() {
            console.error('❌ Erro ao carregar plataforma');
            onPlatformError();
        });
    }

    // ============================================
    // PLATAFORMA CARREGADA COM SUCESSO
    // ============================================
    function onPlatformLoaded() {
        state.isLoaded = true;
        
        const loadTime = Date.now() - state.loadStartTime;
        console.log(`⏱️ Tempo de carregamento: ${loadTime}ms`);

        // Adicionar classe para fade-in
        elements.iframe.classList.add('loaded');

        // Esconder loading screen após um pequeno delay
        setTimeout(() => {
            hideLoadingScreen();
        }, 500);

        // Analytics
        trackPlatformLoad(loadTime);
    }

    // ============================================
    // ERRO NO CARREGAMENTO
    // ============================================
    function onPlatformError() {
        console.error('❌ Erro ao carregar iframe');

        // Tentar novamente se ainda houver tentativas
        if (state.loadAttempts < CONFIG.retryAttempts) {
            
            setTimeout(() => {
                loadPlatform();
            }, CONFIG.retryDelay);
        } else {
            console.error('❌ Número máximo de tentativas atingido');
            showError();
        }
    }

    // ============================================
    // TIMEOUT DE CARREGAMENTO
    // ============================================
    function startLoadTimeout() {
        setTimeout(() => {
            if (!state.isLoaded) {
                console.warn('⏰ Timeout de carregamento atingido');
                
                // Se ainda não carregou após o timeout
                if (state.loadAttempts < CONFIG.retryAttempts) {
                    onPlatformError(); // Tentar novamente
                } else {
                    showError();
                }
            }
        }, CONFIG.loadTimeout);
    }

    // ============================================
    // MOSTRAR/ESCONDER LOADING SCREEN
    // ============================================
    function hideLoadingScreen() {
        if (elements.loadingScreen) {
            elements.loadingScreen.classList.add('fade-out');
            setTimeout(() => {
                elements.loadingScreen.style.display = 'none';
            }, 500);
        }
    }

    function showLoadingScreen() {
        if (elements.loadingScreen) {
            elements.loadingScreen.style.display = 'flex';
            elements.loadingScreen.classList.remove('fade-out');
        }
    }

    // ============================================
    // MOSTRAR/ESCONDER ERROR SCREEN
    // ============================================
    function showError() {
        console.error('🚫 Mostrando tela de erro');
        
        hideLoadingScreen();
        
        if (elements.errorScreen) {
            elements.errorScreen.style.display = 'flex';
        }

        // Analytics
        trackPlatformError();
    }

    function hideError() {
        if (elements.errorScreen) {
            elements.errorScreen.style.display = 'none';
        }
    }

    // ============================================
    // RETRY CONNECTION (chamado pelo botão)
    // ============================================
    window.retryConnection = function() {
        
        // Reset estado
        state.loadAttempts = 0;
        state.isLoaded = false;
        state.loadStartTime = Date.now();

        // Esconder erro, mostrar loading
        hideError();
        showLoadingScreen();

        // Tentar carregar novamente
        setTimeout(() => {
            loadPlatform();
            startLoadTimeout();
        }, 500);

        // Analytics
        if (typeof window.dataLayer !== 'undefined') {
            window.dataLayer.push({
                'event': 'platform_retry',
                'retry_attempt': state.loadAttempts
            });
        }
    };

    // ============================================
    // NETWORK STATUS LISTENERS
    // ============================================
    function setupNetworkListeners() {
        window.addEventListener('online', onOnline);
        window.addEventListener('offline', onOffline);
    }

    function onOnline() {
        console.log('🌐 Conexão restaurada');
        state.isOnline = true;
        hideOfflineNotice();

        // Se estava em erro, tentar recarregar
        if (!state.isLoaded && elements.errorScreen.style.display === 'flex') {
            retryConnection();
        }
    }

    function onOffline() {
        console.warn('📡 Conexão perdida');
        state.isOnline = false;
        showOfflineNotice();
    }

    // ============================================
    // OFFLINE NOTICE
    // ============================================
    function showOfflineNotice() {
        if (elements.offlineNotice) {
            elements.offlineNotice.style.display = 'block';
        }
    }

    function hideOfflineNotice() {
        if (elements.offlineNotice) {
            elements.offlineNotice.style.display = 'none';
        }
    }

    // ============================================
    // PAGE VISIBILITY (pausar/retomar quando tab muda)
    // ============================================
    function setupVisibilityListener() {
        document.addEventListener('visibilitychange', function() {
            if (document.hidden) {
                console.log('👁️ Página oculta');
            } else {
                console.log('👁️ Página visível');
                
                // Se estava carregando quando voltou, verificar status
                if (!state.isLoaded) {
                    console.log('🔍 Verificando status de carregamento...');
                }
            }
        });
    }

    // ============================================
    // ANALYTICS TRACKING
    // ============================================
    function trackPlatformLoad(loadTime) {
        if (typeof window.dataLayer !== 'undefined') {
            window.dataLayer.push({
                'event': 'platform_loaded',
                'load_time': loadTime,
                'load_attempts': state.loadAttempts
            });
        }

        if (typeof gtag === 'function') {
            gtag('event', 'platform_access', {
                'event_category': 'Platform',
                'event_label': 'Load Success',
                'value': loadTime
            });
        }
    }

    function trackPlatformError() {
        if (typeof window.dataLayer !== 'undefined') {
            window.dataLayer.push({
                'event': 'platform_error',
                'error_type': 'load_failed',
                'load_attempts': state.loadAttempts
            });
        }

        if (typeof gtag === 'function') {
            gtag('event', 'exception', {
                'description': 'Platform load failed',
                'fatal': true
            });
        }
    }

    // ============================================
    // PERFORMANCE MONITORING
    // ============================================
    function monitorPerformance() {
        if ('PerformanceObserver' in window) {
            const observer = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    console.log('📊 Performance:', entry.name, entry.duration + 'ms');
                }
            });
            
            observer.observe({ entryTypes: ['navigation', 'resource'] });
        }
    }

    // ============================================
    // SECURITY - Prevent Clickjacking
    // ============================================
    function checkFrameAncestors() {
        try {
            // Verificar se está dentro de um iframe (clickjacking)
            if (window !== window.top) {
                console.warn('⚠️ Página carregada dentro de iframe - possível clickjacking');
                // Opcional: redirecionar para página principal
                // window.top.location = window.location;
            }
        } catch (e) {
            console.warn('⚠️ Cross-origin frame detectado');
        }
    }

    // ============================================
    // CONSOLE STYLING (só para desenvolvimento)
    // ============================================
    function initConsoleStyles() {
        const styles = [
            'background: #bed62f',
            'color: #1a1a1a',
            'font-weight: bold',
            'padding: 10px 20px',
            'border-radius: 5px'
        ].join(';');

        console.log('%c🚀 YOURBOX Área de Clientes', styles);
        console.log('%cPlataforma: ' + CONFIG.platformUrl, 'color: #bed62f');
    }

    // ============================================
    // HEARTBEAT - Verificar se iframe ainda responde
    // ============================================
    function startHeartbeat() {
        setInterval(() => {
            if (state.isLoaded && elements.iframe) {
                try {
                    // Tentar comunicar com iframe
                    elements.iframe.contentWindow.postMessage('ping', '*');
                } catch (e) {
                    console.warn('⚠️ Iframe não responde ao heartbeat');
                }
            }
        }, 30000); // A cada 30 segundos
    }

    // ============================================
    // MENSAGENS ENTRE IFRAME E PARENT
    // ============================================
    function setupMessageListener() {
        window.addEventListener('message', function(event) {
            // Verificar origem por segurança
            if (event.origin !== new URL(CONFIG.platformUrl).origin) {
                return;
            }

            console.log('📨 Mensagem recebida do iframe:', event.data);

            // Processar mensagens específicas
            if (event.data === 'pong') {
                console.log('✔ Iframe respondeu ao ping');
            }

            // Outras mensagens podem ser tratadas aqui
            // Exemplo: logout, erros, notificações, etc.
        });
    }

    // ============================================
    // INICIAR TUDO QUANDO DOM ESTIVER PRONTO
    // ============================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            initConsoleStyles();
            checkFrameAncestors();
            init();
            monitorPerformance();
            startHeartbeat();
            setupMessageListener();
        });
    } else {
        initConsoleStyles();
        checkFrameAncestors();
        init();
        monitorPerformance();
        startHeartbeat();
        setupMessageListener();
    }

    // ============================================
    // EXPORT FUNCTIONS (para debug)
    // ============================================
    window.yourboxPlatform = {
        reload: retryConnection,
        getState: () => state,
        getConfig: () => CONFIG
    };

    console.log('✔ Script de Área de Clientes carregado');

})();


 // ================================================
        // COOKIE CONSENT BANNER - NÍVEL 2 COMPLETO
        // ================================================

        (function() {
            'use strict';
            
            // ========== CONFIGURAÇÃO ==========
            const CONFIG = {
                cookieName: 'yourbox_cookie_consent_v2',
                cookieExpiry: 365, // dias
                categories: {
                    necessary: true,      // Sempre ativo
                    analytics: false,
                    marketing: false,
                    functional: false
                }
            };
            
            // ========== GESTÃO DE COOKIES ==========
            function setCookie(name, value, days) {
                const date = new Date();
                date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
                const expires = "expires=" + date.toUTCString();
                document.cookie = name + "=" + value + ";" + expires + ";path=/;SameSite=Lax";
            }
            
            function getCookie(name) {
                const nameEQ = name + "=";
                const ca = document.cookie.split(';');
                for(let i = 0; i < ca.length; i++) {
                    let c = ca[i];
                    while (c.charAt(0) == ' ') c = c.substring(1, c.length);
                    if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
                }
                return null;
            }
            
            function deleteCookie(name) {
                document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
            }
            
            // ========== GUARDAR/CARREGAR PREFERÊNCIAS ==========
            function savePreferences(prefs) {
                const data = JSON.stringify(prefs);
                setCookie(CONFIG.cookieName, data, CONFIG.cookieExpiry);
                localStorage.setItem(CONFIG.cookieName, data);
            }
            
            function loadPreferences() {
                const cookieData = getCookie(CONFIG.cookieName);
                const localData = localStorage.getItem(CONFIG.cookieName);
                const data = cookieData || localData;
                
                if (data) {
                    try {
                        return JSON.parse(data);
                    } catch (e) {
                        console.error('Erro ao carregar preferências:', e);
                    }
                }
                return null;
            }
            
            function hasConsent() {
                return loadPreferences() !== null;
            }
            
            // ========== GOOGLE CONSENT MODE V2 ==========
            function updateGoogleConsent(prefs) {
                if (typeof gtag === 'function') {
                    gtag('consent', 'update', {
                        'analytics_storage': prefs.analytics ? 'granted' : 'denied',
                        'ad_storage': prefs.marketing ? 'granted' : 'denied',
                        'ad_user_data': prefs.marketing ? 'granted' : 'denied',
                        'ad_personalization': prefs.marketing ? 'granted' : 'denied',
                        'functionality_storage': prefs.functional ? 'granted' : 'denied'
                    });
                }
                
                // Push evento para GTM
                if (typeof window.dataLayer !== 'undefined') {
                    window.dataLayer.push({
                        'event': 'cookie_consent_updated',
                        'cookie_preferences': prefs
                    });
                }
            }
            
            // ========== CONTROLAR SCRIPTS EXTERNOS ==========
            function enableScripts(prefs) {
                // Desbloquear Google Analytics se aceite
                if (prefs.analytics && typeof gtag === 'function') {
                    console.log('✔ Google Analytics ativado');
                }
                
                // Desbloquear Marketing scripts se aceite
                if (prefs.marketing) {
                    console.log('✔ Scripts de Marketing ativados');
                }
                
                // Atualizar Google Consent Mode
                updateGoogleConsent(prefs);
            }
            
            // ========== UI - BANNER ==========
            function showBanner() {
                const banner = document.getElementById('cookieBanner');
                if (banner) {
                    setTimeout(() => {
                        banner.classList.add('show');
                    }, 500);
                }
            }
            
            function hideBanner() {
                const banner = document.getElementById('cookieBanner');
                if (banner) {
                    banner.classList.remove('show');
                }
            }
            
            // ========== UI - MODAL ==========
            function showModal() {
                const modal = document.getElementById('cookieModal');
                if (modal) {
                    modal.classList.add('show');
                    document.body.style.overflow = 'hidden';
                    
                    // Carregar preferências atuais nos toggles
                    const prefs = loadPreferences() || CONFIG.categories;
                    document.getElementById('cookieAnalytics').checked = prefs.analytics;
                    document.getElementById('cookieMarketing').checked = prefs.marketing;
                    document.getElementById('cookieFunctional').checked = prefs.functional;
                }
            }
            
            function hideModal() {
                const modal = document.getElementById('cookieModal');
                if (modal) {
                    modal.classList.remove('show');
                    document.body.style.overflow = '';
                }
            }
            
            // ========== UI - BADGE ==========
            function showBadge() {
                const badge = document.getElementById('cookieReopenBadge');
                if (badge) {
                    setTimeout(() => {
                        badge.classList.add('show');
                    }, 1000);
                }
            }
            
            function hideBadge() {
                const badge = document.getElementById('cookieReopenBadge');
                if (badge) {
                    badge.classList.remove('show');
                }
            }
            
            // ========== AÇÕES DOS BOTÕES ==========
            
            // Aceitar TODOS os cookies
            function acceptAll() {
                const prefs = {
                    necessary: true,
                    analytics: true,
                    marketing: true,
                    functional: true,
                    timestamp: new Date().toISOString()
                };
                
                savePreferences(prefs);
                enableScripts(prefs);
                hideBanner();
                hideModal();
                showBadge();
                
                console.log('✔ Todos os cookies aceites');
            }
            
            // Rejeitar TODOS os cookies (exceto necessários)
            function rejectAll() {
                const prefs = {
                    necessary: true,
                    analytics: false,
                    marketing: false,
                    functional: false,
                    timestamp: new Date().toISOString()
                };
                
                savePreferences(prefs);
                enableScripts(prefs);
                hideBanner();
                hideModal();
                showBadge();
                
                console.log('❌ Cookies opcionais rejeitados');
            }
            
            // Guardar preferências personalizadas
            function saveCustomPreferences() {
                const prefs = {
                    necessary: true,
                    analytics: document.getElementById('cookieAnalytics').checked,
                    marketing: document.getElementById('cookieMarketing').checked,
                    functional: document.getElementById('cookieFunctional').checked,
                    timestamp: new Date().toISOString()
                };
                
                savePreferences(prefs);
                enableScripts(prefs);
                hideBanner();
                hideModal();
                showBadge();
                
                console.log('💾 Preferências personalizadas guardadas:', prefs);
            }
            
            // Abrir modal de personalização
            function openSettings() {
                hideBanner();
                showModal();
            }
            
            // Reabrir banner (via badge)
            function reopenBanner() {
                deleteCookie(CONFIG.cookieName);
                localStorage.removeItem(CONFIG.cookieName);
                hideBadge();
                showBanner();
            }
            
            // ========== EVENT LISTENERS ==========
            function setupEventListeners() {
                // Banner - Botões principais
                const acceptAllBtn = document.getElementById('cookieAcceptAll');
                const rejectAllBtn = document.getElementById('cookieRejectAll');
                const settingsBtn = document.getElementById('cookieSettings');
                
                if (acceptAllBtn) acceptAllBtn.addEventListener('click', acceptAll);
                if (rejectAllBtn) rejectAllBtn.addEventListener('click', rejectAll);
                if (settingsBtn) settingsBtn.addEventListener('click', openSettings);
                
                // Modal - Botões
                const modalClose = document.getElementById('cookieModalClose');
                const saveSettingsBtn = document.getElementById('cookieSaveSettings');
                const acceptAllModalBtn = document.getElementById('cookieAcceptAllModal');
                
                if (modalClose) modalClose.addEventListener('click', hideModal);
                if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', saveCustomPreferences);
                if (acceptAllModalBtn) acceptAllModalBtn.addEventListener('click', acceptAll);
                
                // Fechar modal ao clicar fora
                const modalOverlay = document.getElementById('cookieModal');
                if (modalOverlay) {
                    modalOverlay.addEventListener('click', function(e) {
                        if (e.target === modalOverlay) {
                            hideModal();
                        }
                    });
                }
                
                // Badge de reabertura
                const reopenBadge = document.getElementById('cookieReopenBadge');
                if (reopenBadge) {
                    reopenBadge.addEventListener('click', reopenBanner);
                }
            }
            
            // ========== INICIALIZAÇÃO ==========
            function init() {
                console.log('🍪 Sistema de Cookies Yourbox iniciado');
                
                // Setup event listeners
                setupEventListeners();
                
                // Verificar se já tem consentimento
                const savedPrefs = loadPreferences();
                
                if (savedPrefs) {
                    // Já tem preferências guardadas
                    console.log('📋 Preferências carregadas:', savedPrefs);
                    enableScripts(savedPrefs);
                    showBadge();
                } else {
                    // Primeira visita - mostrar banner
                    console.log('🆕 Primeira visita - mostrando banner');
                    showBanner();
                }
            }
            
            // ========== EXECUTAR ==========
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', init);
            } else {
                init();
            }
            
        })();