// Cookie Animation
        function createCookieAnimation() {
            const container = document.getElementById('cookieAnimation');
            const cookieIcon = '🍪';
            
            for (let i = 0; i < 20; i++) {
                const cookie = document.createElement('div');
                cookie.className = 'cookie';
                cookie.textContent = cookieIcon;
                cookie.style.left = Math.random() * 100 + '%';
                cookie.style.top = Math.random() * 100 + '%';
                cookie.style.animationDelay = Math.random() * 8 + 's';
                cookie.style.animationDuration = (12 + Math.random() * 8) + 's';
                container.appendChild(cookie);
            }
        }

        createCookieAnimation();

        // Smooth scroll for internal links
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
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
   