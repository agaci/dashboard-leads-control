/**
 * ============================================
 * YOURBOX FORM - VARIANTE C (HYBRID)
 * Sistema de Captação com Dupla Opção
 * Versão: 2.1-B (Fluxo Normal + Callback)
 * ============================================
 */

(function() {
    'use strict';

    // ============================================
    // CONFIGURAÇÃO
    // ============================================
    const CONFIG = {
        // API URLs
        API_URL: 'http://yb.serveftp.com:3000/api/freeGetServicePriceAPI2026',
        //API_URL: 'https://weby-5204.nodechef.com/api/freeGetServicePriceAPI2026',
        API_CALLBACK_URL: 'http://yb.serveftp.com:3000/api/callbackRequest', // NOVO ENDPOINT
        //API_CALLBACK_URL: 'https://weby-5204.nodechef.com/api/callbackRequest', // NOVO ENDPOINT
        
        // WhatsApp
        WHATSAPP_NUMBER: '351961220881',
        
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
        flowType: null, // 'normal' ou 'callback'
        data: {
            origem: '',
            destino: '',
            viatura: 'Moto',        // DEFAULT: Moto
            urgencia: '4 Horas',    // DEFAULT: 4 Horas (alterado de 1 Hora)
            peso_total: '2',        // DEFAULT: 2kg
            nome: '',
            email: '',
            telemovel: '',
            simulationId: null
        },
        priceData: {
            estimated: null,
            final: null,
            discount: null,
            original: null,
            distanceKm: null,
            timeMinutes: null
        }
    };

    // ============================================
    // INICIALIZAÇÃO
    // ============================================
    function init() {
        console.log('🚀 Yourbox Form C (Hybrid) - Inicializando...');
        
        // Inicializar Google Places Autocomplete
        initGooglePlaces();
        
        // Tracking A/B Test
        trackVariantView('C');
        
        console.log('✔ Variante C carregada');
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
                    console.log('🎯 Destino selecionado:', place.formatted_address);
                }
            });

        } catch (error) {
            console.error('❌ Erro ao inicializar Google Places:', error);
        }
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

        // Esconder success message
        const successMessage = document.getElementById('successMessage');
        if (successMessage) {
            successMessage.style.display = 'none';
        }

        // Mostrar step atual
        const currentStepEl = document.getElementById('step' + stepNumber);
        if (currentStepEl) {
            currentStepEl.classList.add('active');
        }

        // Scroll em mobile
        if (window.innerWidth <= 968) {
            setTimeout(() => {
                const formElement = document.getElementById('form');
                if (formElement) {
                    formElement.scrollIntoView({ 
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            }, 100);
        }

        console.log(`📍 Step ${stepNumber} ativo`);
    }

    // ============================================
    // STEP 1 → STEP 2: CALCULAR PREÇO
    // ============================================
    function calculatePrice() {
        // Validar campos
        const origem = document.getElementById('origem').value.trim();
        const destino = document.getElementById('destino').value.trim();

        if (!origem || !destino) {
            showAlert('Por favor, preencha origem e destino', 'error');
            return;
        }

        // Guardar no state
        formState.data.origem = origem;
        formState.data.destino = destino;

        // Mostrar loading
        showAlert('Calculando preço...', 'aguardar');

        // Chamar API
        const params = new URLSearchParams({
            local_recolha: origem,
            local_entrega: destino,
            viatura: formState.data.viatura,
            urgencia: formState.data.urgencia,
            variante: 'C'
        });

        fetch(`${CONFIG.API_URL}?${params}`)
            .then(response => response.json())
            .then(data => {
                
                // Processar resposta
                if (data.success || data.statusCode === 200) {
                    const body = data.body || data;
                    
                    // Extrair preço com fallbacks
                    const precoBase = body.preco || body.price || body.preco_original || 0;
                    const precoOriginal = body.preco_original || precoBase;
                    const precoComDesconto = body.preco_com_desconto || body.priceWithDiscount || (precoBase * 0.9);
                    
                    // Validar se temos preços válidos
                    if (!precoBase || precoBase === 0) {
                        throw new Error('Preço não disponível. Tente novamente ou contacte-nos.');
                    }
                    
                    // Guardar dados do preço
                    formState.priceData.original = parseFloat(precoOriginal);
                    formState.priceData.final = parseFloat(precoComDesconto);
                    formState.priceData.discount = body.desconto || body.discount || '10%';
                    formState.priceData.distanceKm = body.distancia_km || body.totalDistance || null;
                    formState.priceData.timeMinutes = body.tempo_estimado_minutos || body.timeMinutes || null;
                    formState.data.simulationId = body.simulationId || null;

                    

                    // Atualizar UI
                    updatePriceDisplay();

                    // Ir para Step 2
                    showStep(2);

                    // Tracking
                    trackEvent('price_calculated', {
                        origem: origem,
                        destino: destino,
                        preco: formState.priceData.final
                    });

                    showAlert('Preço calculado com sucesso!', 'success');

                } else {
                    throw new Error(data.message || 'Erro ao calcular preço');
                }
            })
            .catch(error => {
                
                showAlert('Erro ao calcular preço. Tente novamente.', 'error');
            });
    }

    // ============================================
    // ATUALIZAR DISPLAY DE PREÇO
    // ============================================
    function updatePriceDisplay() {
        const priceOriginal = document.getElementById('priceOriginal');
        const priceFinal = document.getElementById('priceFinal');
        const routeSummary = document.getElementById('routeSummary');
        const deliveryTime = document.getElementById('deliveryTime');

        // Validar se temos preços válidos
        const hasValidPrice = formState.priceData.final && 
                              formState.priceData.final > 0 && 
                              !isNaN(formState.priceData.final);

        if (!hasValidPrice) {
            
            showAlert('Erro ao calcular preço. Por favor contacte-nos.', 'error');
            return;
        }

        // Atualizar preços
        if (priceOriginal && formState.priceData.original) {
            priceOriginal.textContent = `€${formState.priceData.original.toFixed(2)}`;
        }

        if (priceFinal) {
            priceFinal.textContent = `€${formState.priceData.final.toFixed(2)}`;
        }

        // Atualizar resumo da rota
        if (routeSummary && formState.data.origem && formState.data.destino) {
            const origemShort = formState.data.origem.split(',')[0] || formState.data.origem;
            const destinoShort = formState.data.destino.split(',')[0] || formState.data.destino;
            routeSummary.textContent = `${origemShort} → ${destinoShort}`;
            
            if (formState.priceData.distanceKm) {
                routeSummary.textContent += ` (${formState.priceData.distanceKm}km)`;
            }
        }

        // Atualizar tempo de entrega (se elemento existir)
        if (deliveryTime && formState.priceData.timeMinutes) {
            deliveryTime.textContent = `Tempo estimado: ${formState.priceData.timeMinutes} minutos`;
        }

        console.log('✔ Display de preço atualizado');
    }

    // ============================================
    // STEP 2 → STEP 3: FLUXO NORMAL (CONFIRMAR)
    // ============================================
    function showContactForm() {
        formState.flowType = 'normal';
        showStep(3);
        
        trackEvent('cta_clicked', {
            type: 'confirm_order',
            flow: 'normal'
        });
    }

    // ============================================
    // STEP 2 → STEP 4: FLUXO CALLBACK (PREFIRO FALAR)
    // ============================================
    function showCallbackForm() {
        formState.flowType = 'callback';
        showStep(4);
        
        trackEvent('cta_clicked', {
            type: 'request_callback',
            flow: 'callback'
        });
    }

    // ============================================
    // VOLTAR PARA STEP 1
    // ============================================
    function backToStep1() {
        showStep(1);
        trackEvent('back_clicked', { from: 'step2' });
    }

    // ============================================
    // VOLTAR PARA STEP 2
    // ============================================
    function backToStep2() {
        showStep(2);
        trackEvent('back_clicked', { from: formState.currentStep });
    }

    // ============================================
    // SUBMIT LEAD - FLUXO NORMAL (STEP 3)
    // ============================================
    function submitLead() {
        // Validar campos
        const nome = document.getElementById('nome').value.trim();
        const email = document.getElementById('email').value.trim();
        const telefone = document.getElementById('telefone').value.trim();

        if (!nome || !email || !telefone) {
            showAlert('Por favor, preencha todos os campos', 'error');
            return;
        }

        // Validar email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            showAlert('Email inválido', 'error');
            return;
        }

        // Guardar dados
        formState.data.nome = nome;
        formState.data.email = email;
        formState.data.telefone = telefone;

        // Mostrar loading
        showAlert('Enviando pedido...', 'info');

        // Preparar dados para API
        const payload = new URLSearchParams({
            local_recolha: formState.data.origem,
            local_entrega: formState.data.destino,
            viatura: formState.data.viatura,
            urgencia: formState.data.urgencia,
            nome: nome,
            email: email,
            telemovel: telefone,
            preco: formState.priceData.final,
            preco_original: formState.priceData.original,
            desconto: formState.priceData.discount,
            simulationId: formState.data.simulationId,
            variant: 'C',
            flow: 'normal',
            variante: 'C'
        });
        
        fetch(`${CONFIG.API_URL}?${payload}`)
        .then(response => response.json())
        .then(data => {
            console.log('✔ Lead enviada:', data);

            // Mostrar mensagem de sucesso
            showSuccessMessage('normal');

            // Tracking
            trackEvent('lead_submitted', {
                variant: 'C',
                flow: 'normal',
                preco: formState.priceData.final
            });

            // Limpar form após 3 segundos
            setTimeout(() => {
                resetForm();
            }, 3000);
        })
        .catch(error => {
            
            showAlert('Erro ao enviar pedido. Tente novamente.', 'error');
        });
    }

    // ============================================
    // SUBMIT CALLBACK - FLUXO CALLBACK (STEP 4)
    // ============================================
    function submitCallback() {
        // Validar campos
        const nome = document.getElementById('nomeCallback').value.trim();
        const telefone = document.getElementById('telefoneCallback').value.trim();
        const email = document.getElementById('emailCallback').value.trim();

        if (!nome || !telefone) {
            showAlert('Nome e telefone são obrigatórios', 'error');
            return;
        }

        // Guardar dados
        formState.data.nome = nome;
        formState.data.telefone = telefone;
        formState.data.email = email;

        // Mostrar loading
        showAlert('Agendando contacto...', 'aguarda');

        // Preparar dados para API
        const payload = {
            local_recolha: formState.data.origem,
            local_entrega: formState.data.destino,
            viatura: formState.data.viatura,
            urgencia: formState.data.urgencia,
            nome: nome,
            telefone: telefone,
            email: email || null,
            preco_final: formState.priceData.final,
            preco_original: formState.priceData.original,
            desconto: formState.priceData.discount,
            simulationId: formState.data.simulationId,
            variant: 'C',
            flow: 'callback',
            priority: 'URGENTE',
            callback_time: '15min',
            variante: 'C'
        };

        // Enviar para NOVO endpoint de callback
        fetch(CONFIG.API_CALLBACK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        })
        .then(response => response.json())
        .then(data => {
            console.log('✔ Callback agendado:', data);

            // Mostrar mensagem de sucesso
            showSuccessMessage('callback');

            // Tracking
            trackEvent('callback_requested', {
                variant: 'B',
                flow: 'callback',
                preco: formState.priceData.final
            });

            // Limpar form após 5 segundos
            setTimeout(() => {
                resetForm();
            }, 5000);
        })
        .catch(error => {
            
            showAlert('Erro ao agendar contacto. Tente novamente.', 'error');
        });
    }

    // ============================================
    // MOSTRAR MENSAGEM DE SUCESSO
    // ============================================
    function showSuccessMessage(flowType) {
        const successMessage = document.getElementById('successMessage');
        const successText = document.getElementById('successText');

        if (successMessage && successText) {
            // Texto personalizado por fluxo
            if (flowType === 'normal') {
                successText.textContent = 'Enviámos um email de confirmação. A nossa equipa entrará em contacto em breve para finalizar os detalhes.';
            } else if (flowType === 'callback') {
                successText.innerHTML = '🔥 <strong>Pedido prioritário recebido!</strong><br>Vamos ligar-lhe nos próximos <strong>15 minutos</strong> para confirmar todos os detalhes do envio.';
            }

            // Esconder todos os steps
            document.querySelectorAll('.form-step').forEach(step => {
                step.classList.remove('active');
            });

            // Mostrar sucesso
            successMessage.style.display = 'block';

            // Scroll
            if (window.innerWidth <= 968) {
                setTimeout(() => {
                    successMessage.scrollIntoView({ 
                        behavior: 'smooth',
                        block: 'start'
                    });
                }, 100);
            }
        }
    }

    // ============================================
    // RESET FORM
    // ============================================
    function resetForm() {
        // Reset state
        formState = {
            currentStep: 1,
            flowType: null,
            data: {
                origem: '',
                destino: '',
                viatura: 'Moto',
                urgencia: '1 Hora',
                nome: '',
                email: '',
                telefone: '',
                simulationId: null
            },
            priceData: {
                estimated: null,
                final: null,
                discount: null,
                original: null,
                distanceKm: null,
                timeMinutes: null
            }
        };

        // Limpar inputs
        document.getElementById('origem').value = '';
        document.getElementById('destino').value = '';
        document.getElementById('nome').value = '';
        document.getElementById('email').value = '';
        document.getElementById('telefone').value = '';
        document.getElementById('nomeCallback').value = '';
        document.getElementById('telefoneCallback').value = '';
        document.getElementById('emailCallback').value = '';

        // Voltar para Step 1
        showStep(1);

        
    }

    // ============================================
    // ALERTAS
    // ============================================
    function showAlert(message, type) {
        // Remover alertas anteriores
        const existingAlert = document.querySelector('.alert-toast');
        if (existingAlert) {
            existingAlert.remove();
        }
        
        // Criar elemento de alerta
        const alert = document.createElement('div');
        alert.className = `alert-toast alert-${type}`;
        
        // Ícones por tipo
        const icons = {
            info: 'ⓘ',     // ⓘ
            success: '✓',  // ✓
            error: '✕',    // ✕
            warning: '⚠',   // ⚠
            aguardar: '⏳'   // ⏻
        };
        
        alert.innerHTML = `${icons[type] || ''} ${message}`;
        
        // Estilos inline
        alert.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            font-weight: 500;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            animation: slideInRight 0.3s ease-out;
            max-width: 400px;
            background: ${type === 'error' ? '#ff6b6b' : type === 'success' ? '#bed62f' : type === 'warning' ? '#ffc107' : '#667eea'};
            color: white;
            border: none !important;           
            border-left: none !important;      
            outline: none;                    
        `;

        // Adicionar ao body
        document.body.appendChild(alert);

        // Remover após 4 segundos
        setTimeout(() => {
            alert.style.animation = 'fadeOut 0.3s ease-out';
            setTimeout(() => alert.remove(), 300);
        }, 4000);
    }


    // ============================================
    // HELPERS
    // ============================================
    function focusOrigem() {
        const origem = document.getElementById('origem');
        if (origem) {
            origem.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => origem.focus(), 300);
        }
    }

    function abrirWhatsApp() {
        const priceText = formState.priceData.hasRange 
            ? `${formState.priceData.minPrice}€-${formState.priceData.maxPrice}€`
            : `${formState.priceData.singlePrice}€`;
        
        const message = encodeURIComponent(
            `Olá! Solicitei orçamento:\n` +
            `De: ${formState.data.origem}\n` +
            `Para: ${formState.data.destino}\n` +
            `Intervalo: ${priceText}`
        );
        window.open(`https://wa.me/${CONFIG.WHATSAPP_NUMBER}?text=${message}`, '_blank');
    }

    

   

    

    // ============================================
    // TRACKING A/B TEST
    // ============================================
    function trackVariantView(variant) {
        // Google Analytics
        if (typeof gtag !== 'undefined') {
            gtag('event', 'variant_view', {
                variant: variant,
                timestamp: new Date().toISOString()
            });
        }

        console.log(`📊 Tracking: Variante ${variant} visualizada`);
    }

    function trackEvent(eventName, eventData = {}) {
        // Google Analytics
        if (typeof gtag !== 'undefined') {
            gtag('event', eventName, {
                variant: 'B',
                ...eventData
            });
        }

        console.log(`📊 Event: ${eventName}`, eventData);
    }

    // ============================================
    // EXPORTAR FUNÇÕES GLOBALMENTE
    // ============================================
    window.yourboxForm = {
        init: init,
        calculatePrice: calculatePrice,
        showContactForm: showContactForm,
        showCallbackForm: showCallbackForm,
        submitLead: submitLead,
        submitCallback: submitCallback,
        backToStep1: backToStep1,
        backToStep2: backToStep2,
        resetForm: resetForm,
        focusOrigem,
        abrirWhatsApp
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