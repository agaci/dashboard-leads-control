// Switch between platform mockup views
function switchPlatformView(view) {
    // Remove active from all tabs
    document.querySelectorAll('.mockup-tab-mini').forEach(tab => {
        tab.classList.remove('active');
    });

    // Remove active from all views
    document.querySelectorAll('.mockup-view').forEach(v => {
        v.classList.remove('active');
    });

    // Add active to selected
    event.target.classList.add('active');
    document.getElementById('platform-' + view).classList.add('active');

    // Add driver markers to tracking map
    if (view === 'tracking') {
        addDriverMarkers();
    }

    // Add location markers to service map
    if (view === 'service') {
        addServiceMarkers();
    }
}

// Add animated driver markers to tracking map


/* ============================================
   JAVASCRIPT PARA GERAR CIDADE - PARA APLICAR
   ============================================ */

/* LOCALIZAÇÃO: No ficheiro index_final_com_plataforma.html
   Procurar por: function addDriverMarkers()
   SUBSTITUIR a função completa por esta nova versão
*/

// NOVA VERSÃO - Adiciona cidade + markers
function addDriverMarkers() {
    const map = document.getElementById('mockup-map-tracking');
    if (!map) return;
    
    // Remover markers existentes
    const existingMarkers = map.querySelectorAll('.driver-marker-mini, .city-block, .city-park, .map-city');
    existingMarkers.forEach(m => m.remove());

    // Criar container da cidade
    const cityContainer = document.createElement('div');
    cityContainer.className = 'map-city';
    map.insertBefore(cityContainer, map.firstChild);

    // GERAR QUARTEIRÕES (edifícios)
    const blocks = [
        { top: '10%', left: '10%', width: '15%', height: '18%' },
        { top: '10%', left: '35%', width: '12%', height: '15%' },
        { top: '10%', left: '65%', width: '18%', height: '20%' },
        { top: '35%', left: '8%', width: '14%', height: '16%' },
        { top: '35%', left: '55%', width: '16%', height: '14%' },
        { top: '60%', left: '12%', width: '18%', height: '15%' },
        { top: '60%', left: '40%', width: '14%', height: '18%' },
        { top: '60%', left: '70%', width: '15%', height: '16%' },
    ];

    blocks.forEach(block => {
        const el = document.createElement('div');
        el.className = 'city-block';
        el.style.cssText = `
            top: ${block.top};
            left: ${block.left};
            width: ${block.width};
            height: ${block.height};
        `;
        cityContainer.appendChild(el);
    });

    // GERAR PARQUES (áreas verdes)
    const parks = [
        { top: '12%', left: '50%', width: '10%', height: '12%' },
        { top: '38%', left: '28%', width: '18%', height: '14%' },
        { top: '65%', left: '58%', width: '9%', height: '10%' },
    ];

    parks.forEach(park => {
        const el = document.createElement('div');
        el.className = 'city-park';
        el.style.cssText = `
            top: ${park.top};
            left: ${park.left};
            width: ${park.width};
            height: ${park.height};
        `;
        cityContainer.appendChild(el);
    });

    // ADICIONAR MARKERS DOS DRIVERS
    const drivers = ['D1', 'D2', 'D3', 'D4'];
    const positions = [
        { top: '20%', left: '30%' },
        { top: '30%', left: '65%' },
        { top: '60%', left: '35%' },
        { top: '70%', left: '75%' }
    ];

    drivers.forEach((driver, index) => {
        const marker = document.createElement('div');
        marker.className = 'driver-marker-mini';
        marker.setAttribute('data-label', driver);
        marker.style.cssText = `
            top: ${positions[index].top};
            left: ${positions[index].left};
        `;
        map.appendChild(marker);
    });
}

/* ============================================
   TAMBÉM ATUALIZAR: addServiceMarkers()
   ============================================ */

// NOVA VERSÃO - Service map com cidade
function addServiceMarkers() {
    const map = document.getElementById('mockup-map-service');
    if (!map) return;
    
    // Remover markers existentes
    const existingMarkers = map.querySelectorAll('.location-marker-mini, .city-block, .city-park, .map-city');
    existingMarkers.forEach(m => m.remove());

    // Criar container da cidade
    const cityContainer = document.createElement('div');
    cityContainer.className = 'map-city';
    map.insertBefore(cityContainer, map.firstChild);

    // GERAR QUARTEIRÕES (menos denso que tracking)
    const blocks = [
        { top: '15%', left: '15%', width: '18%', height: '20%' },
        { top: '15%', left: '60%', width: '20%', height: '18%' },
        { top: '45%', left: '10%', width: '16%', height: '18%' },
        { top: '45%', left: '50%', width: '18%', height: '16%' },
        { top: '70%', left: '30%', width: '15%', height: '15%' },
    ];

    blocks.forEach(block => {
        const el = document.createElement('div');
        el.className = 'city-block';
        el.style.cssText = `
            top: ${block.top};
            left: ${block.left};
            width: ${block.width};
            height: ${block.height};
        `;
        cityContainer.appendChild(el);
    });

    // GERAR PARQUES
    const parks = [
        { top: '20%', left: '38%', width: '15%', height: '12%' },
        { top: '50%', left: '70%', width: '12%', height: '14%' },
    ];

    parks.forEach(park => {
        const el = document.createElement('div');
        el.className = 'city-park';
        el.style.cssText = `
            top: ${park.top};
            left: ${park.left};
            width: ${park.width};
            height: ${park.height};
        `;
        cityContainer.appendChild(el);
    });

    // ADICIONAR LOCATION MARKERS
    const locations = ['A', 'B', 'C'];
    const positions = [
        { top: '25%', left: '25%' },
        { top: '35%', left: '65%' },
        { top: '70%', left: '50%' }
    ];

    locations.forEach((loc, index) => {
        const marker = document.createElement('div');
        marker.className = 'location-marker-mini';
        marker.style.cssText = `
            top: ${positions[index].top};
            left: ${positions[index].left};
        `;
        map.appendChild(marker);
    });
}

// ==================================
// NO FINAL DO FICHEIRO scripts.js
// ==================================

// ============= SCROLL TO TOP BUTTON =============

// Mostrar/Ocultar botão
window.addEventListener('scroll', function() {
    const scrollButton = document.getElementById('scrollToTop');
    if (!scrollButton) return;
    
    if (window.pageYOffset > 300) {
        scrollButton.classList.add('show');
    } else {
        scrollButton.classList.remove('show');
    }
});

// Ação de clique
document.addEventListener('DOMContentLoaded', function() {
    const scrollButton = document.getElementById('scrollToTop');
    if (!scrollButton) return;
    
    scrollButton.addEventListener('click', function(e) {
        e.preventDefault();
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    // Add markers to initial view (tracking)
    setTimeout(() => {
        addDriverMarkers();
    }, 500);
});

// Usar no caso de browsers sem suporte para 'smooth' behavior
// Descomentar se necessário:

// ✔ CÓDIGO CORRIGIDO:
const scrollBtn = document.getElementById('scrollToTop');
if (scrollBtn) {
    scrollBtn.addEventListener('click', function(e) {
        e.preventDefault();
        scrollToTop();
    });
}



/// ================================================
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






