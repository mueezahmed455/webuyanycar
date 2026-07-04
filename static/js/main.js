// webuyanyvehicle UK - Main JavaScript
// Vanilla JS, no dependencies — premium UX

document.addEventListener('DOMContentLoaded', function() {
    'use strict';

    // ─── DOM REFS ───────────────────────────────────
    const mobileToggle = document.getElementById('mobileToggle');
    const navLinks = document.getElementById('navLinks');
    const navbar = document.getElementById('navbar');
    const scrollProgress = document.getElementById('scrollProgress');
    const backToTop = document.getElementById('backToTop');

    // ─── SCROLL PROGRESS BAR ────────────────────────
    if (scrollProgress) {
        window.addEventListener('scroll', function() {
            const scrollTop = window.scrollY;
            const docHeight = document.documentElement.scrollHeight - window.innerHeight;
            const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
            scrollProgress.style.width = Math.min(100, Math.max(0, progress)) + '%';
        }, { passive: true });
    }

    // ─── BACK TO TOP ────────────────────────────────
    if (backToTop) {
        window.addEventListener('scroll', function() {
            if (window.scrollY > 500) {
                backToTop.classList.add('visible');
            } else {
                backToTop.classList.remove('visible');
            }
        }, { passive: true });

        backToTop.addEventListener('click', function() {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // ─── NAVBAR SCROLL DIRECTION HIDE/SHOW ──────────
    if (navbar) {
        let lastScroll = 0;
        let scrollTimeout;

        window.addEventListener('scroll', function() {
            const currentScroll = window.scrollY;

            // Add scrolled class for shadow
            if (currentScroll > 50) {
                navbar.classList.add('scrolled');
            } else {
                navbar.classList.remove('scrolled');
            }

            // Hide on scroll down, show on scroll up (only on mobile)
            if (window.innerWidth <= 768) {
                if (currentScroll > lastScroll && currentScroll > 200) {
                    navbar.style.transform = 'translateY(-100%)';
                } else {
                    navbar.style.transform = 'translateY(0)';
                }

                clearTimeout(scrollTimeout);
                scrollTimeout = setTimeout(function() {
                    navbar.style.transform = 'translateY(0)';
                }, 2000);
            }

            lastScroll = currentScroll;
        }, { passive: true });

        // Reset navbar transform when resizing above mobile breakpoint
        window.addEventListener('resize', function() {
            if (window.innerWidth > 768) {
                navbar.style.transform = '';
            }
        });
    }

    // ─── MOBILE MENU ────────────────────────────────
    // Create backdrop element
    const backdrop = document.createElement('div');
    backdrop.className = 'mobile-backdrop';
    backdrop.id = 'mobileBackdrop';
    document.body.appendChild(backdrop);

    function closeMenu() {
        navLinks.classList.remove('active');
        backdrop.classList.remove('active');
        const icon = mobileToggle.querySelector('i');
        if (icon) {
            icon.classList.remove('fa-times');
            icon.classList.add('fa-bars');
        }
        document.body.style.overflow = '';
    }

    function openMenu() {
        navLinks.classList.add('active');
        backdrop.classList.add('active');
        const icon = mobileToggle.querySelector('i');
        if (icon) {
            icon.classList.remove('fa-bars');
            icon.classList.add('fa-times');
        }
        document.body.style.overflow = 'hidden';
    }

    if (mobileToggle && navLinks) {
        mobileToggle.addEventListener('click', function() {
            if (navLinks.classList.contains('active')) {
                closeMenu();
            } else {
                openMenu();
            }
        });

        backdrop.addEventListener('click', closeMenu);

        // Swipe-to-close: detect rightward swipe on navLinks panel
        let touchStartX = 0;
        let touchStartY = 0;

        navLinks.addEventListener('touchstart', function(e) {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        }, { passive: true });

        navLinks.addEventListener('touchend', function(e) {
            const touchEndX = e.changedTouches[0].clientX;
            const touchEndY = e.changedTouches[0].clientY;
            const diffX = touchEndX - touchStartX;
            const diffY = touchEndY - touchStartY;

            // Rightward swipe (close menu) — must be more horizontal than vertical
            if (diffX > 60 && Math.abs(diffX) > Math.abs(diffY) * 1.5) {
                closeMenu();
            }
        });

        // Also allow swiping right on the backdrop to close
        backdrop.addEventListener('touchstart', function(e) {
            touchStartX = e.touches[0].clientX;
        }, { passive: true });

        backdrop.addEventListener('touchend', function(e) {
            const touchEndX = e.changedTouches[0].clientX;
            const touchEndY = e.changedTouches[0].clientY;
            const diffX = touchEndX - touchStartX;
            const diffY = Math.abs(touchEndY - touchStartY);
            // Must be a rightward swipe that's more horizontal than vertical
            if (diffX > 50 && Math.abs(diffX) > diffY) {
                closeMenu();
            }
        });



        // Close menu when clicking a nav link
        navLinks.querySelectorAll('a').forEach(function(link) {
            link.addEventListener('click', function() {
                if (navLinks.classList.contains('active')) {
                    closeMenu();
                }
            });
        });
    }

    // ─── COMBINED ESCAPE KEY HANDLER ───────────────
    document.addEventListener('keydown', function(e) {
        if (e.key !== 'Escape') return;

        // Priority 1: Close mobile menu if it's open
        if (navLinks && navLinks.classList.contains('active')) {
            closeMenu();
            return;
        }

        // Priority 2: Scroll to top when body is focused
        if (document.activeElement === document.body) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });

    // ─── SMOOTH SCROLL FOR ANCHOR LINKS ─────────────
    document.querySelectorAll('a[href^="#"]').forEach(function(anchor) {
        anchor.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href === '#') return;
            e.preventDefault();
            const target = document.querySelector(href);
            if (target) {
                const navHeight = navbar ? navbar.offsetHeight : 80;
                const targetPosition = target.getBoundingClientRect().top + window.scrollY - navHeight;
                window.scrollTo({ top: targetPosition, behavior: 'smooth' });
            }
        });
    });

    // ─── SCROLL REVEAL ANIMATIONS ───────────────────
    if ('IntersectionObserver' in window) {
        const revealObserver = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('revealed');
                    revealObserver.unobserve(entry.target);
                }
            });
        }, {
            threshold: 0.15,
            rootMargin: '0px 0px -50px 0px'
        });

        document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale').forEach(function(el) {
            revealObserver.observe(el);
        });
    } else {
        // Fallback: show all on load
        document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale').forEach(function(el) {
            el.classList.add('revealed');
        });
    }

    // ─── COUNTER ANIMATIONS ─────────────────────────
    if ('IntersectionObserver' in window) {
        const counterObserver = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    const el = entry.target;
                    const target = parseInt(el.getAttribute('data-count') || '0', 10);
                    const suffix = el.getAttribute('data-suffix') || '';
                    const prefix = el.getAttribute('data-prefix') || '';
                    const duration = parseInt(el.getAttribute('data-duration') || '2000', 10);

                    if (target > 0) {
                        animateCounter(el, target, prefix, suffix, duration);
                    }

                    counterObserver.unobserve(el);
                }
            });
        }, { threshold: 0.5 });

        document.querySelectorAll('[data-count]').forEach(function(el) {
            counterObserver.observe(el);
        });
    }

    function animateCounter(el, target, prefix, suffix, duration) {
        const startTime = performance.now();
        const startVal = 0;

        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Ease out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(startVal + (target - startVal) * eased);

            if (target >= 1000) {
                el.textContent = prefix + current.toLocaleString() + suffix;
            } else if (target === Math.floor(target)) {
                el.textContent = prefix + current + suffix;
            } else {
                el.textContent = prefix + (current / 10).toFixed(1) + suffix;
            }

            if (progress < 1) {
                requestAnimationFrame(update);
            } else {
                // Final value
                if (target >= 1000) {
                    el.textContent = prefix + target.toLocaleString() + suffix;
                } else if (target === Math.floor(target)) {
                    el.textContent = prefix + target + suffix;
                } else {
                    el.textContent = prefix + (target / 10).toFixed(1) + suffix;
                }
            }
        }

        requestAnimationFrame(update);
    }

    // ─── PARALLAX SCROLL EFFECT ────────────────────
    if ('IntersectionObserver' in window) {
        const parallaxObserver = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                const el = entry.target;
                if (entry.isIntersecting) {
                    el.classList.add('parallax-active');
                    parallaxObserver.unobserve(el);
                }
            });
        }, { threshold: 0 });

        window.addEventListener('scroll', function() {
            document.querySelectorAll('.parallax-subtle.parallax-active').forEach(function(el) {
                const speed = parseFloat(el.getAttribute('data-speed') || '0.03');
                const rect = el.getBoundingClientRect();
                const scrolled = rect.top / window.innerHeight;
                el.style.transform = 'translateY(' + (scrolled * speed * 100) + 'px)';
            });
        }, { passive: true });

        document.querySelectorAll('.parallax-subtle').forEach(function(el) {
            parallaxObserver.observe(el);
        });
    }

    // ─── FILE UPLOAD FEEDBACK ───────────────────────
    document.querySelectorAll('input[type="file"]').forEach(function(input) {
        input.addEventListener('change', function() {
            const parent = this.closest('.file-upload-zone');
            if (!parent) return;

            if (this.files.length > 0) {
                const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
                const maxSize = 5 * 1024 * 1024;
                let validFiles = [];
                let errors = [];

                for (let i = 0; i < this.files.length; i++) {
                    const file = this.files[i];
                    if (!allowedTypes.includes(file.type)) {
                        errors.push(file.name + ': Invalid type. Only JPG, PNG, WebP accepted.');
                    } else if (file.size > maxSize) {
                        errors.push(file.name + ': File too large (max 5MB).');
                    } else {
                        validFiles.push(file);
                    }
                }

                const iconSpan = parent.querySelector('i, .upload-icon') || document.createElement('i');
                const heading = parent.querySelector('p strong, p:first-of-type') || document.createElement('p');
                const note = parent.querySelector('p small, p:last-of-type') || document.createElement('p');

                if (errors.length > 0) {
                    parent.innerHTML = `
                        <i class="fas fa-exclamation-circle" style="color: var(--error); font-size: 2rem; display: block; margin-bottom: 8px;"></i>
                        <p style="margin: 0 0 4px; font-weight: 700; color: var(--error);">${errors.length} file(s) rejected</p>
                        <p style="margin: 0;"><small>${errors[0]}${errors.length > 1 ? ' (+' + (errors.length - 1) + ' more)' : ''}</small></p>
                    `;
                } else {
                    parent.innerHTML = `
                        <i class="fas fa-check-circle" style="color: var(--success); font-size: 2rem; display: block; margin-bottom: 8px;"></i>
                        <p style="margin: 0 0 4px; font-weight: 700; color: var(--success);">${this.files.length} photo(s) selected</p>
                        <p style="margin: 0;"><small>Click to change</small></p>
                    `;
                }

                parent.appendChild(this);
                this.style.display = 'none';
                parent.style.cursor = 'pointer';
                parent.addEventListener('click', function handler() {
                    input.click();
                }, { once: false });
            }
        });
    });

    // ─── FORM SUBMISSION UX ─────────────────────────
    document.querySelectorAll('form').forEach(function(form) {
        form.addEventListener('submit', function() {
            const btn = this.querySelector('button[type="submit"]');
            if (btn && !btn.disabled) {
                const originalHTML = btn.innerHTML;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
                btn.disabled = true;
                btn.style.opacity = '0.8';

                setTimeout(function() {
                    if (btn.disabled) {
                        btn.innerHTML = originalHTML;
                        btn.disabled = false;
                        btn.style.opacity = '1';
                    }
                }, 12000);
            }
        });
    });

    // ─── FAQ ACCORDION ──────────────────────────────
    document.querySelectorAll('.faq-question').forEach(function(q) {
        q.addEventListener('click', function() {
            const item = this.parentElement;
            const isActive = item.classList.contains('active');

            document.querySelectorAll('.faq-item.active').forEach(function(active) {
                if (active !== item) active.classList.remove('active');
            });

            if (!isActive) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    });

    // ─── FLASH MESSAGE AUTO-DISMISS ─────────────────
    document.querySelectorAll('.flash-message').forEach(function(msg) {
        setTimeout(function() {
            msg.style.opacity = '0';
            msg.style.transform = 'translateX(100%)';
            msg.style.transition = 'all 0.4s ease';
            setTimeout(function() { msg.remove(); }, 400);
        }, 5000);
    });

    // ─── LAZY LOAD IMAGES ───────────────────────────
    if ('loading' in HTMLImageElement.prototype) {
        // Native lazy loading supported — use browser-native
        document.querySelectorAll('img[loading="lazy"]').forEach(function(img) {
            img.addEventListener('load', function() {
                img.classList.add('loaded');
            });
            if (img.complete) {
                img.classList.add('loaded');
            }
        });
    } else {
        // Fallback for older browsers
        if ('IntersectionObserver' in window) {
            const imgObserver = new IntersectionObserver(function(entries, observer) {
                entries.forEach(function(entry) {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        if (img.dataset.src) {
                            img.src = img.dataset.src;
                            img.removeAttribute('data-src');
                            img.addEventListener('load', function() {
                                img.classList.add('loaded');
                            });
                            observer.unobserve(img);
                        }
                    }
                });
            }, { rootMargin: '200px' });

            document.querySelectorAll('img[data-src]').forEach(function(img) {
                imgObserver.observe(img);
            });
        }
    }

    // ─── ADMIN SIDEBAR MOBILE ───────────────────────
    const adminToggle = document.getElementById('adminToggle');
    const adminSidebar = document.querySelector('.admin-sidebar');
    if (adminToggle && adminSidebar) {
        const adminOverlay = document.createElement('div');
        adminOverlay.className = 'mobile-backdrop';
        adminSidebar.parentNode.insertBefore(adminOverlay, adminSidebar.nextSibling);

        adminToggle.addEventListener('click', function() {
            adminSidebar.classList.toggle('open');
            adminOverlay.classList.toggle('active');
        });

        adminOverlay.addEventListener('click', function() {
            adminSidebar.classList.remove('open');
            adminOverlay.classList.remove('active');
        });
    }
});

