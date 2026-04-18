// ============================================
// YOURBOX - QUEM SOMOS - JAVASCRIPT
// ============================================

// ========== SMOOTH SCROLL ==========
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        
        // Ignorar links com apenas "#" (vazios)
        if (!href || href === '#' || href.length <= 1) {
            return;
        }
        
        e.preventDefault();
        const target = document.querySelector(href);
        
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
});

// ========== ANIMATE ON SCROLL ==========
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
});

document.querySelectorAll('.mvv-card, .diff-card, .stat-item').forEach((el) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(30px)';
    el.style.transition = 'all 0.6s ease';
    observer.observe(el);
});


// ========== DYNAMIC DELIVERY SYSTEM (VERSÃO CORRIGIDA) ==========
class DeliverySystem {
    constructor() {
        this.container = document.getElementById('deliverySystem');
        this.svg = document.getElementById('deliverySvg');
        this.deliveries = [];
        this.maxDeliveries = 6; // Aumentar número de entregas simultâneas
        this.width = 1920;  // ViewBox width
        this.height = 800;  // ViewBox height
        this.init();
    }

    init() {
        if (!this.svg) return;
        
        // Configurar viewBox para o SVG ocupar toda a área
        this.svg.setAttribute('viewBox', `0 0 ${this.width} ${this.height}`);
        this.svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
        
        // Criar múltiplas entregas iniciais
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                this.createDelivery();
            }, i * 800);
        }
        
        this.scheduleNext();
    }

    getRandomPosition() {
        const padding = 100; // Padding em pixels
        return {
            x: padding + Math.random() * (this.width - padding * 2),
            y: padding + Math.random() * (this.height - padding * 2)
        };
    }

    createPath(start, end) {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        
        // Curvatura mais pronunciada
        const curvature = Math.random() * 150 + 100; // Entre 100 e 250
        const direction = Math.random() > 0.5 ? 1 : -1; // Curva aleatória
        const cx = start.x + dx * 0.5 + Math.cos(angle + Math.PI / 2) * curvature * direction;
        const cy = start.y + dy * 0.5 + Math.sin(angle + Math.PI / 2) * curvature * direction;
        
        return `M ${start.x} ${start.y} Q ${cx} ${cy} ${end.x} ${end.y}`;
    }

    createDelivery() {
        if (!this.svg) return;
        
        const start = this.getRandomPosition();
        const end = this.getRandomPosition();
        const pathData = this.createPath(start, end);
        
        const svgNS = "http://www.w3.org/2000/svg";
        
        // Linha do caminho
        const path = document.createElementNS(svgNS, 'path');
        path.setAttribute('d', pathData);
        path.setAttribute('class', 'delivery-path');
        path.setAttribute('stroke', '#bed62f');
        path.setAttribute('stroke-width', '3');
        path.setAttribute('fill', 'none');
        path.setAttribute('opacity', '0.5');
        path.setAttribute('stroke-dasharray', '10, 5');
        
        const pathLength = path.getTotalLength();
        path.style.strokeDasharray = `10 5`;
        path.style.strokeDashoffset = pathLength;
        
        this.svg.appendChild(path);
        
        // Círculo animado (pacote em movimento)
        const box = document.createElementNS(svgNS, 'circle');
        box.setAttribute('r', '8');
        box.setAttribute('fill', '#bed62f');
        box.setAttribute('class', 'delivery-box');
        box.style.filter = 'drop-shadow(0 0 8px rgba(190, 214, 47, 0.8))';
        this.svg.appendChild(box);
        
        // Marcador de origem (pickup)
        const pickup = document.createElementNS(svgNS, 'circle');
        pickup.setAttribute('cx', start.x);
        pickup.setAttribute('cy', start.y);
        pickup.setAttribute('r', '12');
        pickup.setAttribute('fill', '#ff8c00');
        pickup.setAttribute('opacity', '0.8');
        pickup.style.filter = 'drop-shadow(0 0 6px rgba(255, 140, 0, 0.6))';
        this.svg.appendChild(pickup);
        
        // Marcador de destino (delivery)
        const destination = document.createElementNS(svgNS, 'circle');
        destination.setAttribute('cx', end.x);
        destination.setAttribute('cy', end.y);
        destination.setAttribute('r', '12');
        destination.setAttribute('fill', '#bed62f');
        destination.setAttribute('opacity', '0.8');
        destination.style.filter = 'drop-shadow(0 0 6px rgba(190, 214, 47, 0.6))';
        this.svg.appendChild(destination);
        
        const duration = 4000 + Math.random() * 3000; // 4-7 segundos
        const startTime = performance.now();
        
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeProgress = this.easeInOutCubic(progress);
            
            // Animar a linha sendo desenhada
            const currentOffset = pathLength * (1 - easeProgress);
            path.style.strokeDashoffset = currentOffset;
            
            // Mover o pacote ao longo do caminho
            const point = path.getPointAtLength(pathLength * easeProgress);
            box.setAttribute('cx', point.x);
            box.setAttribute('cy', point.y);
            
            // Pulsar o pacote
            const scale = 1 + Math.sin(elapsed * 0.01) * 0.2;
            box.setAttribute('r', 8 * scale);
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                // Fade out ao terminar
                setTimeout(() => {
                    path.style.transition = 'opacity 1s';
                    box.style.transition = 'opacity 1s';
                    pickup.style.transition = 'opacity 1s';
                    destination.style.transition = 'opacity 1s';
                    
                    path.style.opacity = '0';
                    box.style.opacity = '0';
                    pickup.style.opacity = '0';
                    destination.style.opacity = '0';
                    
                    setTimeout(() => {
                        path.remove();
                        box.remove();
                        pickup.remove();
                        destination.remove();
                        this.deliveries = this.deliveries.filter(d => d !== path);
                    }, 1000);
                }, 500);
            }
        };
        
        requestAnimationFrame(animate);
        this.deliveries.push(path);
    }

    easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    scheduleNext() {
        const interval = 1500 + Math.random() * 2500; // 1.5-4 segundos entre entregas
        setTimeout(() => {
            if (this.deliveries.length < this.maxDeliveries) {
                this.createDelivery();
            }
            this.scheduleNext();
        }, interval);
    }
}

// Initialize the delivery system
if (document.getElementById('deliverySystem')) {
    new DeliverySystem();
}

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
        const storageData = localStorage.getItem(CONFIG.cookieName);
        
        try {
            return JSON.parse(cookieData || storageData);
        } catch {
            return null;
        }
    }
    
    // ========== ATIVAR SCRIPTS BASEADO EM CONSENTIMENTO ==========
    function enableScripts(prefs) {
        // Google Analytics (Analíticos)
        if (prefs.analytics && typeof gtag !== 'undefined') {
            gtag('consent', 'update', {
                'analytics_storage': 'granted'
            });
            console.log('✔ Google Analytics ativado');
        } else if (typeof gtag !== 'undefined') {
            gtag('consent', 'update', {
                'analytics_storage': 'denied'
            });
        }
        
        // Marketing (Google Ads, Facebook Pixel)
        if (prefs.marketing) {
            // Google Ads
            if (typeof gtag !== 'undefined') {
                gtag('consent', 'update', {
                    'ad_storage': 'granted',
                    'ad_user_data': 'granted',
                    'ad_personalization': 'granted'
                });
            }
            
            // Facebook Pixel
            if (typeof fbq !== 'undefined') {
                fbq('consent', 'grant');
            }
            
            console.log('✔ Scripts de Marketing ativados');
        } else {
            if (typeof gtag !== 'undefined') {
                gtag('consent', 'update', {
                    'ad_storage': 'denied',
                    'ad_user_data': 'denied',
                    'ad_personalization': 'denied'
                });
            }
            
            if (typeof fbq !== 'undefined') {
                fbq('consent', 'revoke');
            }
        }
        
        // Funcionais (Chat, Vídeos, etc)
        if (prefs.functional) {
            console.log('✔ Scripts Funcionais ativados');
        }
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
    
    // ========== AÇÕES DO UTILIZADOR ==========
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
    
    // Abrir configurações personalizadas
    function openSettings() {
        hideBanner();
        showModal();
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
    
    // Reabrir banner
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