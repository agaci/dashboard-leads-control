 // Scroll to form function
        function scrollToForm() {
            document.getElementById('formulario').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        // Team Growing Animation
        class TeamAnimation {
            constructor() {
                this.container = document.getElementById('teamAnimation');
                this.members = [];
                this.maxMembers = 15;
                this.init();
            }

            init() {
                this.createMember();
            }

            getRandomPosition() {
                return {
                    x: 10 + Math.random() * 80,
                    y: 10 + Math.random() * 80
                };
            }

            createMember() {
                if (this.members.length >= this.maxMembers) {
                    // Start removing old members
                    this.removeOldest();
                }

                const position = this.getRandomPosition();
                const member = document.createElement('div');
                member.className = 'team-member';
                member.style.left = position.x + '%';
                member.style.top = position.y + '%';
                
                // Random delay for staggered appearance
                const delay = Math.random() * 500;
                member.style.animationDelay = delay + 'ms';
                
                this.container.appendChild(member);
                this.members.push({ element: member, timestamp: Date.now() });

                // Schedule next member
                const nextDelay = 1500 + Math.random() * 2000;
                setTimeout(() => this.createMember(), nextDelay);
            }

            removeOldest() {
                if (this.members.length > 0) {
                    const oldest = this.members.shift();
                    oldest.element.style.animation = 'memberDisappear 1s ease-out forwards';
                    setTimeout(() => oldest.element.remove(), 1000);
                }
            }
        }

        // Add disappear animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes memberDisappear {
                to {
                    opacity: 0;
                    transform: scale(0);
                }
            }
        `;
        document.head.appendChild(style);

        // Initialize animation
        new TeamAnimation();


        // ============================================
        // FORMULÁRIO DE CANDIDATURA
        // ============================================

        // Configuração da API
        const API_URL = 'http://yb.serveftp.com:3000/api/submitJobApplication';
        //const API_URL = 'https://weby-5204.nodechef.com/api/submitJobApplication';

        // Feedback visual do upload de ficheiro
        document.getElementById('cvFile').addEventListener('change', function(e) {
            const fileName = e.target.files[0]?.name;
            const label = e.target.nextElementSibling;
            
            if (fileName) {
                label.innerHTML = `✔ ${fileName}`;
                label.style.color = '#bed62f';
            } else {
                label.innerHTML = '📎 Clique para anexar o seu CV';
                label.style.color = '#666';
            }
        });

        // Função para converter ficheiro para Base64
        function fileToBase64(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = () => {
                    // Remover o prefixo "data:application/pdf;base64,"
                    const base64 = reader.result.split(',')[1];
                    resolve(base64);
                };
                reader.onerror = error => reject(error);
            });
        }

        // Função de validação de email
        function isValidEmail(email) {
            const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return regex.test(email);
        }

        // Função de validação de telefone (Portugal)
        function isValidPhone(phone) {
            // Remove espaços e caracteres especiais
            const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');
            // Aceita +351 ou 00351 ou direto 9 dígitos
            const regex = /^(\+351|00351)?[1-9]\d{8}$/;
            return regex.test(cleanPhone);
        }

        // Mostrar mensagem de feedback
        function showFeedback(type, message) {
            // Remover feedback anterior se existir
            const oldFeedback = document.querySelector('.form-feedback');
            if (oldFeedback) {
                oldFeedback.remove();
            }

            // Criar novo feedback
            const feedback = document.createElement('div');
            feedback.className = `form-feedback form-feedback-${type}`;
            feedback.innerHTML = message;

            // Inserir antes do botão de submit
            const form = document.querySelector('.application-form');
            const submitBtn = form.querySelector('.btn-submit');
            form.insertBefore(feedback, submitBtn);

            // Scroll suave até o feedback
            feedback.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Remover após 10 segundos (só para sucesso e erro, não para loading)
            if (type !== 'loading') {
                setTimeout(() => {
                    feedback.style.opacity = '0';
                    setTimeout(() => feedback.remove(), 300);
                }, 10000);
            }
        }

        // Processar envio do formulário
        document.querySelector('.application-form').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            console.log('📋 Iniciando envio de candidatura...');
            
            // ============================================
            // 1. CAPTURAR DADOS DO FORMULÁRIO
            // ============================================
            const formData = {
                nome: this.querySelector('input[type="text"]').value.trim(),
                email: this.querySelector('input[type="email"]').value.trim(),
                telefone: this.querySelector('input[type="tel"]').value.trim(),
                area: this.querySelector('select[required]').value,
                cidade: this.querySelectorAll('input[type="text"]')[1].value.trim(),
                disponibilidade: this.querySelectorAll('select')[1].value || 'A negociar',
                mensagem: this.querySelector('textarea').value.trim()
            };

            // ============================================
            // 2. VALIDAÇÕES
            // ============================================
            
            // Validar nome (mínimo 3 caracteres)
            if (formData.nome.length < 3) {
                showFeedback('error', '❌ Por favor, insira o seu nome completo (mínimo 3 caracteres)');
                return;
            }

            // Validar email
            if (!isValidEmail(formData.email)) {
                showFeedback('error', '❌ Por favor, insira um email válido');
                return;
            }

            // Validar telefone
            if (!isValidPhone(formData.telefone)) {
                showFeedback('error', '❌ Por favor, insira um número de telefone válido (ex: +351 912 345 678)');
                return;
            }

            // Validar área de interesse
            if (!formData.area) {
                showFeedback('error', '❌ Por favor, selecione uma área de interesse');
                return;
            }

            // Validar cidade
            if (formData.cidade.length < 2) {
                showFeedback('error', '❌ Por favor, indique a sua cidade/região');
                return;
            }

            // ============================================
            // 3. PROCESSAR CV (se existir)
            // ============================================
            const cvFileInput = document.getElementById('cvFile');
            const cvFile = cvFileInput.files[0];

            if (cvFile) {
                // Validar tipo de ficheiro
                if (cvFile.type !== 'application/pdf') {
                    showFeedback('error', '❌ Por favor, anexe apenas ficheiros PDF');
                    return;
                }

                // Validar tamanho (máximo 5MB)
                const maxSize = 5 * 1024 * 1024; // 5MB em bytes
                if (cvFile.size > maxSize) {
                    showFeedback('error', '❌ O ficheiro CV é muito grande. Tamanho máximo: 5MB');
                    return;
                }

                // Converter para Base64
                try {
                    formData.cvFileName = cvFile.name;
                    formData.cvFileData = await fileToBase64(cvFile);
                    console.log('✔ CV convertido para Base64');
                } catch (error) {
                    console.error('❌ Erro ao processar CV:', error);
                    showFeedback('error', '❌ Erro ao processar o ficheiro CV. Tente novamente.');
                    return;
                }
            } else {
                formData.cvFileName = null;
                formData.cvFileData = null;
            }

            // ============================================
            // 4. MOSTRAR LOADING
            // ============================================
            const submitBtn = this.querySelector('.btn-submit');
            const originalBtnText = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '⏳ A enviar candidatura...';
            submitBtn.style.opacity = '0.6';
            submitBtn.style.cursor = 'not-allowed';

            showFeedback('loading', '⏳ A processar a sua candidatura... Por favor aguarde.');

            // ============================================
            // 5. ENVIAR PARA API
            // ============================================
            try {
                console.log('🚀 Enviando dados para API:', API_URL);
                
                const response = await fetch(API_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(formData)
                });

                const result = await response.json();

                console.log('📨 Resposta da API:', result);

                // ============================================
                // 6. PROCESSAR RESPOSTA
                // ============================================
                if (response.ok && result.success) {
                    // SUCESSO! 🎉
                    showFeedback('success', `
                        🎉 <strong>Candidatura enviada com sucesso!</strong><br><br>
                        Obrigado <strong>${formData.nome}</strong>! Recebemos a sua candidatura para <strong>${formData.area}</strong>.<br>
                        Enviámos um email de confirmação para <strong>${formData.email}</strong>.<br><br>
                        A nossa equipa de RH entrará em contacto em breve. 💚
                    `);

                    // Limpar formulário
                    this.reset();
                    document.querySelector('label[for="cvFile"]').innerHTML = '📎 Clique para anexar o seu CV';
                    document.querySelector('label[for="cvFile"]').style.color = '#666';

                    // Tracking GTM (se disponível)
                    if (typeof window.dataLayer !== 'undefined') {
                        window.dataLayer.push({
                            'event': 'job_application_submitted',
                            'job_area': formData.area,
                            'city': formData.cidade
                        });
                        console.log('📊 GTM Event: job_application_submitted');
                    }

                } else {
                    // ERRO do servidor
                    throw new Error(result.message || 'Erro ao enviar candidatura');
                }

            } catch (error) {
                console.error('❌ Erro:', error);
                showFeedback('error', `
                    ❌ <strong>Erro ao enviar candidatura</strong><br><br>
                    ${error.message}<br><br>
                    Por favor, tente novamente ou contacte-nos diretamente:<br>
                    📧 <a href="mailto:rh@yourbox.com.pt" style="color: #bed62f;">rh@yourbox.com.pt</a><br>
                    ✆ 214 304 546
                `);
            } finally {
                // Restaurar botão
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
                submitBtn.style.opacity = '1';
                submitBtn.style.cursor = 'pointer';
            }
        });

        // ============================================
        // TRACKING DE EVENTOS (GTM)
        // ============================================

        // Tracking: Clique em "Candidatar-me" nos cards de vagas
        document.querySelectorAll('.btn-apply').forEach(btn => {
            btn.addEventListener('click', function() {
                const positionCard = this.closest('.position-card');
                const positionTitle = positionCard.querySelector('.position-title').textContent;
                
                if (typeof window.dataLayer !== 'undefined') {
                    window.dataLayer.push({
                        'event': 'job_position_click',
                        'position_name': positionTitle
                    });
                    console.log('📊 GTM Event: job_position_click -', positionTitle);
                }
            });
        });

        // Tracking: Tempo no formulário
        let formStartTime = null;

        document.querySelector('.application-form').addEventListener('focusin', function() {
            if (!formStartTime) {
                formStartTime = Date.now();
                console.log('⏱️ Utilizador começou a preencher formulário');
            }
        }, { once: true });

        // Tracking: Clique no email do RH
        document.querySelectorAll('a[href^="mailto:rh@yourbox.com.pt"]').forEach(link => {
            link.addEventListener('click', function() {
                if (typeof window.dataLayer !== 'undefined') {
                    window.dataLayer.push({
                        'event': 'rh_email_click',
                        'contact_type': 'email'
                    });
                    console.log('📊 GTM Event: rh_email_click');
                }
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
        // 1. PAGEVIEW - Carreiras
        // ============================================
        (function() {
            pushToDataLayer({
                'event': 'carreiras_page_view',
                'page_title': 'Carreiras - YOURBOX',
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
                            'page_section': 'carreiras'
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
        // 3. VIEW POSITION - Ver vagas disponíveis
        // ============================================
        (function() {
            const positionCards = document.querySelectorAll('.position-card');
            
            if ('IntersectionObserver' in window && positionCards.length > 0) {
                const observer = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            const card = entry.target;
                            const positionTitle = card.querySelector('.position-title')?.textContent || 'Desconhecido';
                            const positionBadge = card.querySelector('.position-badge')?.textContent || '';
                            
                            pushToDataLayer({
                                'event': 'view_job_position',
                                'job_title': positionTitle,
                                'job_badge': positionBadge,
                                'interaction_type': 'view'
                            });
                            
                            // Observar apenas uma vez
                            observer.unobserve(card);
                        }
                    });
                }, { threshold: 0.5 });
                
                positionCards.forEach(card => observer.observe(card));
            }
        })();

        // ============================================
        // 4. CLICK POSITION - Clique em "Candidatar-me"
        // ============================================
        document.querySelectorAll('.btn-apply').forEach(btn => {
            btn.addEventListener('click', function(e) {
                const positionCard = this.closest('.position-card');
                const positionTitle = positionCard.querySelector('.position-title')?.textContent || 'Desconhecido';
                const positionBadge = positionCard.querySelector('.position-badge')?.textContent || '';
                
                pushToDataLayer({
                    'event': 'click_apply_button',
                    'job_title': positionTitle,
                    'job_badge': positionBadge,
                    'button_location': 'position_card',
                    'interaction_type': 'click'
                });
            });
        });

        // ============================================
        // 5. FORM INTERACTION - Início do preenchimento
        // ============================================
        (function() {
            const form = document.querySelector('.application-form');
            let formStarted = false;
            let formStartTime = null;
            let fieldsInteracted = new Set();
            
            if (form) {
                // Tracking quando começa a preencher
                form.addEventListener('focusin', function(e) {
                    if (!formStarted) {
                        formStarted = true;
                        formStartTime = Date.now();
                        
                        pushToDataLayer({
                            'event': 'form_start',
                            'form_name': 'job_application',
                            'form_location': 'carreiras_page'
                        });
                    }
                    
                    // Track individual fields
                    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
                        const fieldName = e.target.type === 'text' ? 
                            (e.target.previousElementSibling?.textContent || 'unknown') : 
                            e.target.type;
                        
                        if (!fieldsInteracted.has(fieldName)) {
                            fieldsInteracted.add(fieldName);
                            
                            pushToDataLayer({
                                'event': 'form_field_interaction',
                                'field_name': fieldName,
                                'form_name': 'job_application'
                            });
                        }
                    }
                }, true);
                
                // Tracking de abandono (sai da página sem submeter)
                window.addEventListener('beforeunload', function() {
                    if (formStarted && formStartTime) {
                        const timeSpent = Math.round((Date.now() - formStartTime) / 1000);
                        const fieldsCompleted = Array.from(fieldsInteracted).length;
                        
                        pushToDataLayer({
                            'event': 'form_abandonment',
                            'form_name': 'job_application',
                            'time_spent_seconds': timeSpent,
                            'fields_completed': fieldsCompleted,
                            'total_fields': 8
                        });
                    }
                });
            }
        })();

        // ============================================
        // 6. FILE UPLOAD - Anexar CV
        // ============================================
        document.getElementById('cvFile')?.addEventListener('change', function(e) {
            const file = e.target.files[0];
            
            if (file) {
                const fileSizeKB = Math.round(file.size / 1024);
                const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
                
                pushToDataLayer({
                    'event': 'cv_upload',
                    'file_name': file.name,
                    'file_size_kb': fileSizeKB,
                    'file_size_mb': fileSizeMB,
                    'file_type': file.type
                });
            }
        });

        // ============================================
        // 7. FORM FIELD COMPLETION - Campos preenchidos
        // ============================================
        (function() {
            const form = document.querySelector('.application-form');
            
            if (form) {
                // Tracking quando cada campo obrigatório é preenchido
                const requiredFields = form.querySelectorAll('[required]');
                
                requiredFields.forEach(field => {
                    field.addEventListener('blur', function() {
                        if (this.value.trim() !== '') {
                            const fieldLabel = this.previousElementSibling?.textContent || 
                                            this.closest('.form-group')?.querySelector('.form-label')?.textContent || 
                                            'unknown';
                            
                            pushToDataLayer({
                                'event': 'form_field_completed',
                                'field_name': fieldLabel.replace('*', '').trim(),
                                'form_name': 'job_application'
                            });
                        }
                    });
                });
                
                // Track campo de área selecionada
                const areaSelect = form.querySelector('select[required]');
                if (areaSelect) {
                    areaSelect.addEventListener('change', function() {
                        pushToDataLayer({
                            'event': 'job_area_selected',
                            'job_area': this.value,
                            'form_name': 'job_application'
                        });
                    });
                }
            }
        })();

        // ============================================
        // 8. CTA CLICKS - Botões de contacto
        // ============================================

        // Email RH
        document.querySelectorAll('a[href^="mailto:rh@yourbox.com.pt"]').forEach(link => {
            link.addEventListener('click', function() {
                pushToDataLayer({
                    'event': 'contact_click',
                    'contact_type': 'email',
                    'contact_value': 'rh@yourbox.com.pt',
                    'link_location': 'carreiras_page'
                });
            });
        });

        // Telefone
        document.querySelectorAll('a[href^="tel:"]').forEach(link => {
            link.addEventListener('click', function() {
                const phoneNumber = this.getAttribute('href').replace('tel:', '');
                pushToDataLayer({
                    'event': 'contact_click',
                    'contact_type': 'phone',
                    'contact_value': phoneNumber,
                    'link_location': this.closest('header') ? 'header' : 'footer'
                });
            });
        });

        // WhatsApp
        document.querySelectorAll('a[href*="wa.me"]').forEach(link => {
            link.addEventListener('click', function() {
                pushToDataLayer({
                    'event': 'contact_click',
                    'contact_type': 'whatsapp',
                    'contact_value': '351964078194',
                    'link_location': 'floating_button'
                });
            });
        });

        // Área de Clientes
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

        // ============================================
        // 9. SOCIAL MEDIA CLICKS - Redes sociais
        // ============================================
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
        // 10. HERO CTA - Ver Vagas Disponíveis
        // ============================================
        document.querySelector('.hero-cta')?.addEventListener('click', function(e) {
            pushToDataLayer({
                'event': 'cta_click',
                'cta_text': this.textContent.trim(),
                'cta_location': 'hero_section',
                'cta_destination': this.getAttribute('href')
            });
        });

        // ============================================
        // 11. NAVIGATION - Links internos
        // ============================================
        document.querySelectorAll('a[href*="index.php"], a[href*="quem_somos"], a[href*="faqs"]').forEach(link => {
            link.addEventListener('click', function() {
                pushToDataLayer({
                    'event': 'internal_navigation',
                    'link_text': this.textContent.trim(),
                    'link_url': this.getAttribute('href'),
                    'link_location': this.closest('footer') ? 'footer' : 'header'
                });
            });
        });

        // ============================================
        // 12. TIME ON PAGE - Tempo na página
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
                            'page_name': 'carreiras',
                            'engagement_level': threshold >= 120 ? 'high' : (threshold >= 60 ? 'medium' : 'low')
                        });
                    }
                }, threshold * 1000);
            });
        })();

        // ============================================
        // 13. VISIBILITY TRACKING - Secções vistas
        // ============================================
        (function() {
            const sections = [
                { selector: '.hero', name: 'hero' },
                { selector: '.benefits-section', name: 'benefits' },
                { selector: '.positions-section', name: 'positions' },
                { selector: '.process-section', name: 'process' },
                { selector: '.application-section', name: 'application_form' },
                { selector: '.cta-section', name: 'cta' }
            ];
            
            if ('IntersectionObserver' in window) {
                const observer = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            const sectionName = entry.target.dataset.sectionName;
                            pushToDataLayer({
                                'event': 'section_view',
                                'section_name': sectionName,
                                'page_name': 'carreiras'
                            });
                            observer.unobserve(entry.target);
                        }
                    });
                }, { threshold: 0.3 });
                
                sections.forEach(section => {
                    const element = document.querySelector(section.selector);
                    if (element) {
                        element.dataset.sectionName = section.name;
                        observer.observe(element);
                    }
                });
            }
        })();

        // ============================================
        // 14. ERROR TRACKING - Erros no formulário
        // ============================================
        (function() {
            const form = document.querySelector('.application-form');
            
            if (form) {
                form.addEventListener('invalid', function(e) {
                    e.preventDefault();
                    const fieldLabel = e.target.closest('.form-group')?.querySelector('.form-label')?.textContent || 'unknown';
                    
                    pushToDataLayer({
                        'event': 'form_validation_error',
                        'field_name': fieldLabel.replace('*', '').trim(),
                        'error_type': 'required_field',
                        'form_name': 'job_application'
                    });
                }, true);
            }
        })();

        console.log('✔ GTM Tracking avançado carregado para página de Carreiras');


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
                'page': 'carreiras'
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