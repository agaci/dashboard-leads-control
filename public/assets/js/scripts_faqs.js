// FAQ Accordion
        document.querySelectorAll('.faq-question').forEach(question => {
            question.addEventListener('click', () => {
                const item = question.parentElement;
                const wasActive = item.classList.contains('active');
                
                // Close all items in same category
                const category = item.closest('.faq-category');
                category.querySelectorAll('.faq-item').forEach(i => {
                    i.classList.remove('active');
                });
                
                // Toggle current item
                if (!wasActive) {
                    item.classList.add('active');
                }
            });
        });

        // Search functionality
        const searchInput = document.getElementById('searchInput');
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            
            document.querySelectorAll('.faq-category').forEach(category => {
                let hasVisibleItems = false;
                
                category.querySelectorAll('.faq-item').forEach(item => {
                    const question = item.querySelector('.question-text').textContent.toLowerCase();
                    const answer = item.querySelector('.answer-text').textContent.toLowerCase();
                    
                    if (question.includes(searchTerm) || answer.includes(searchTerm)) {
                        item.style.display = 'block';
                        hasVisibleItems = true;
                    } else {
                        item.style.display = 'none';
                    }
                });
                
                // Hide category if no items match
                category.style.display = hasVisibleItems ? 'block' : 'none';
            });
        });


        // ============================================
// GOOGLE TAG MANAGER - EVENTOS AVANÇADOS
// ============================================

// Helper function para garantir que dataLayer existe
function pushToDataLayer(eventData) {
    if (typeof window.dataLayer !== 'undefined') {
        window.dataLayer.push(eventData);
        console.log('📊 GTM Event:', eventData.event, eventData);
        return true;
    } else {
        console.warn('⚠️ GTM dataLayer não disponível');
        return false;
    }
}

// ============================================
// 1. PAGEVIEW - FAQs
// ============================================
(function() {
    pushToDataLayer({
        'event': 'faqs_page_view',
        'page_title': 'FAQs - Perguntas Frequentes',
        'page_path': window.location.pathname
    });
})();

// ============================================
// 2. SCROLL TRACKING - Profundidade da página
// ============================================
(function() {
    const scrollThresholds = [25, 50, 75, 90, 100];
    const scrolledThresholds = new Set();
    
    function trackScroll() {
        const scrollPercent = Math.round(
            (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100
        );
        
        scrollThresholds.forEach(threshold => {
            if (scrollPercent >= threshold && !scrolledThresholds.has(threshold)) {
                scrolledThresholds.add(threshold);
                pushToDataLayer({
                    'event': 'scroll_depth',
                    'scroll_percentage': threshold,
                    'page_section': 'faqs'
                });
            }
        });
    }
    
    let scrollTimeout;
    window.addEventListener('scroll', function() {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(trackScroll, 300);
    });
})();

// ============================================
// 3. SEARCH TRACKING - Pesquisa de FAQs
// ============================================
(function() {
    const searchInput = document.getElementById('searchInput');
    let searchTimeout;
    let lastSearchTerm = '';
    
    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            clearTimeout(searchTimeout);
            
            searchTimeout = setTimeout(() => {
                const searchTerm = e.target.value.trim().toLowerCase();
                
                // Só enviar evento se mudou e tem pelo menos 3 caracteres
                if (searchTerm !== lastSearchTerm && searchTerm.length >= 3) {
                    lastSearchTerm = searchTerm;
                    
                    // Contar resultados visíveis
                    const visibleItems = document.querySelectorAll('.faq-item[style*="display: block"], .faq-item:not([style*="display: none"])').length;
                    
                    pushToDataLayer({
                        'event': 'faq_search',
                        'search_term': searchTerm,
                        'results_count': visibleItems,
                        'has_results': visibleItems > 0
                    });
                }
                
                // Clear search
                if (searchTerm.length === 0 && lastSearchTerm.length > 0) {
                    lastSearchTerm = '';
                    pushToDataLayer({
                        'event': 'faq_search_cleared'
                    });
                }
            }, 500); // Esperar 500ms após parar de escrever
        });
        
        // Track focus no search
        searchInput.addEventListener('focus', function() {
            pushToDataLayer({
                'event': 'faq_search_focus',
                'interaction_type': 'search_started'
            });
        });
    }
})();

// ============================================
// 4. FAQ CLICK TRACKING - Abrir/Fechar perguntas
// ============================================
document.querySelectorAll('.faq-question').forEach(question => {
    const originalClickHandler = question.onclick;
    
    question.addEventListener('click', function() {
        const item = this.parentElement;
        const questionText = this.querySelector('.question-text').textContent.trim();
        const category = item.closest('.faq-category');
        const categoryTitle = category ? category.querySelector('.category-title').textContent.trim() : 'Unknown';
        const wasActive = item.classList.contains('active');
        
        // Determinar ação
        const action = wasActive ? 'close' : 'open';
        
        pushToDataLayer({
            'event': 'faq_interaction',
            'faq_action': action,
            'faq_question': questionText,
            'faq_category': categoryTitle,
            'interaction_type': 'click'
        });
        
        // Se abriu, track como FAQ view
        if (!wasActive) {
            pushToDataLayer({
                'event': 'faq_view',
                'faq_question': questionText,
                'faq_category': categoryTitle
            });
        }
    });
});

// ============================================
// 5. CATEGORY VIEW TRACKING - Secções vistas
// ============================================
(function() {
    if ('IntersectionObserver' in window) {
        const categoryObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const category = entry.target;
                    const categoryTitle = category.querySelector('.category-title')?.textContent.trim() || 'Unknown';
                    const categoryIcon = category.querySelector('.category-icon')?.textContent.trim() || '';
                    
                    pushToDataLayer({
                        'event': 'faq_category_view',
                        'category_name': categoryTitle,
                        'category_icon': categoryIcon
                    });
                    
                    // Observar apenas uma vez
                    categoryObserver.unobserve(category);
                }
            });
        }, { threshold: 0.3 });
        
        document.querySelectorAll('.faq-category').forEach(category => {
            categoryObserver.observe(category);
        });
    }
})();

// ============================================
// 6. CTA CLICKS - Botões de contacto
// ============================================

// CTA Section - Ligar/WhatsApp
document.querySelectorAll('.btn-cta').forEach(btn => {
    btn.addEventListener('click', function(e) {
        const btnText = this.textContent.trim();
        const btnHref = this.getAttribute('href');
        const isPhone = btnHref.includes('tel:');
        const isWhatsApp = btnHref.includes('wa.me');
        
        pushToDataLayer({
            'event': 'cta_click',
            'cta_type': isPhone ? 'phone' : (isWhatsApp ? 'whatsapp' : 'other'),
            'cta_text': btnText,
            'cta_location': 'faq_bottom_cta',
            'cta_url': btnHref
        });
    });
});

// Header - Área de Clientes
document.querySelectorAll('.btn-platform').forEach(btn => {
    btn.addEventListener('click', function(e) {
        pushToDataLayer({
            'event': 'navigation_click',
            'link_text': this.textContent.trim(),
            'link_url': this.getAttribute('href'),
            'link_location': 'header'
        });
    });
});

// Header - Telefone
document.querySelectorAll('.btn-phone').forEach(btn => {
    btn.addEventListener('click', function() {
        const phoneNumber = this.getAttribute('href').replace('tel:', '');
        pushToDataLayer({
            'event': 'contact_click',
            'contact_type': 'phone',
            'contact_value': phoneNumber,
            'link_location': 'header'
        });
    });
});

// ============================================
// 7. WHATSAPP FLOAT BUTTON
// ============================================
document.querySelectorAll('.whatsapp-float, .whatsapp-button').forEach(btn => {
    btn.addEventListener('click', function() {
        pushToDataLayer({
            'event': 'contact_click',
            'contact_type': 'whatsapp',
            'contact_value': '351964078194',
            'link_location': 'floating_button'
        });
    });
});

// ============================================
// 8. FOOTER LINKS TRACKING
// ============================================

// Footer - Links de navegação
document.querySelectorAll('.footer-links a').forEach(link => {
    link.addEventListener('click', function() {
        const linkText = this.textContent.trim();
        const linkHref = this.getAttribute('href');
        const isPhone = linkHref.includes('tel:');
        const isWhatsApp = linkHref.includes('wa.me');
        const isEmail = linkHref.includes('mailto:');
        
        if (isPhone || isWhatsApp || isEmail) {
            pushToDataLayer({
                'event': 'contact_click',
                'contact_type': isPhone ? 'phone' : (isWhatsApp ? 'whatsapp' : 'email'),
                'contact_value': linkHref.replace(/^(tel:|mailto:|https:\/\/wa\.me\/)/, ''),
                'link_location': 'footer'
            });
        } else {
            pushToDataLayer({
                'event': 'footer_navigation',
                'link_text': linkText,
                'link_url': linkHref
            });
        }
    });
});

// Footer - Redes sociais
document.querySelectorAll('.social-link').forEach(link => {
    link.addEventListener('click', function() {
        const href = this.getAttribute('href');
        let platform = 'unknown';
        
        if (href.includes('facebook')) platform = 'facebook';
        else if (href.includes('instagram')) platform = 'instagram';
        else if (href.includes('linkedin')) platform = 'linkedin';
        else if (href.includes('youtube') || href.includes('youtu.be')) platform = 'youtube';
        
        pushToDataLayer({
            'event': 'social_media_click',
            'social_platform': platform,
            'link_url': href,
            'link_location': 'footer'
        });
    });
});

// ============================================
// 9. TIME ON PAGE - Tempo na página
// ============================================
(function() {
    const timeThresholds = [30, 60, 120, 300]; // 30s, 1min, 2min, 5min
    const triggered = new Set();
    
    timeThresholds.forEach(threshold => {
        setTimeout(() => {
            if (!triggered.has(threshold)) {
                triggered.add(threshold);
                pushToDataLayer({
                    'event': 'time_on_page',
                    'time_seconds': threshold,
                    'page_name': 'faqs',
                    'engagement_level': threshold >= 120 ? 'high' : (threshold >= 60 ? 'medium' : 'low')
                });
            }
        }, threshold * 1000);
    });
})();

// ============================================
// 10. EXIT INTENT - Quando vai sair da página
// ============================================
(function() {
    let exitEventSent = false;
    
    document.addEventListener('mouseleave', function(e) {
        if (e.clientY < 0 && !exitEventSent) {
            exitEventSent = true;
            
            // Contar quantas FAQs abriram
            const openedFaqs = document.querySelectorAll('.faq-item.active').length;
            const totalFaqs = document.querySelectorAll('.faq-item').length;
            
            pushToDataLayer({
                'event': 'exit_intent',
                'page_name': 'faqs',
                'faqs_opened': openedFaqs,
                'faqs_total': totalFaqs,
                'engagement_percentage': Math.round((openedFaqs / totalFaqs) * 100)
            });
        }
    });
})();

// ============================================
// 11. MOST VIEWED FAQ - FAQ mais vista
// ============================================
(function() {
    const faqViews = new Map();
    
    // Track views
    document.querySelectorAll('.faq-question').forEach(question => {
        question.addEventListener('click', function() {
            const questionText = this.querySelector('.question-text').textContent.trim();
            
            // Incrementar contador
            const currentViews = faqViews.get(questionText) || 0;
            faqViews.set(questionText, currentViews + 1);
            
            // Se for a 3ª vez que vê a mesma FAQ, track como "high interest"
            if (currentViews + 1 === 3) {
                pushToDataLayer({
                    'event': 'faq_high_interest',
                    'faq_question': questionText,
                    'view_count': 3
                });
            }
        });
    });
    
    // Ao sair da página, enviar a FAQ mais vista
    window.addEventListener('beforeunload', function() {
        if (faqViews.size > 0) {
            const mostViewed = Array.from(faqViews.entries()).reduce((a, b) => a[1] > b[1] ? a : b);
            
            pushToDataLayer({
                'event': 'session_summary',
                'most_viewed_faq': mostViewed[0],
                'view_count': mostViewed[1],
                'unique_faqs_viewed': faqViews.size
            });
        }
    });
})();

// ============================================
// 12. HERO ORBIT INTERACTION (se existir)
// ============================================
(function() {
    const orbitContainer = document.querySelector('.icons-orbit');
    
    if (orbitContainer) {
        let interactionTracked = false;
        
        orbitContainer.addEventListener('mouseenter', function() {
            if (!interactionTracked) {
                interactionTracked = true;
                pushToDataLayer({
                    'event': 'hero_interaction',
                    'interaction_type': 'orbit_hover',
                    'page_section': 'hero'
                });
            }
        });
    }
})();

// ============================================
// 13. NO RESULTS SEARCH - Pesquisa sem resultados
// ============================================
(function() {
    const searchInput = document.getElementById('searchInput');
    
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            setTimeout(() => {
                const searchTerm = this.value.trim();
                
                if (searchTerm.length >= 3) {
                    const visibleItems = document.querySelectorAll('.faq-item:not([style*="display: none"])').length;
                    
                    if (visibleItems === 0) {
                        pushToDataLayer({
                            'event': 'faq_search_no_results',
                            'search_term': searchTerm,
                            'suggestion': 'contact_support'
                        });
                    }
                }
            }, 600);
        });
    }
})();

console.log('✔ GTM Tracking avançado carregado para página de FAQs');

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

console.log('✔ Sistema de Cookies completo carregado para FAQs');

// ============================================
// SCROLL TO TOP BUTTON
// ============================================

(function() {
    const scrollButton = document.getElementById('scrollToTop');
    
    if (!scrollButton) {
        console.warn('⚠️ Scroll to top button not found');
        return;
    }
    
    // Mostrar/esconder botão baseado no scroll
    function toggleScrollButton() {
        if (window.scrollY > 300) {
            scrollButton.classList.add('show');
        } else {
            scrollButton.classList.remove('show');
        }
    }
    
    // Scroll suave para o topo
    function scrollToTop() {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
        
        // GTM Event
        if (typeof window.dataLayer !== 'undefined') {
            window.dataLayer.push({
                'event': 'scroll_to_top_click',
                'page': 'faqs'
            });
        }
    }
    
    // Event listeners
    window.addEventListener('scroll', toggleScrollButton);
    scrollButton.addEventListener('click', scrollToTop);
    
    // Verificar posição inicial
    toggleScrollButton();
    
    console.log('✔ Scroll to top button initialized');
})();