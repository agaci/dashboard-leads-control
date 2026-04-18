/**
 * ============================================
 * YOURBOX FORM - Sistema de Captação de Leads
 * Versão: 2.1 (CORRIGIDA - 2 Passos Simplificados)
 * ============================================
 */

(function() {
    'use strict';

    // ============================================
    // CONFIGURAÇÃO
    // ============================================
    const CONFIG = {
        // API URL (TESTE - sem SSL)
        API_URL: 'http://yb.serveftp.com:3000/api/freeGetServicePriceAPI2026',
        //API_URL: 'https://weby-5204.nodechef.com/api/freeGetServicePriceAPI2026',
        // WhatsApp
        WHATSAPP_NUMBER: '351964078194',
        
        // Google Places
        GOOGLE_PLACES_OPTIONS: {
            componentRestrictions: { country: 'pt' },
            fields: ['formatted_address', 'geometry', 'name']
        }
    };

    // ============================================
    // ESTADO DO FORM
    // ============================================
    let formState = {
        currentStep: 1,
        data: {
            origem: '',
            destino: '',
            viatura: 'Moto',
            urgencia: '1 Hora',
            email: '',
            telefone: '',
            simulationId: null
        },
        priceData: {
            estimated: null,
            final: null,
            discount: null,
            original: null
        }
    };

    // ============================================
    // INICIALIZAÇÃO
    // ============================================
    function init() {
        console.log('🚀 Yourbox Form - Inicializando...');
        
        // Inicializar Google Places Autocomplete
        initGooglePlaces();
        
        // Scroll suave para links
        initSmoothScroll();
        // ADICIONAR: Atualizar stats do hero
        //updateHeroStats();
        
        
    }

    // ============================================
    // GOOGLE PLACES AUTOCOMPLETE
    // ============================================
    function initGooglePlaces() {
        try {
            const origemInput = document.getElementById('origem');
            const destinoInput = document.getElementById('destino');

            if (!origemInput || !destinoInput) {
                console.warn('⚠️ Inputs de origem/destino não encontrados');
                return;
            }

            // Criar autocomplete para origem
            const autocompleteOrigem = new google.maps.places.Autocomplete(
                origemInput, 
                CONFIG.GOOGLE_PLACES_OPTIONS
            );

            // Criar autocomplete para destino
            const autocompleteDestino = new google.maps.places.Autocomplete(
                destinoInput, 
                CONFIG.GOOGLE_PLACES_OPTIONS
            );

            // Listener para origem
            autocompleteOrigem.addListener('place_changed', function() {
                const place = autocompleteOrigem.getPlace();
                if (place && place.formatted_address) {
                    origemInput.value = place.formatted_address;
                    formState.data.origem = place.formatted_address;
                    console.log('📍 Origem selecionada:', place.formatted_address);
                }
            });

            // Listener para destino
            autocompleteDestino.addListener('place_changed', function() {
                const place = autocompleteDestino.getPlace();
                if (place && place.formatted_address) {
                    destinoInput.value = place.formatted_address;
                    formState.data.destino = place.formatted_address;
                   
                }
            });

           
        } catch (error) {
            console.error('❌ Erro ao inicializar Google Places:', error);
        }
    }

    // ============================================
    // SMOOTH SCROLL
    // ============================================
    function initSmoothScroll() {
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function(e) {
                e.preventDefault();
                const target = document.querySelector(this.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({ 
                        behavior: 'smooth', 
                        block: 'start' 
                    });
                }
            });
        });
    }

    // ============================================
    // NAVEGAÇÃO ENTRE STEPS
    // ============================================
    function showStep(stepNumber) {
        formState.currentStep = stepNumber;

        // Esconder todos os steps
        document.querySelectorAll('.form-step').forEach(step => {
            step.classList.remove('active');
        });

        // Esconder success screen
        document.getElementById('successScreen').classList.remove('active');

        // Mostrar step atual
        const currentStepEl = document.getElementById('step' + stepNumber);
        if (currentStepEl) {
            currentStepEl.classList.add('active');
        }

        // Atualizar progress bar
        for (let i = 1; i <= 2; i++) {
            const progress = document.getElementById('progress' + i);
            if (progress) {
                if (i <= stepNumber) {
                    progress.classList.add('active');
                } else {
                    progress.classList.remove('active');
                }
            }
        }

        // Atualizar títulos
        const titles = {
            1: { title: 'Calcule Agora', subtitle: 'Preço instantâneo e sem compromisso' },
            2: { title: 'Obter Preço Exato', subtitle: 'Garanta o seu desconto de 10%' }
        };

        if (titles[stepNumber]) {
            document.getElementById('formTitle').textContent = titles[stepNumber].title;
            document.getElementById('formSubtitle').textContent = titles[stepNumber].subtitle;
        }

        // Scroll em mobile
        if (window.innerWidth <= 968) {
            setTimeout(() => {
                document.getElementById('form').scrollIntoView({ 
                    behavior: 'smooth',
                    block: 'start'
                });
            }, 100);
        }
    }

    function goToStep1() {
        showStep(1);
    }

    // ============================================
    // FASE 1: CALCULAR PREÇO (SEM CONTACTO)
    // ============================================
    function goToStep2() {
        // Validar Step 1
        const origem = document.getElementById('origem').value.trim();
        const destino = document.getElementById('destino').value.trim();

        if (!origem || !destino) {
            showAlert('⚠️ Por favor, preencha origem e destino', 'error');
            
            // NOVO: Focus no campo vazio com animação
            const campoVazio = !origem ? document.getElementById('origem') : document.getElementById('destino');
            
            if (campoVazio) {
                // Scroll suave para o campo
                campoVazio.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'center' 
                });
                
                // Focus após scroll
                setTimeout(() => {
                    campoVazio.focus();
                    
                    // Animação de destaque (mesma do focusOrigem)
                    campoVazio.style.transition = 'all 0.3s';
                    campoVazio.style.borderColor = 'var(--green)';
                    campoVazio.style.boxShadow = '0 0 0 3px rgba(190, 214, 47, 0.2)';
                    
                    setTimeout(() => {
                        campoVazio.style.borderColor = '';
                        campoVazio.style.boxShadow = '';
                    }, 2000);
                }, 300);
            }
            
            return;
        }

        // Guardar dados
        formState.data.origem = origem;
        formState.data.destino = destino;
        formState.data.viatura = document.querySelector('input[name="viatura"]:checked').value;
        formState.data.urgencia = document.querySelector('input[name="urgencia"]:checked').value;

       

        // Desabilitar botão
        const btn = document.getElementById('btnStep1');
        btn.disabled = true;
        btn.textContent = '⏳ Calculando...';

        // Chamar API FASE 1 (SEM email/telefone)
        callAPIPhase1()
            .then(() => {
                // Sucesso - mostrar Step 2
                showStep(2);
                btn.disabled = false;
                btn.textContent = '🏷️ Ver Preço Estimado';
            })
            .catch(error => {
                console.error('❌ Erro API Fase 1:', error);
                showAlert('❌ Erro ao calcular preço. Tente novamente.', 'error');
                btn.disabled = false;
                btn.textContent = '🏷️ Ver Preço Estimado';
            });
    }

    function callAPIPhase1() {
        return new Promise((resolve, reject) => {
            // Construir URL com parâmetros (SEM email/telefone)
            const params = new URLSearchParams({
                local_recolha: formState.data.origem,
                local_entrega: formState.data.destino,
                viatura: formState.data.viatura,
                urgencia: formState.data.urgencia,
                variante: 'B'
                // NÃO enviar email e telemovel na FASE 1
            });

            const url = `${CONFIG.API_URL}?${params.toString()}`;
            
           

            fetch(url)
                .then(response => {
                    if (!response.ok) {
                        throw new Error('Resposta inválida da API');
                    }
                    return response.json();
                })
                .then(data => {
                    console.log('✔ API FASE 1 Response:', data);

                    // ============================================
                    // CORREÇÃO: Aceitar AMBOS os formatos de resposta
                    // ============================================
                    let responseBody;
                    
                    // Formato 1: {statusCode: 200, body: {...}}
                    if (data.statusCode === 200 && data.body) {
                        responseBody = data.body;
                    }
                    // Formato 2: {success: true, ...} (direto)
                    else if (data.success === true) {
                        responseBody = data;
                    }
                    else {
                        throw new Error('Formato de resposta inválido');
                    }

                    // Guardar simulationId
                    if (responseBody.simulationId) {
                        formState.data.simulationId = responseBody.simulationId;
                    }

                    // Guardar preço
                    formState.priceData.estimated = responseBody.price || responseBody.priceWithDiscount || '0.00';

                    // Atualizar UI do Step 2
                    updateStep2UI(responseBody);

                    resolve(data);
                })
                .catch(error => {
                    console.error('❌ Erro fetch API FASE 1:', error);
                    reject(error);
                });
        });
    }

    function updateStep2UI(apiData) {
        // Definir icons no início da função
        const icons = {
            'Moto': '🏍️ Moto',
            'Furgão Classe 1': '🚐 Furgão C1',
            'Furgão Classe 2': '🚚 Furgão C2'
        };

        const urgencyIcons = {
            '1 Hora': '⚡',
            '4 Horas': '🚀',
            '24 Horas': '📦'
        };
        
        // Verificar se é serviço 24h (preço = 0 ou requiresContact)
        const price = parseFloat(apiData.priceWithDiscount || apiData.price || '0');
        const isCustomQuote = price === 0 || apiData.requiresContact === true;
        
        // ============================================
        // ATUALIZAR PREÇO
        // ============================================
        const priceDisplay = document.getElementById('priceRange');
        if (priceDisplay) {
            if (isCustomQuote) {
                // Serviço 24h - mostrar mensagem em vez de preço
                priceDisplay.innerHTML = '<span style="font-size: 1.2rem;">Orçamento Personalizado</span>';
                
                // Alterar também a label
                const priceLabel = priceDisplay.closest('.price-display').querySelector('.price-label');
                if (priceLabel) {
                    priceLabel.textContent = 'Preço sob Consulta';
                }
            } else {
                // Preço normal - mostrar breakdown com desconto
                const originalPrice = price / 0.9; // preço com desconto é 90% do original
                const discountAmount = originalPrice - price;
                
                priceDisplay.innerHTML = `
                    <div class="final-price-breakdown" style="margin-bottom: 0.5rem;">
                        <span class="original-price">€${originalPrice.toFixed(2)}</span>
                        <span class="discount-badge">-€${discountAmount.toFixed(2)}</span>
                    </div>
                    <div style="font-size: 2.5rem; font-weight: 900;">€${price.toFixed(2)}</div>
                `;
                
                // Garantir que a label volta ao normal se vier de 24h
                const priceLabel = priceDisplay.closest('.price-display').querySelector('.price-label');
                if (priceLabel) {
                    priceLabel.textContent = 'Orçamento Estimado';
                }
            }
        }

        // ============================================
        // ATUALIZAR RESUMO DA ROTA (em cima)
        // ============================================
        const routeSummary = document.getElementById('routeSummary');
        if (routeSummary) {
            const origemCidade = formState.data.origem.split(',')[0];
            const destinoCidade = formState.data.destino.split(',')[0];
            routeSummary.innerHTML = `📍 ${origemCidade} → ${destinoCidade}`;
        }
        
        const serviceSummary = document.getElementById('serviceSummary');
        if (serviceSummary) {
            const icon = urgencyIcons[formState.data.urgencia] || '⚡';
            serviceSummary.innerHTML = `${icons[formState.data.viatura]} • ${icon} ${formState.data.urgencia}`;
        }

        // ============================================
        // PRICE NOTE - FIXO (não atualizar)
        // ============================================
        // A price-note fica sempre como "✨ Desconto de 10% já incluído" no HTML
        // Não precisa ser atualizada aqui

        // ============================================
        // ATUALIZAR STATS (se existirem)
        // ============================================
        if (apiData.stats) {
            const statsElement = document.querySelector('.social-proof');
            if (statsElement) {
                statsElement.innerHTML = `
                    <p>👥 <strong>${apiData.stats.simulationsToday} pessoas</strong> calcularam o preço hoje</p>
                    <p>⭐ <strong>${apiData.stats.rating}/5</strong> em ${apiData.stats.totalReviews.toLocaleString('pt-PT')} avaliações</p>
                `;
            }
        }

        console.log('✔ UI Step 2 atualizada' + (isCustomQuote ? ' - Orçamento Personalizado' : ''));

        // ============================================
        // 📊 EVENTO GOOGLE ADS: Calculate Price
        // ============================================
        if (typeof window.dataLayer !== 'undefined') {
            window.dataLayer.push({
                'event': 'calculate_price',
                'price_value': price,
                'vehicle_type': formState.data.viatura,
                'urgency': formState.data.urgencia,
                'origin': formState.data.origem,
                'destination': formState.data.destino,
                'distance_km': apiData.distance || 0,
                'is_custom_quote': isCustomQuote,
                'currency': 'EUR'
            });
            console.log('📊 GTM Event: calculate_price', { price, vehicle: formState.data.viatura });
        }
    }

    // ============================================
    // FASE 2: SUBMETER LEAD (COM CONTACTO)
    // ============================================
    function submitLead() {
        // Validar Step 2
        const email = document.getElementById('email').value.trim();
        const telefone = document.getElementById('telefone').value.trim();

        if (!email || !telefone) {
            showAlert('⚠️ Por favor, preencha email e telefone', 'error');
            return;
        }

        // Validar formato email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            showAlert('⚠️ Por favor, insira um email válido', 'error');
            return;
        }

        // Guardar dados
        formState.data.email = email;
        formState.data.telefone = telefone;

        console.log('📊 Dados Step 2:', formState.data);

        // Desabilitar botão
        const btn = document.getElementById('btnStep2');
        btn.disabled = true;
        btn.textContent = '⏳ Enviando...';

        // Chamar API FASE 2 (COM email/telefone)
        callAPIPhase2()
            .then(() => {

                // ============================================
                // 📊 EVENTO GOOGLE ADS: Submit Lead Form
                // ============================================
                if (typeof window.dataLayer !== 'undefined') {
                    window.dataLayer.push({
                        'event': 'submit_lead_form',
                        'form_type': 'price_quote_with_contact',
                        'lead_value': formState.priceData.estimated,
                        'vehicle_type': formState.data.viatura,
                        'urgency': formState.data.urgencia,
                        'currency': 'EUR'
                    });
                    console.log('📊 GTM Event: submit_lead_form');
                }
                // Sucesso - mostrar success screen
                showSuccessScreen();
                btn.disabled = false;
                btn.textContent = '✔ Solicitar Contacto (10% OFF)';
            })
            .catch(error => {
                console.error('❌ Erro API Fase 2:', error);
                showAlert('❌ Erro ao processar pedido. Tente novamente ou contacte-nos via WhatsApp.', 'error');
                btn.disabled = false;
                btn.textContent = '✔ Solicitar Contacto (10% OFF)';
            });
    }

    function callAPIPhase2() {
        return new Promise((resolve, reject) => {
            // Construir URL com TODOS os parâmetros (COM email/telefone)
            const params = new URLSearchParams({
                local_recolha: formState.data.origem,
                local_entrega: formState.data.destino,
                viatura: formState.data.viatura,
                urgencia: formState.data.urgencia,
                email: formState.data.email,
                telemovel: formState.data.telefone,
                variante: 'B'
            });

            const url = `${CONFIG.API_URL}?${params.toString()}`;
            
            console.log('📡 API FASE 2:', url);

            fetch(url)
                .then(response => {
                    if (!response.ok) {
                        throw new Error('Resposta inválida da API');
                    }
                    return response.json();
                })
                .then(data => {
                    console.log('✔ API FASE 2 Response:', data);

                    // ============================================
                    // CORREÇÃO: Aceitar AMBOS os formatos de resposta
                    // ============================================
                    let responseBody;
                    
                    // Formato 1: {statusCode: 200, body: {...}}
                    if (data.statusCode === 200 && data.body) {
                        responseBody = data.body;
                    }
                    // Formato 2: {success: true, ...} (direto)
                    else if (data.success === true) {
                        responseBody = data;
                    }
                    else {
                        throw new Error('Formato de resposta inválido');
                    }

                    // Guardar preços finais
                    formState.priceData.final = responseBody.priceWithDiscount || responseBody.price || '0.00';
                    formState.priceData.original = responseBody.price || '0.00';
                    formState.priceData.discount = responseBody.discount || '0.00';

                    // ADICIONAR: Guardar estatísticas
                    if (responseBody.stats) {
                        formState.priceData.stats = responseBody.stats;
                    }

                    resolve(data);
                })
                .catch(error => {
                    console.error('❌ Erro fetch API FASE 2:', error);
                    reject(error);
                });
        });
    }

    // ============================================
    // SUCCESS SCREEN
    // ============================================
    function showSuccessScreen() {

        // Debug
        console.log('🔍 formState.priceData.stats:', formState.priceData.stats);
        // Esconder steps
        document.querySelectorAll('.form-step').forEach(step => {
            step.classList.remove('active');
        });

        // NOVO: Verificar se é orçamento personalizado
        const finalPrice = parseFloat(formState.priceData.final);
        const isCustomQuote = finalPrice === 0;

        // Atualizar dados na success screen
        document.getElementById('confirmedEmail').textContent = formState.data.email;
        
        if (isCustomQuote) {
            // Orçamento Personalizado (Serviço 24h)
            document.getElementById('finalPrice').innerHTML = '<span style="font-size: 2rem;">Sob Consulta</span>';
            
            // Esconder breakdown de preço
            const priceBreakdown = document.querySelector('.final-price-breakdown');
            if (priceBreakdown) {
                priceBreakdown.style.display = 'none';
            }
            
            // Alterar nota do preço
            const priceNote = document.querySelector('.price-display .price-note');
            if (priceNote) {
                priceNote.textContent = 'Orçamento customizado baseado em análise inteligente de rotas e disponibilidade';
            }
            
            // Alterar próximos passos
            const nextSteps = document.querySelector('.next-steps');
            if (nextSteps) {
                nextSteps.innerHTML = `
                    <p style="margin: 0.75rem 0; font-size: 0.95rem; color: #1565c0;">✔ Entraremos em contacto em <strong>5 minutos</strong></p>
                    <p style="margin: 0.75rem 0; font-size: 0.95rem; color: #1565c0;">✔ Análise inteligente de rota otimizada</p>
                    <p style="margin: 0.75rem 0; font-size: 0.95rem; color: #1565c0;">✔ Preço mais competitivo garantido</p>
                    <p style="margin: 0.75rem 0; font-size: 0.95rem; color: #1565c0;">📧 Detalhes enviados para o seu email</p>
                `;
            }
        } else {
            // Preço Normal (1h/4h)
            document.getElementById('finalPrice').textContent = '€' + formState.priceData.final;
            document.getElementById('originalPrice').textContent = '€' + formState.priceData.original;
            document.getElementById('discount').textContent = formState.priceData.discount;
            
            // Garantir que breakdown está visível
            const priceBreakdown = document.querySelector('.final-price-breakdown');
            if (priceBreakdown) {
                priceBreakdown.style.display = 'flex';
            }
        }

        // Mostrar success screen
        const successScreen = document.getElementById('successScreen');
        successScreen.classList.add('active');
        successScreen.style.display = 'block';

        if (formState.priceData.stats) {
            console.log('✔ Atualizando stats no Success Screen:', formState.priceData.stats);
            
            const successProof = document.querySelector('.success-screen .social-proof');
            console.log('📍 Elemento encontrado:', successProof);
            
            if (successProof) {
                successProof.innerHTML = `
                    <p>👥 <strong>${formState.priceData.stats.simulationsToday} pessoas</strong> calcularam o preço hoje</p>
                    <p>⭐ <strong>${formState.priceData.stats.rating}/5</strong> em ${formState.priceData.stats.totalReviews.toLocaleString('pt-PT')} avaliações</p>
                `;
                console.log('✔ Stats atualizadas no DOM');
            } else {
                console.error('❌ Elemento .social-proof não encontrado dentro de .success-screen');
            }
        } else {
            console.warn('⚠️ formState.priceData.stats está undefined');
        }

        // Scroll para success
        setTimeout(() => {
            successScreen.scrollIntoView({ 
                behavior: 'smooth',
                block: 'start'
            });
        }, 100);

        console.log('✔ Success screen exibida' + (isCustomQuote ? ' - Orçamento Personalizado' : ''));
    }

    // ============================================
    // WHATSAPP
    // ============================================
    function abrirWhatsApp() {
        const msg = `Olá! Acabei de solicitar um orçamento:

        📍 De: ${formState.data.origem}
        📍 Para: ${formState.data.destino}
        🚗 Viatura: ${formState.data.viatura}
        ⏱️ Urgência: ${formState.data.urgencia}
        💰 Preço: €${formState.priceData.final}

        📧 Email: ${formState.data.email}
        📱 Telefone: ${formState.data.telefone}

        Gostaria de confirmar os detalhes.`;

        const url = `https://wa.me/${CONFIG.WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
        window.open(url, '_blank');
        
        console.log('💬 WhatsApp aberto');
    }

    // ============================================
    // NOVO ORÇAMENTO (RESET)
    // ============================================
    function novoOrcamento() {
        // Reset form data
        formState.data = {
            origem: '',
            destino: '',
            viatura: 'Moto',
            urgencia: '1 Hora',
            email: '',
            telefone: '',
            simulationId: null
        };
        formState.priceData = {
            estimated: null,
            final: null,
            discount: null,
            original: null
        };

        // Limpar inputs
        document.getElementById('origem').value = '';
        document.getElementById('destino').value = '';
        document.getElementById('email').value = '';
        document.getElementById('telefone').value = '';

        // Reset radio buttons
        document.getElementById('moto').checked = true;
        document.getElementById('urg1').checked = true;

        // Esconder success screen
        document.getElementById('successScreen').style.display = 'none';

        // Voltar ao Step 1
        showStep(1);

        // Scroll para form
        setTimeout(() => {
            document.getElementById('form').scrollIntoView({ 
                behavior: 'smooth',
                block: 'start'
            });
        }, 100);

    }

    // ============================================
    // FOCUS NO INPUT ORIGEM
    // ============================================
    function focusOrigem() {
        const origemInput = document.getElementById('origem');
        
        if (!origemInput) return;

        // Scroll para form
        const form = document.getElementById('form');
        if (form) {
            const yOffset = window.innerWidth <= 968 ? -20 : -100;
            const y = form.getBoundingClientRect().top + window.pageYOffset + yOffset;
            
            window.scrollTo({
                top: y,
                behavior: 'smooth'
            });
        }

        // Focus no input após scroll
        setTimeout(() => {
            origemInput.focus();
            
            // Animação de destaque (opcional)
            origemInput.style.transition = 'all 0.3s';
            origemInput.style.borderColor = 'var(--green)';
            origemInput.style.boxShadow = '0 0 0 3px rgba(190, 214, 47, 0.2)';
            
            setTimeout(() => {
                origemInput.style.borderColor = '';
                origemInput.style.boxShadow = '';
            }, 2000);
        }, 600);

        console.log('🎯 Focus no input origem');

        // ============================================
        // 📊 EVENTO GOOGLE ADS: View Form
        // ============================================
        if (typeof window.dataLayer !== 'undefined') {
            // Evitar duplicados (só dispara 1x por sessão)
            if (!sessionStorage.getItem('form_viewed')) {
                window.dataLayer.push({
                    'event': 'view_form',
                    'form_type': 'price_calculator'
                });
                sessionStorage.setItem('form_viewed', 'true');
                console.log('📊 GTM Event: view_form');
            }
        }
    }

    // ============================================
    // FOCUS NO INPUT ORIGEM + SELECIONAR URGÊNCIA
    // ============================================
    function focusOrigemComUrgencia(urgencia, viatura) {
        console.log('🎯 Chamada com urgência:', urgencia);
        
        const origemInput = document.getElementById('origem');
        
        if (!origemInput) return;

        // Scroll para form
        const form = document.getElementById('form');
        if (form) {
            const yOffset = window.innerWidth <= 968 ? -20 : -100;
            const y = form.getBoundingClientRect().top + window.pageYOffset + yOffset;
            
            window.scrollTo({
                top: y,
                behavior: 'smooth'
            });
        }

        // Focus no input após scroll
        setTimeout(() => {
            origemInput.focus();
            
            // Animação de destaque
            origemInput.style.transition = 'all 0.3s';
            origemInput.style.borderColor = 'var(--green)';
            origemInput.style.boxShadow = '0 0 0 3px rgba(190, 214, 47, 0.2)';
            
            // Selecionar urgência - COM DEBUG
            console.log('🔍 Procurando radio com ID:', urgencia);
            console.log('🔍 Procurando radio com ID:', viatura);
            const urgenciaRadio = document.getElementById(urgencia);
            const viaturaRadio = document.getElementById(viatura);
            console.log('📻 Radio encontrado?', urgenciaRadio);
             console.log('📻 Radio encontrado?', viaturaRadio);
            
            if (urgenciaRadio) {
                urgenciaRadio.checked = true;
                console.log('✔ Checked aplicado!', urgenciaRadio.checked);
                
                // Trigger change event (caso haja listeners)
                urgenciaRadio.dispatchEvent(new Event('change'));
            } else {
                console.error('❌ Radio button não encontrado com ID:', viatura);
            }

            if (viaturaRadio) {
                viaturaRadio.checked = true;
                console.log('✔ Checked aplicado!', viaturaRadio.checked);
                
                // Trigger change event (caso haja listeners)
                viaturaRadio.dispatchEvent(new Event('change'));
            } else {
                console.error('❌ Radio button não encontrado com ID:', viatura);
            }
            
            setTimeout(() => {
                origemInput.style.borderColor = '';
                origemInput.style.boxShadow = '';
            }, 2000);
        }, 600);
    }

    // ============================================
    // POPUP SERVIÇO DEDICADO
    // ============================================
    function abrirPopupDedicado() {
        const popup = document.getElementById('popupDedicado');
        if (popup) {
            popup.classList.add('active');
            document.body.style.overflow = 'hidden'; // Bloquear scroll do body
            
            // Reset form
            document.getElementById('formDedicado').reset();
            document.getElementById('successDedicado').style.display = 'none';
            document.querySelector('.popup-form').style.display = 'block';
            
            console.log('✔ Popup Dedicado aberto');
        }
    }

    function fecharPopupDedicado() {
        const popup = document.getElementById('popupDedicado');
        console.log(1)
        if (popup) {
            popup.classList.remove('active');
            document.body.style.overflow = ''; // Restaurar scroll do body
            
            console.log('❌ Popup Dedicado fechado');
        }
    }

    // Fechar popup ao clicar fora
    document.addEventListener('click', function(event) {
        const popup = document.getElementById('popupDedicado');
        if (popup && event.target === popup) {
            yourboxForm.fecharPopupDedicado();
        }
    });

    // Fechar popup com tecla ESC
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            const popup = document.getElementById('popupDedicado');
            if (popup && popup.classList.contains('active')) {
                yourboxForm.fecharPopupDedicado();
            }
        }
    });

    // Submit do form dedicado
    // Submit do form dedicado - VERSÃO MELHORADA
    function submitFormDedicado(event) {
        event.preventDefault();
        
        // Desabilitar botão
        const btn = document.getElementById('btnSubmitDedicado');
        btn.disabled = true;
        btn.textContent = '⏳ Enviando...';
        
        // Coletar dados do form
        const formData = {
            empresa: document.getElementById('empresa').value,
            contacto: document.getElementById('contacto').value,
            email: document.getElementById('emailDedicado').value,
            telefone: document.getElementById('telefoneDedicado').value,
            tipoServico: document.getElementById('tipoServico').value,
            volumeEstimado: document.getElementById('volumeEstimado').value,
            mensagem: document.getElementById('mensagem').value || 'Sem mensagem adicional'
        };
        
        console.log('📧 Enviando dados:', formData);
        
        // Enviar email via API
        enviarEmailDedicado(formData)
            .then(() => {
                // Fade out do form
                const formElement = document.querySelector('.popup-form');
                formElement.style.transition = 'opacity 0.5s, transform 0.5s';
                formElement.style.opacity = '0';
                formElement.style.transform = 'translateY(-20px)';
                
                // Após animação, esconder form e mostrar success
                setTimeout(() => {
                    formElement.style.display = 'none';
                    
                    const successElement = document.getElementById('successDedicado');
                    successElement.style.display = 'block';
                    successElement.style.opacity = '0';
                    successElement.style.transform = 'translateY(20px)';
                    
                    // Fade in da mensagem de sucesso
                    setTimeout(() => {
                        successElement.style.transition = 'opacity 0.5s, transform 0.5s';
                        successElement.style.opacity = '1';
                        successElement.style.transform = 'translateY(0)';
                    }, 50);
                }, 500);
                
                // Resetar botão (para próxima vez)
                btn.disabled = false;
                btn.textContent = '📧 Enviar Pedido';
            })
            .catch(error => {
                console.error('❌ Erro ao enviar:', error);
                
                // Mensagem de erro mais elegante
                const formElement = document.querySelector('.popup-form');
                const errorMsg = document.createElement('div');
                errorMsg.className = 'alert alert-error';
                errorMsg.style.marginTop = '1rem';
                errorMsg.innerHTML = `
                    <strong>❌ Erro ao enviar pedido</strong><br>
                    Por favor, tente novamente ou contacte-nos via telefone: 
                    <a href="tel:+351214304546" style="color: inherit; text-decoration: underline;">214 304 546</a>
                `;
                
                // Inserir mensagem de erro
                formElement.appendChild(errorMsg);
                
                // Remover mensagem após 5 segundos
                setTimeout(() => {
                    errorMsg.style.transition = 'opacity 0.3s';
                    errorMsg.style.opacity = '0';
                    setTimeout(() => errorMsg.remove(), 300);
                }, 5000);
                
                // Resetar botão
                btn.disabled = false;
                btn.textContent = '📧 Enviar Pedido';
            });
    }
    // Função para enviar email
    // Função para enviar email - VERSÃO SIMPLIFICADA COM MAILTO
    function enviarEmailDedicado(data) {
        return new Promise((resolve, reject) => {
            // Construir corpo do email
            const emailBody = `
    NOVO PEDIDO - SERVIÇO DEDICADO

    EMPRESA: ${data.empresa}
    CONTACTO: ${data.contacto}
    EMAIL: ${data.email}
    TELEFONE: ${data.telefone}

    TIPO DE SERVIÇO: ${data.tipoServico}
    VOLUME MENSAL: ${data.volumeEstimado}

    MENSAGEM:
    ${data.mensagem}

    ---
    Pedido recebido via website Yourbox
    Data: ${new Date().toLocaleString('pt-PT')}
            `;

            // Usar mailto (abre cliente de email)
            const mailtoLink = `mailto:hjbdmc@gmail.com?subject=${encodeURIComponent('Pedido Serviço Dedicado - ' + data.empresa)}&body=${encodeURIComponent(emailBody)}`;
            
            // Abrir mailto
            window.location.href = mailtoLink;
            
            // Simular sucesso após 1 segundo (tempo para abrir cliente email)
            setTimeout(() => {
                console.log('✔ Email preparado com sucesso');
                resolve();
            }, 1000);
        });
    }


    // ============================================
    // POPUP AGENDAR APRESENTAÇÃO
    // ============================================
    function abrirPopupAgendamento() {
        const popup = document.getElementById('popupAgendamento');
        if (popup) {
            popup.classList.add('active');
            document.body.style.overflow = 'hidden';
            
            // Reset form
            document.getElementById('formAgendamento').reset();
            document.getElementById('successAgendamento').style.display = 'none';
            document.querySelector('#popupAgendamento .popup-form').style.display = 'block';
            
            // Definir data mínima (hoje)
            const hoje = new Date().toISOString().split('T')[0];
            document.getElementById('dataAgendamento').setAttribute('min', hoje);
            
            console.log('✔ Popup Agendamento aberto');
        }
    }

    function fecharPopupAgendamento() {
        const popup = document.getElementById('popupAgendamento');
        if (popup) {
            popup.classList.remove('active');
            document.body.style.overflow = '';
            
            console.log('❌ Popup Agendamento fechado');
        }
    }

    function submitFormAgendamento(event) {
        event.preventDefault();
        
        console.log('🚀 Submit agendamento iniciado');
        
        // Coletar dados do form
        const formData = {
            nome: document.getElementById('nomeAgendamento').value.trim(),
            empresa: document.getElementById('empresaAgendamento').value.trim(),
            email: document.getElementById('emailAgendamento').value.trim(),
            telefone: document.getElementById('telefoneAgendamento').value.trim(),
            cargo: document.getElementById('cargoAgendamento').value.trim() || 'Não informado',
            data: document.getElementById('dataAgendamento').value,
            horario: document.getElementById('horarioAgendamento').value,
            mensagem: document.getElementById('mensagemAgendamento').value.trim() || 'Sem mensagem adicional'
        };
        
        // ============================================
        // VALIDAÇÕES
        // ============================================
        
        // Validar nome
        if (formData.nome.length < 3) {
            alert('⚠️ Por favor, insira o seu nome completo');
            return;
        }
        
        // Validar empresa
        if (formData.empresa.length < 2) {
            alert('⚠️ Por favor, insira o nome da empresa');
            return;
        }
        
        // Validar email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(formData.email)) {
            alert('⚠️ Por favor, insira um email válido');
            return;
        }
        
        // Validar telefone
        const phoneClean = formData.telefone.replace(/[\s\-\(\)]/g, '');
        const phoneRegex = /^(\+351|00351)?[1-9]\d{8}$/;
        if (!phoneRegex.test(phoneClean)) {
            alert('⚠️ Por favor, insira um número de telefone válido (ex: +351 912 345 678)');
            return;
        }
        
        // Validar data
        if (!formData.data) {
            alert('⚠️ Por favor, selecione uma data preferencial');
            return;
        }
        
        // Validar horário
        if (!formData.horario) {
            alert('⚠️ Por favor, selecione um horário preferencial');
            return;
        }
        
        console.log('✔ Validações OK - Dados coletados:', formData);
        
        // Desabilitar botão
        const btn = document.getElementById('btnSubmitAgendamento');
        btn.disabled = true;
        btn.textContent = '⏳ Enviando...';
        btn.style.opacity = '0.6';
        
        // Enviar para API
        enviarAgendamentoParaAPI(formData)
            .then(() => {
                console.log('✔ Agendamento enviado com sucesso');
                
                // Fade out do form
                const formElement = document.querySelector('#popupAgendamento .popup-form');
                formElement.style.transition = 'opacity 0.5s, transform 0.5s';
                formElement.style.opacity = '0';
                formElement.style.transform = 'translateY(-20px)';
                
                // Após animação, esconder form e mostrar success
                setTimeout(() => {
                    formElement.style.display = 'none';
                    
                    const successElement = document.getElementById('successAgendamento');
                    successElement.style.display = 'block';
                    successElement.style.opacity = '0';
                    successElement.style.transform = 'translateY(20px)';
                    
                    // Fade in da mensagem de sucesso
                    setTimeout(() => {
                        successElement.style.transition = 'opacity 0.5s, transform 0.5s';
                        successElement.style.opacity = '1';
                        successElement.style.transform = 'translateY(0)';
                    }, 50);
                    
                    // Limpar formulário
                    document.getElementById('formAgendamento').reset();
                }, 500);
                
                // Tracking GTM
                if (typeof window.dataLayer !== 'undefined') {
                    window.dataLayer.push({
                        'event': 'demo_scheduled',
                        'company': formData.empresa,
                        'scheduled_date': formData.data,
                        'scheduled_time': formData.horario
                    });
                    console.log('📊 GTM Event: demo_scheduled');
                }
                
                // Resetar botão
                btn.disabled = false;
                btn.textContent = '📅 Confirmar Agendamento';
                btn.style.opacity = '1';
            })
            .catch(error => {
                console.error('❌ Erro ao enviar:', error);
                
                // Mensagem de erro
                alert(`❌ Erro ao enviar agendamento\n\n${error.message}\n\nPor favor, tente novamente ou contacte-nos:\n✆ 214 304 546\n📧 info@yourbox.com.pt`);
                
                // Resetar botão
                btn.disabled = false;
                btn.textContent = '📅 Confirmar Agendamento';
                btn.style.opacity = '1';
            });
    }

    function enviarAgendamentoParaAPI(data) {
        return new Promise((resolve, reject) => {
            // URL da API (usar a mesma configuração do formulário principal)
            const API_URL = CONFIG.API_URL.replace('freeGetServicePriceAPI2026', 'submitDemoSchedule');
            
            console.log('🚀 Enviando para API:', API_URL);
            
            fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error('Resposta inválida da API');
                }
                return response.json();
            })
            .then(result => {
                console.log('✔ Resposta da API:', result);
                
                if (result.success || (result.body && result.body.success)) {
                    resolve(result);
                } else {
                    throw new Error(result.message || 'Erro ao processar agendamento');
                }
            })
            .catch(error => {
                console.error('❌ Erro fetch API:', error);
                reject(error);
            });
        });
    }

    // ============================================
    // TOUR INTERATIVO - VER DEMO DA PLATAFORMA
    // ============================================

    // Estado do Tour
    let tourState = {
        currentStep: 0,
        totalSteps: 7,
        isPlaying: false
    };

    // Dados dos Steps do Tour
        const tourSteps = [
        {
            title: "Bem-vindo à Plataforma Yourbox",
            description: "Aceda à plataforma com login seguro. Interface intuitiva e moderna para gerir todas as entregas.",
            mockupUrl: "assets/images/tour/tour-step-1-pure.html", // <-- CAMINHO PARA O MOCKUP
            spotlight: { top: '20%', left: '30%', width: '40%', height: '60%' },
            tooltip: { top: '15%', right: '10%' }
        },
        {
            title: "Criar Novo Serviço",
            description: "Adicione pontos de recolha e entrega no mapa interativo. Sistema calcula automaticamente a melhor rota.",
            mockupUrl: "assets/images/tour/tour-step-2-pure.html",
            spotlight: { top: '15%', left: '10%', width: '50%', height: '70%' },
            tooltip: { bottom: '15%', left: '10%' }
        },
        {
            title: "Escolher Viatura e Urgência",
            description: "Selecione tipo de viatura (Moto, Carro, Furgão) e urgência (1h, 4h, 24h). Configure opções adicionais.",
            mockupUrl: "assets/images/tour/tour-step-3-pure.html",
            spotlight: { top: '25%', left: '20%', width: '60%', height: '50%' },
            tooltip: { top: '15%', right: '10%' }
        },
        {
            title: "Cálculo Automático de Tarifa",
            description: "Plataforma calcula preço instantaneamente com breakdown detalhado. Preço fixo garantido.",
            mockupUrl: "assets/images/tour/tour-step-4-pure.html",
            spotlight: { top: '25%', left: '25%', width: '50%', height: '40%' },
            tooltip: { bottom: '10%', left: '20%' }
        },
        {
            title: "Tracking GPS em Tempo Real",
            description: "Acompanhe localização exata dos estafetas no mapa. Veja tempo estimado e distância percorrida.",
            mockupUrl: "assets/images/tour/tour-step-5-pure.html",
            spotlight: { top: '15%', left: '30%', width: '65%', height: '70%' },
            tooltip: { top: '20%', left: '5%' }
        },
        {
            title: "Gestão de Todos os Serviços",
            description: "Visualize histórico completo em tabela. Filtre, pesquise e exporte dados facilmente.",
            mockupUrl: "assets/images/tour/tour-step-6-pure.html",
            spotlight: { top: '30%', left: '10%', width: '80%', height: '55%' },
            tooltip: { top: '10%', left: '50%', transform: 'translateX(-50%)' }
        },
        {
            title: "Dashboard de Serviços Ativos",
            description: "Monitore todos os serviços em execução em tempo real. Stats ao vivo e barras de progresso.",
            mockupUrl: "assets/images/tour/tour-step-7-pure.html",
            spotlight: { top: '25%', left: '15%', width: '70%', height: '60%' },
            tooltip: { bottom: '5%', left: '50%', transform: 'translateX(-50%)' }
        }
    ];






    // Abrir Tour
    function abrirTourDemo() {
        const tour = document.getElementById('tourDemo');
        if (tour) {
            tour.classList.add('active');
            document.body.style.overflow = 'hidden';
            tourState.currentStep = 0;
            tourState.isPlaying = true;
            
            // Renderizar primeiro step
            renderTourStep(0);
            
            console.log('✔ Tour Demo aberto');
        }
    }

    // Fechar Tour
    function fecharTourDemo() {
        const tour = document.getElementById('tourDemo');
        if (tour) {
            tour.classList.remove('active');
            document.body.style.overflow = '';
            tourState.isPlaying = false;
            
            console.log('❌ Tour Demo fechado');
        }
    }

    // Renderizar Step
    // SUBSTITUIR a função renderTourStep() existente por esta versão:

    function renderTourStep(stepIndex) {
        if (stepIndex < 0 || stepIndex >= tourSteps.length) return;
        
        tourState.currentStep = stepIndex;
        const step = tourSteps[stepIndex];
        
        // Atualizar Progress Bar
        const progressFill = document.getElementById('tourProgressFill');
        const progressPercent = ((stepIndex + 1) / tourSteps.length) * 100;
        progressFill.style.width = progressPercent + '%';
        
        // ============================================
        // NOVO: Carregar mockup real em vez de placeholder
        // ============================================
        const screenshot = document.getElementById('tourScreenshot');
        
        // Limpar conteúdo anterior
        screenshot.innerHTML = '';
        screenshot.style.background = 'transparent';
        
        // Criar iframe para carregar o mockup HTML
        const iframe = document.createElement('iframe');
        iframe.src = step.mockupUrl; // Usar o mockupUrl em vez de screenshot
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        iframe.style.borderRadius = '12px';
        iframe.style.overflow = 'hidden';
        
        screenshot.appendChild(iframe);
        
        // Atualizar Spotlight (esconder temporariamente enquanto carrega)
        const spotlight = document.getElementById('tourSpotlight');
        spotlight.style.opacity = '0';
        
        // Mostrar spotlight após carregar
        setTimeout(() => {
            spotlight.style.top = step.spotlight.top;
            spotlight.style.left = step.spotlight.left;
            spotlight.style.width = step.spotlight.width;
            spotlight.style.height = step.spotlight.height;
            spotlight.style.opacity = '1';
        }, 300);
        
        // Atualizar Tooltip
        const tooltip = document.getElementById('tourTooltip');
        document.getElementById('tooltipStep').textContent = `${stepIndex + 1}/${tourSteps.length}`;
        document.getElementById('tooltipTitle').textContent = step.title;
        document.getElementById('tooltipDescription').textContent = step.description;
        
        // Posicionar Tooltip
        tooltip.style.top = step.tooltip.top || 'auto';
        tooltip.style.bottom = step.tooltip.bottom || 'auto';
        tooltip.style.left = step.tooltip.left || 'auto';
        tooltip.style.right = step.tooltip.right || 'auto';
        tooltip.style.transform = step.tooltip.transform || 'none';
        
        // Atualizar texto do botão no último step
        const btnNext = document.getElementById('btnTourNext');
        if (stepIndex === tourSteps.length - 1) {
            btnNext.textContent = '🎯 Agendar Demo Ao Vivo';
            btnNext.onclick = function() {
                fecharTourDemo();
                setTimeout(() => {
                    abrirPopupAgendamento();
                }, 300);
            };
        } else {
            btnNext.textContent = 'Próximo →';
            btnNext.onclick = nextStepTour;
        }
        
        // Atualizar Dots
        updateTourDots(stepIndex);
        
        // Atualizar Arrows
        const arrowLeft = document.getElementById('tourArrowLeft');
        const arrowRight = document.getElementById('tourArrowRight');
        
        arrowLeft.disabled = stepIndex === 0;
        arrowRight.disabled = stepIndex === tourSteps.length - 1;
        
        // Animação de entrada
        setTimeout(() => {
            tooltip.style.opacity = '1';
        }, 100);
        
        console.log(`📍 Tour Step ${stepIndex + 1}/${tourSteps.length}: ${step.title}`);
    }

    // Próximo Step
    function nextStepTour() {
        if (tourState.currentStep < tourSteps.length - 1) {
            renderTourStep(tourState.currentStep + 1);
        }
    }

    // Step Anterior
    function prevStepTour() {
        if (tourState.currentStep > 0) {
            renderTourStep(tourState.currentStep - 1);
        }
    }

    // Ir para Step específico (via dots)
    function goToStepTour(stepIndex) {
        renderTourStep(stepIndex);
    }

    // Atualizar Dots
    function updateTourDots(activeIndex) {
        const dots = document.querySelectorAll('.tour-dot');
        dots.forEach((dot, index) => {
            if (index === activeIndex) {
                dot.classList.add('active');
            } else {
                dot.classList.remove('active');
            }
        });
    }

    // Teclas de navegação
    document.addEventListener('keydown', function(event) {
        const tour = document.getElementById('tourDemo');
        if (tour && tour.classList.contains('active')) {
            if (event.key === 'ArrowRight') {
                nextStepTour();
            } else if (event.key === 'ArrowLeft') {
                prevStepTour();
            } else if (event.key === 'Escape') {
                fecharTourDemo();
            }
        }
    });

    // ============================================
    // ALERTAS
    // ============================================
    function showAlert(message, type = 'info') {
        // Remover alertas anteriores
        const existingAlert = document.querySelector('.alert-toast');
        if (existingAlert) {
            existingAlert.remove();
        }
        
        // Criar elemento de alerta
        const alert = document.createElement('div');
        alert.className = `alert alert-${type} alert-toast`;
        alert.textContent = message;
        
        // Encontrar o formulário para posicionar o alert próximo
        const form = document.getElementById('form');
        const formRect = form ? form.getBoundingClientRect() : null;
        
        if (formRect) {
            // Posicionar próximo ao formulário (responsivo)
            alert.style.cssText = `
                position: fixed;
                top: ${Math.max(formRect.top - 80, 20)}px;
                left: 50%;
                transform: translateX(-50%);
                z-index: 9999;
                max-width: min(90%, 500px);
                width: 100%;
                animation: slideDown 0.3s ease-out;
                box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            `;
        } else {
            // Fallback para posição fixa no topo
            alert.style.cssText = `
                position: fixed;
                top: 100px;
                right: 20px;
                z-index: 9999;
                max-width: 400px;
                animation: slideInRight 0.3s ease-out;
            `;
        }

        // Adicionar ao body
        document.body.appendChild(alert);

        // Remover após 5 segundos
        setTimeout(() => {
            alert.style.animation = 'fadeOut 0.3s ease-out';
            setTimeout(() => alert.remove(), 300);
        }, 5000);

      
    }

    // ============================================
    // ATUALIZAR STATS DO HERO
    // ============================================
    function updateHeroStats() {
        // Chamar API para obter stats
        fetch(CONFIG.API_URL + '?local_recolha=Lisboa&local_entrega=Porto&viatura=Moto&urgencia=1%20Hora')
            .then(response => response.json())
            .then(data => {
                const stats = data.body?.stats || data.stats;
                
                if (stats) {
                    // Atualizar rating
                    const heroRating = document.getElementById('heroRating');
                    if (heroRating) {
                        heroRating.style.opacity = '0';
                        setTimeout(() => {
                            heroRating.textContent = stats.rating + '★';
                            heroRating.style.opacity = '1';
                        }, 150);
                    }
                    
                    // Atualizar label com número de avaliações
                    const heroRatingLabel = document.getElementById('heroRatingLabel');
                    if (heroRatingLabel) {
                        heroRatingLabel.textContent = `em ${stats.totalReviews.toLocaleString('pt-PT')} avaliações`;
                    }
                    
                   
                }
            })
            .catch(error => {
                console.log('ℹ️ Usando valores default no hero');
            });
    }

    // ============================================
// VARIANTE A: SUBMIT DIRECT LEAD
// ============================================
function submitDirectLead() {
    console.log('📨 [Variante A] Submeter Lead Direto...');
    
    // Capturar dados
    const origem = document.getElementById('origem')?.value.trim() || '';
    const destino = document.getElementById('destino')?.value.trim() || '';
    const nome = document.getElementById('nome')?.value.trim() || '';
    const email = document.getElementById('email')?.value.trim() || '';
    const telefone = document.getElementById('telefone')?.value.trim() || '';
    const observacoes = document.getElementById('observacoes')?.value.trim() || '';
    
    const viaturaRadio = document.querySelector('input[name="viatura"]:checked');
    const viatura = viaturaRadio ? viaturaRadio.value : 'Moto';
    
    const urgenciaRadio = document.querySelector('input[name="urgencia"]:checked');
    const urgencia = urgenciaRadio ? urgenciaRadio.value : '4 Horas';
    
    // Validações (sem alert - usa showAlert se disponível)
    if (!origem || !destino) {
        if (typeof showAlert === 'function') {
            showAlert('⚠️ Por favor, preencha origem e destino', 'error');
        }
        return;
    }
    
    if (!nome || nome.length < 3) {
        if (typeof showAlert === 'function') {
            showAlert('⚠️ Por favor, insira o seu nome completo', 'error');
        }
        return;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
        if (typeof showAlert === 'function') {
            showAlert('⚠️ Por favor, insira um email válido', 'error');
        }
        return;
    }
    
    const telefoneLimpo = telefone.replace(/\s/g, '').replace(/\+351/g, '');
    const telefoneRegex = /^[0-9]{9}$/;
    if (!telefoneLimpo || !telefoneRegex.test(telefoneLimpo)) {
        if (typeof showAlert === 'function') {
            showAlert('⚠️ Por favor, insira um telefone válido (9 dígitos)', 'error');
        }
        return;
    }
    
    // Preparar dados
    const leadData = {
        origem: origem,
        destino: destino,
        viatura: viatura,
        urgencia: urgencia,
        nome: nome,
        email: email,
        telefone: telefoneLimpo,
        observacoes: observacoes,
        variante: 'B',
        timestamp: new Date().toISOString()
    };
    
    console.log('📤 Enviando:', leadData);
    
    // Desabilitar botão
    const btnSubmit = document.getElementById('btnSubmitLead');
    if (btnSubmit) {
        const btnOriginalText = btnSubmit.innerHTML;
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '⏳ Enviando...';
        
        // Enviar para API
        const API_ENDPOINT = 'https://yb.serveftp.com:3000/api/submitDirectLead';
        
        fetch(API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(leadData)
        })
        .then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        })
        .then(data => {
            console.log('✔ Sucesso:', data);
            
            // CRÍTICO: Prevenir qualquer scroll automático
            const scrollY = window.pageYOffset;
            
            // Atualizar tela de sucesso
            const confirmedNameEl = document.getElementById('confirmedName');
            const confirmedEmailEl = document.getElementById('confirmedEmail');
            if (confirmedNameEl) confirmedNameEl.textContent = nome;
            if (confirmedEmailEl) confirmedEmailEl.textContent = email;
            
            // Mostrar success screen SEM scroll
            const step1 = document.getElementById('step1');
            const successScreen = document.getElementById('successScreen');
            if (step1) step1.classList.remove('active');
            if (successScreen) successScreen.classList.add('active');
            
            // Restaurar posição do scroll (caso algo tente mudar)
            window.scrollTo(0, scrollY);
            
            // Tracking
            if (window.dataLayer) {
                window.dataLayer.push({
                    'event': 'lead_submitted',
                    'lead_type': 'direct_contact',
                    'variante': 'A'
                });
            }
            
            // Mensagem de sucesso removida - já aparece no success screen
            // if (typeof showAlert === 'function') {
            //     showAlert('✔ Pedido enviado! Entraremos em contacto em breve.', 'success');
            // }
            
            // Restaurar botão
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = btnOriginalText;
        })
        .catch(error => {
            console.error('❌ Erro:', error);
            
            // Mensagem de erro via showAlert (se disponível)
            if (typeof showAlert === 'function') {
                showAlert('❌ Erro ao enviar. Telefone: 214 304 546', 'error');
            }
            
            // Restaurar botão
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = btnOriginalText;
        });
    }
}

    
    // ============================================
    // EXPORTAR FUNÇÕES GLOBALMENTE
    // ============================================
    window.yourboxForm = {
        init: init,
        goToStep1: goToStep1,
        goToStep2: goToStep2,
        submitLead: submitLead,
        abrirWhatsApp: abrirWhatsApp,
        novoOrcamento: novoOrcamento,
        focusOrigem: focusOrigem,
        focusOrigemComUrgencia: focusOrigemComUrgencia,
        abrirPopupDedicado: abrirPopupDedicado,      // <-- ADICIONAR
        fecharPopupDedicado: fecharPopupDedicado,    // <-- ADICIONAR
        submitFormDedicado: submitFormDedicado,       // <-- ADICIONAR
        abrirPopupAgendamento: abrirPopupAgendamento,      // <-- NOVO
        fecharPopupAgendamento: fecharPopupAgendamento,    // <-- NOVO
        submitFormAgendamento: submitFormAgendamento,       // <-- NOVO
        submitDirectLead: submitDirectLead,
        abrirTourDemo: abrirTourDemo,              // <-- NOVO
        fecharTourDemo: fecharTourDemo,            // <-- NOVO
        nextStepTour: nextStepTour,                // <-- NOVO
        prevStepTour: prevStepTour,                // <-- NOVO
        goToStepTour: goToStepTour                 // <-- NOVO
    };

    // ============================================
    // AUTO-INICIALIZAÇÃO
    // ============================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();