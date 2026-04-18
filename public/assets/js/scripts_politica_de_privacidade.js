// Security Icons Animation
        class SecurityAnimation {
            constructor() {
                this.container = document.getElementById('securityAnimation');
                this.icons = ['🔒', '🛡️', '🔐', '🔑'];
                this.elements = [];
                this.maxIcons = 12;
                this.init();
            }

            init() {
                for (let i = 0; i < this.maxIcons; i++) {
                    this.createIcon();
                }
            }

            getRandomPosition() {
                return {
                    x: 5 + Math.random() * 90,
                    y: 5 + Math.random() * 90
                };
            }

            createIcon() {
                const position = this.getRandomPosition();
                const icon = this.icons[Math.floor(Math.random() * this.icons.length)];
                const isLock = icon === '🔒' || icon === '🔐';
                
                const element = document.createElement('div');
                element.className = `security-icon ${isLock ? 'lock' : 'shield'}`;
                element.textContent = icon;
                element.style.left = position.x + '%';
                element.style.top = position.y + '%';
                element.style.animationDelay = (Math.random() * 3) + 's';
                
                this.container.appendChild(element);
                this.elements.push(element);
            }
        }

        // Initialize animation
        new SecurityAnimation();