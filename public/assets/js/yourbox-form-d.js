/**
 * ============================================
 * YOURBOX FORM - VARIANTE D (FINAL)
 * Progressive Profiling Simplificado
 * ============================================
 */

(function() {
    'use strict';

    // ============================================
    // CONFIGURAÇÃO
    // ============================================
    const CONFIG = {
        API_RANGE_URL: 'http://yb.serveftp.com:3000/api/getPriceRange',
        //API_RANGE_URL: 'https://weby-5204.nodechef.com/api/getPriceRange',
        API_LEAD_URL: 'http://yb.serveftp.com:3000/api/submitLeadVariantD',
        //API_LEAD_URL: 'https://weby-5204.nodechef.com/api/submitLeadVariantD',
        WHATSAPP_NUMBER: '351964078194',
        
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
        flowType: null,
        data: {
            origem: '',
            destino: '',
            viatura: 'Furgão',
            urgencia: '4 Horas',
            nome: '',
            email: '',
            telefone: '',
            simulationId: null
        },
        priceData: {
            hasRange: false,
            minPrice: null,
            maxPrice: null,
            singlePrice: null,
            distance: null
        }
    };

    // ============================================
    // INICIALIZAÇÃO
    // ============================================
    function init() {
        
        initGooglePlaces();
        trackVariantView('D');
        
    }

    // ============================================
    // GOOGLE PLACES
    // ============================================
    function initGooglePlaces() {
        try {
            const origemInput = document.getElementById('origem');
            const destinoInput = document.getElementById('destino');

            if (!origemInput || !destinoInput) {
               
                return;
            }

            const autocompleteOrigem = new google.maps.places.Autocomplete(
                origemInput, 
                CONFIG.GOOGLE_PLACES_OPTIONS
            );

            const autocompleteDestino = new google.maps.places.Autocomplete(
                destinoInput, 
                CONFIG.GOOGLE_PLACES_OPTIONS
            );

            autocompleteOrigem.addListener('place_changed', function() {
                const place = autocompleteOrigem.getPlace();
                if (place && place.formatted_address) {
                    origemInput.value = place.formatted_address;
                    formState.data.origem = place.formatted_address;
                    
                }
            });

            autocompleteDestino.addListener('place_changed', function() {
                const place = autocompleteDestino.getPlace();
                if (place && place.formatted_address) {
                    destinoInput.value = place.formatted_address;
                    formState.data.destino = place.formatted_address;
                    
                }
            });

        } catch (error) {
            console.error('❌ Erro Google Places:', error);
        }
    }

    // ============================================
    // STEP 1 → STEP 2: CALCULAR INTERVALO
    // ============================================
    function calculatePrice() {
        const origem = document.getElementById('origem').value.trim();
        const destino = document.getElementById('destino').value.trim();

        if (!origem || !destino) {
            showAlert('Por favor, preencha origem e destino', 'error');
            return;
        }

        formState.data.origem = origem;
        formState.data.destino = destino;

        showAlert('Calculando intervalo...', 'aguardar');

        const params = new URLSearchParams({
            local_recolha: origem,
            local_entrega: destino,
            variante: 'D'
        });

        fetch(`${CONFIG.API_RANGE_URL}?${params}`)
            .then(response => response.json())
            .then(data => {

                const body = data.body || data;
                
                if (body.success) {
                    formState.priceData.hasRange = body.hasRange;
                    formState.priceData.minPrice = body.minPrice;
                    formState.priceData.maxPrice = body.maxPrice;
                    formState.priceData.singlePrice = body.singlePrice;
                    formState.priceData.distance = body.distance;
                    formState.data.simulationId = body.simulationId;

                    updatePriceDisplay();
                    showStep(2);

                    trackEvent('price_calculated', {
                        origem: origem,
                        destino: destino,
                        variant: 'd'
                    });

                    showAlert('Intervalo calculado!', 'success');
                } else {
                    throw new Error(body.message || 'Erro ao calcular');
                }
            })
            .catch(error => {
                
                showAlert('Erro ao calcular. Tente novamente.', 'error');
            });
    }

    // ============================================
    // ATUALIZAR DISPLAY DE PREÇO
    // ============================================
    function updatePriceDisplay() {
        const priceRange = document.getElementById('priceRange');
        const routeSummary = document.getElementById('routeSummary');

        if (!priceRange) {
            
            return;
        }

        if (formState.priceData.hasRange) {
            priceRange.textContent = 
                `${formState.priceData.minPrice}€ - ${formState.priceData.maxPrice}€`;
        } else {
            priceRange.textContent = `${formState.priceData.singlePrice}€`;
        }

        if (routeSummary) {
            const origemShort = formState.data.origem.split(',')[0];
            const destinoShort = formState.data.destino.split(',')[0];
            
            routeSummary.textContent = `${origemShort} → ${destinoShort}`;
            
            if (formState.priceData.distance) {
                routeSummary.textContent += ` • ${formState.priceData.distance.toFixed(1)} km`;
            }
        }

    }

    // ============================================
    // NAVEGAÇÃO
    // ============================================
    function showStep(stepNumber) {
        formState.currentStep = stepNumber;

        document.querySelectorAll('.form-step').forEach(step => {
            step.classList.remove('active');
        });

        const currentStep = document.getElementById('step' + stepNumber);
        if (currentStep) {
            currentStep.classList.add('active');
        }

        for (let i = 1; i <= 4; i++) {
            const progress = document.getElementById('progress' + i);
            if (progress) {
                if (i <= stepNumber) {
                    progress.classList.add('active');
                } else {
                    progress.classList.remove('active');
                }
            }
        }

    }

    function backToStep1() {
        showStep(1);
        trackEvent('back_clicked', { from: 2 });
    }

    function backToStep2() {
        showStep(2);
        trackEvent('back_clicked', { from: formState.currentStep });
    }

    // ============================================
    // STEP 2: ESCOLHER FLUXO
    // ============================================
    function showContactForm() {
        formState.flowType = 'confirmar';
        showStep(3);
        trackEvent('flow_selected', { type: 'confirmar' });
    }

    function showCallbackForm() {
        formState.flowType = 'falar';
        showStep(4);
        trackEvent('flow_selected', { type: 'falar' });
    }

    // ============================================
    // SUBMIT: BOTÃO "CONFIRMAR PEDIDO"
    // ============================================
    function submitLead() {
        const nome = document.getElementById('nome').value.trim();
        const email = document.getElementById('email').value.trim();
        const telefone = document.getElementById('telefone').value.trim();

        if (!nome || !email || !telefone) {
            showAlert('Preencha todos os campos', 'error');
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            showAlert('Email inválido', 'error');
            return;
        }

        formState.data.nome = nome;
        formState.data.email = email;
        formState.data.telefone = telefone;

        

        showAlert('Enviando pedido...', 'aguardar');

        const params = new URLSearchParams({
            local_recolha: formState.data.origem,
            local_entrega: formState.data.destino,
            viatura: formState.data.viatura,
            urgencia: formState.data.urgencia,
            nome: nome,
            email: email,
            telemovel: telefone,
            flowType: 'confirmar',
            variante: 'D',
            // Enviar intervalo diretamente
            hasRange: String(formState.priceData.hasRange),
            minPrice: String(formState.priceData.minPrice || ''),
            maxPrice: String(formState.priceData.maxPrice || ''),
            singlePrice: String(formState.priceData.singlePrice || '')
        });

        

        fetch(`${CONFIG.API_LEAD_URL}?${params}`)
            .then(response => response.json())
            .then(data => {
            

                const body = data.body || data;

                if (body.success || data.statusCode === 200) {
                    showSuccessMessage('confirmar');

                    trackEvent('lead_submitted', {
                        variant: 'D',
                        flow: 'confirmar',
                        engajamento: 'ALTO'
                    });

                    setTimeout(() => resetForm(), 3000);
                } else {
                    throw new Error(body.message || 'Erro');
                }
            })
            .catch(error => {
               
                showAlert('Erro ao enviar. Tente novamente.', 'error');
            });
    }

    // ============================================
    // SUBMIT: BOTÃO "PREFIRO FALAR"
    // ============================================
    function submitCallback() {
        const nome = document.getElementById('nomeCallback').value.trim();
        const telefone = document.getElementById('telefoneCallback').value.trim();
        const email = document.getElementById('emailCallback').value.trim();

        if (!nome || !telefone) {
            showAlert('Nome e telefone obrigatórios', 'error');
            return;
        }

        formState.data.nome = nome;
        formState.data.telefone = telefone;
        formState.data.email = email;

    

        showAlert('Agendando contacto...', 'aguarda');

        const params = new URLSearchParams({
            local_recolha: formState.data.origem,
            local_entrega: formState.data.destino,
            viatura: formState.data.viatura,
            urgencia: formState.data.urgencia,
            nome: nome || '',
            email: email || '',
            telemovel: telefone,
            flowType: 'falar',
            variante: 'D',
            // Enviar intervalo diretamente
            hasRange: String(formState.priceData.hasRange),
            minPrice: String(formState.priceData.minPrice || ''),
            maxPrice: String(formState.priceData.maxPrice || ''),
            singlePrice: String(formState.priceData.singlePrice || '')
        });

        

        fetch(`${CONFIG.API_LEAD_URL}?${params}`)
            .then(response => response.json())
            .then(data => {
                

                const body = data.body || data;

                if (body.success || data.statusCode === 200) {
                    showSuccessMessage('falar');

                    trackEvent('callback_requested', {
                        variant: 'D',
                        flow: 'falar',
                        engajamento: 'MEDIO'
                    });

                    setTimeout(() => resetForm(), 5000);
                } else {
                    throw new Error(body.message || 'Erro');
                }
            })
            .catch(error => {
                
                showAlert('Erro ao agendar. Tente novamente.', 'error');
            });
    }

    // ============================================
    // SUCCESS MESSAGES
    // ============================================
    function showSuccessMessage(flowType) {
        document.querySelectorAll('.form-step').forEach(s => s.classList.remove('active'));

        const successMsg = document.getElementById('successMessage');
        if (!successMsg) return;

        if (flowType === 'confirmar') {
            successMsg.innerHTML = `
                <div class="callback-icon" style="font-size: 4rem;">✔</div>
                <h2 class="form-title">Pedido Registado!</h2>
                <p class="form-subtitle">A nossa equipa irá contactá-lo nos <strong>próximos 5 minutos</strong> com o preço final e opções personalizadas.</p>
                <div style="background: #e8f5e9; padding: 1rem; border-radius: 8px; margin: 1.5rem 0;">
                    <p style="margin: 0;">📧 Confirmação enviada para: <strong>${formState.data.email}</strong></p>
                </div>
            `;
        } else {
            successMsg.innerHTML = `
                <div class="callback-icon" style="font-size: 4rem;">✆</div>
                <h2 class="form-title">Vamos Ligar!</h2>
                <p class="form-subtitle">A nossa equipa irá contactá-lo em breve para esclarecer todas as dúvidas e apresentar opções personalizadas.</p>
                <div style="background: #fff3cd; padding: 1rem; border-radius: 8px; margin: 1.5rem 0;">
                    <p style="margin: 0;">📱 Ligamos para: <strong>${formState.data.telefone}</strong></p>
                </div>
            `;
        }

        successMsg.style.display = 'block';
        // successMsg.scrollIntoView({ behavior: 'smooth' }); // Removido - sem scroll automático
    }

    // ============================================
    // RESET FORM
    // ============================================
    function resetForm() {
        formState = {
            currentStep: 1,
            flowType: null,
            data: {
                origem: '',
                destino: '',
                viatura: 'Furgão',
                urgencia: '4 Horas',
                nome: '',
                email: '',
                telefone: '',
                simulationId: null
            },
            priceData: {
                hasRange: false,
                minPrice: null,
                maxPrice: null,
                singlePrice: null,
                distance: null
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

        // IMPORTANTE: Esconder success message
        const successMsg = document.getElementById('successMessage');
        if (successMsg) {
            successMsg.style.display = 'none';
        }

        showStep(1);
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

    function trackEvent(eventName, data) {
        
        
        if (typeof gtag !== 'undefined') {
            gtag('event', eventName, data);
        }
        
        if (typeof fbq !== 'undefined') {
            fbq('trackCustom', eventName, data);
        }
    }

    function trackVariantView(variant) {
        trackEvent('variant_view', { variant: variant });
    }

    // ============================================
    // EXPORTAR FUNÇÕES
    // ============================================
    window.yourboxForm = {
        init,
        calculatePrice,
        showContactForm,
        showCallbackForm,
        submitLead,
        submitCallback,
        backToStep1,
        backToStep2,
        focusOrigem,
        abrirWhatsApp
    };

    // ============================================
    // AUTO-INIT
    // ============================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();