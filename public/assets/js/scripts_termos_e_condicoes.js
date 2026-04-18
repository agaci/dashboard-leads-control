
        // Legal Document Animation
        function createLegalAnimation() {
            const container = document.getElementById('legalAnimation');
            const icons = ['📄', '📋', '📑', '📝', '📜'];
            
            for (let i = 0; i < 15; i++) {
                const icon = document.createElement('div');
                icon.className = 'document-icon';
                icon.textContent = icons[Math.floor(Math.random() * icons.length)];
                icon.style.left = Math.random() * 100 + '%';
                icon.style.top = Math.random() * 100 + '%';
                icon.style.animationDelay = Math.random() * 10 + 's';
                icon.style.animationDuration = (15 + Math.random() * 10) + 's';
                container.appendChild(icon);
            }
        }

        createLegalAnimation();
 