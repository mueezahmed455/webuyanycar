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

    // ─── UNIFIED SCROLL HANDLER ─────────────────────
    // Every per-scroll concern (progress bar, navbar state, back-to-top
    // visibility + arc, mobile sticky CTA, navbar hide-on-scroll) is
    // batched into ONE rAF-coalesced update. This is critical on mobile —
    // six separate scroll listeners each fire on every touchmove and were
    // overwhelming the GPU with redundant DOM writes. Now we read scrollY
    // once per frame and write once per frame.
    const NAV_SCROLL_HIDE_THRESHOLD = 200;
    const BACK_TO_TOP_THRESHOLD = 500;
    const MOBILE_CTA_FOLD_FACTOR = 0.6;
    const MOBILE_CTA_FOOTER_FADE_PX = 60;
    const MOBILE_BREAKPOINT_PX = 768;
    const ARC_CIRCUMFERENCE = 2 * Math.PI * 24; // ~150.8

    const mobileBottomCtaEl = document.getElementById('mobileBottomCta');
    const backToTopArcEl = document.getElementById('backToTopArc');

    // Cache matchMedia matchers once; re-evaluate only on resize.
    const mobileMatcher = window.matchMedia('(max-width: ' + (MOBILE_BREAKPOINT_PX - 1) + 'px)');

    let scrollRafPending = false;
    let lastScrollY = 0;
    let lastNavbarTransformY = null;  // canonical sentinel: null = "not yet set"
    let mobileCtaShown = false;
    let navbarTypeTimer = null;

    function applyUnifiedScroll() {
        scrollRafPending = false;

        const scrollY = window.scrollY;
        if (scrollY === lastScrollY) {
            return;
        }
        const isDown = scrollY > lastScrollY;
        const viewportH = window.innerHeight;
        const docHeight = document.documentElement.scrollHeight;
        const scrollable = docHeight - viewportH;
        const ratio = scrollable > 0 ? Math.min(1, Math.max(0, scrollY / scrollable)) : 0;
        const isMobile = mobileMatcher.matches;

        // 1) Scroll progress bar (cheap CSS width %)
        if (scrollProgress) {
            scrollProgress.style.width = (ratio * 100).toFixed(2) + '%';
        }

        // 2) Navbar scrolled state (single class toggle, batched)
        if (navbar) {
            navbar.classList.toggle('scrolled', scrollY > 50);

            // 3) Navbar hide-on-scroll-down only on mobile + once past hero
            const nextTransformY =
                isMobile && isDown && scrollY > NAV_SCROLL_HIDE_THRESHOLD
                    ? '-100%'
                    : '0%';
            if (nextTransformY !== lastNavbarTransformY) {
                navbar.style.transform = 'translateY(' + nextTransformY + ')';
                lastNavbarTransformY = nextTransformY;
            }
            if (isMobile) {
                if (navbarTypeTimer) clearTimeout(navbarTypeTimer);
                navbarTypeTimer = setTimeout(function() {
                    navbar.style.transform = 'translateY(0%)';
                    lastNavbarTransformY = '0%';
                }, 2000);
            }
        }

        // 4) Back-to-top visibility toggle + arc progress (single DOM write)
        if (backToTop) {
            backToTop.classList.toggle('visible', scrollY > BACK_TO_TOP_THRESHOLD);
        }
        if (backToTopArcEl) {
            backToTopArcEl.style.strokeDashoffset = (ARC_CIRCUMFERENCE * (1 - ratio)).toFixed(2);
        }

        // 5) Mobile sticky bottom CTA — only update when state flips
        if (mobileBottomCtaEl) {
            if (!isMobile) {
                if (mobileCtaShown) {
                    mobileBottomCtaEl.classList.remove('is-visible');
                    document.body.classList.remove('has-mbcta');
                    mobileCtaShown = false;
                }
            } else {
                const heroPx = viewportH * MOBILE_CTA_FOLD_FACTOR;
                const nearBottom = scrollY + viewportH >= docHeight - MOBILE_CTA_FOOTER_FADE_PX;
                const shouldShow = scrollY > heroPx && !nearBottom;
                if (shouldShow !== mobileCtaShown) {
                    mobileCtaShown = shouldShow;
                    mobileBottomCtaEl.classList.toggle('is-visible', shouldShow);
                    document.body.classList.toggle('has-mbcta', shouldShow);
                }
            }
        }

        lastScrollY = scrollY;
        // Run the (optional) parallax pass after the unified state has been
        // updated. Skipped entirely on mobile / touch / reduced-motion.
        onScrollTickExcludeParallax();
    }

    // Hook for the (optional) parallax pass. Declared as `let` so the
    // desktop-only branch below can safely override it. (Reassigning a
    // `function` declaration is a TypeError in strict mode.)
    let onScrollTickExcludeParallax = function() { /* no-op default */ };

    function scheduleScrollUpdate() {
        if (scrollRafPending) return;
        scrollRafPending = true;
        requestAnimationFrame(applyUnifiedScroll);
    }

    // Single scroll listener — coalesces ALL per-frame work to one rAF.
    window.addEventListener('scroll', scheduleScrollUpdate, { passive: true });
    // Initial pass so progress bar / CTA start in correct state.
    scheduleScrollUpdate();

    // Resize: re-evaluate on width changes; do NOT touch transforms cheaply.
    let resizeRaf = null;
    window.addEventListener('resize', function() {
        if (resizeRaf) cancelAnimationFrame(resizeRaf);
        resizeRaf = requestAnimationFrame(function() {
            if (navbar && window.innerWidth > MOBILE_BREAKPOINT_PX) {
                navbar.style.transform = '';
                lastNavbarTransformY = null;
            }
            scheduleScrollUpdate();
        });
    }, { passive: true });

    // Back-to-top click (kept cheap — smoothScroll triggers rAF).
    if (backToTop) {
        backToTop.addEventListener('click', function() {
            window.scrollTo({ top: 0, behavior: 'smooth' });
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

    // ─── PARALLAX — SUBSCRIBED INTO THE UNIFIED SCROLL TICK ──────────
    // The previous version ran querySelectorAll + getBoundingClientRect on
    // every scroll event across the whole page, which is one of the biggest
    // contributors to scroll jank on mid-range phones. We now:
    //  - On desktop + hover-capable + not reduced-motion: opt in. The list
    //    is cached ONCE and the scroll sample lives inside the already-running
    //    rAF loop (no second scroll listener).
    //  - On mobile / coarse-pointer / reduced-motion: parallax is disabled
    //    entirely — it doesn't add enough value to justify per-frame layout
    //    reads on weaker hardware.
    const parallaxTargets = Array.from(document.querySelectorAll('.parallax-subtle'));
    if (parallaxTargets.length) {
        const allowParallax = window.matchMedia('(min-width: 769px) and (hover: hover)').matches
            && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (allowParallax) {
            // Replace the no-op default with the actual parallax pass.
            // Safe to reassign because onScrollTickExcludeParallax is `let`.
            onScrollTickExcludeParallax = function() {
                const viewportH = window.innerHeight;
                for (let i = 0; i < parallaxTargets.length; i++) {
                    const el = parallaxTargets[i];
                    const speed = parseFloat(el.dataset.speed || '0.03');
                    const rect = el.getBoundingClientRect();
                    if (rect.bottom < -200 || rect.top > viewportH + 200) continue;
                    el.style.transform = 'translate3d(0, ' + (rect.top * speed).toFixed(2) + 'px, 0)';
                }
            };
        }
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
        // Insert next to sidebar (or before it if it's a direct child of body)
        if (adminSidebar.parentNode) {
            adminSidebar.parentNode.insertBefore(adminOverlay, adminSidebar.nextSibling);
        }

        function closeAdminDrawer() {
            adminSidebar.classList.remove('open');
            adminOverlay.classList.remove('active');
            document.body.style.overflow = '';
            const icon = adminToggle.querySelector('i');
            if (icon) {
                icon.classList.remove('fa-times');
                icon.classList.add('fa-bars');
            }
        }
        function openAdminDrawer() {
            adminSidebar.classList.add('open');
            adminOverlay.classList.add('active');
            document.body.style.overflow = 'hidden';
            const icon = adminToggle.querySelector('i');
            if (icon) {
                icon.classList.remove('fa-bars');
                icon.classList.add('fa-times');
            }
        }

        adminToggle.addEventListener('click', function() {
            if (adminSidebar.classList.contains('open')) {
                closeAdminDrawer();
            } else {
                openAdminDrawer();
            }
        });

        adminOverlay.addEventListener('click', closeAdminDrawer);

        // Swipe-to-close on admin drawer
        let atStartX = 0;
        adminSidebar.addEventListener('touchstart', function(e) {
            atStartX = e.touches[0].clientX;
        }, { passive: true });
        adminSidebar.addEventListener('touchend', function(e) {
            const endX = e.changedTouches[0].clientX;
            if (endX - atStartX < -50) closeAdminDrawer();
        }, { passive: true });

        // Close drawer on Escape
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && adminSidebar.classList.contains('open')) {
                closeAdminDrawer();
            }
        });
    }

    // ─── PROMO BAR DISMISS ──────────────────────────
    const promoBar = document.getElementById('promoBar');
    const promoClose = document.getElementById('promoClose');
    const PROMO_KEY = 'wbav_promo_dismissed';

    if (promoBar) {
        try {
            // Hide if already dismissed in this session
            if (sessionStorage.getItem(PROMO_KEY) === '1') {
                promoBar.classList.add('is-dismissed');
                promoBar.style.display = 'none';
            }
        } catch (e) {
            // Ignore sessionStorage unavailable (Safari private mode)
        }

        if (promoClose) {
            promoClose.addEventListener('click', function() {
                promoBar.classList.add('is-dismissed');
                try { sessionStorage.setItem(PROMO_KEY, '1'); } catch (e) { /* noop */ }
                setTimeout(function() { promoBar.style.display = 'none'; }, 400);
            });
        }
    }

    // ─── MOBILE STICKY BOTTOM CTA ───────────────────
    const mobileBottomCta = document.getElementById('mobileBottomCta');
    if (mobileBottomCta) {
        // Reveal after scrolling past the hero (~80% of viewport height)
        // Hide near the bottom (where footer is) so it doesn't overlap last content.
        // Also toggles `has-mbcta` on <body> so global padding-bottom only kicks
        // in when the bar is actually showing (avoids empty gap on short pages).
        let lastCtaVisible = false;
        function updateMobileCta() {
            if (!mobileBottomCta) return;
            if (window.innerWidth > 768) {
                if (mobileBottomCta.classList.contains('is-visible')) {
                    mobileBottomCta.classList.remove('is-visible');
                    document.body.classList.remove('has-mbcta');
                }
                return;
            }
            const scrollY = window.scrollY;
            const viewportH = window.innerHeight;
            const heroHeight = viewportH * 0.6;
            const totalH = document.documentElement.scrollHeight;
            const nearBottom = scrollY + viewportH >= totalH - 60;
            const shouldShow = scrollY > heroHeight && !nearBottom;
            if (shouldShow !== lastCtaVisible) {
                lastCtaVisible = shouldShow;
                mobileBottomCta.classList.toggle('is-visible', shouldShow);
                document.body.classList.toggle('has-mbcta', shouldShow);
            }
        }
        window.addEventListener('scroll', updateMobileCta, { passive: true });
        window.addEventListener('resize', updateMobileCta, { passive: true });
        updateMobileCta();
    }

    // ─── BACK TO TOP — PROGRESS ARC ─────────────────
    const backToTopArc = document.getElementById('backToTopArc');
    if (backToTopArc && backToTop) {
        // Update the arc on every scroll (smooth, on top of existing visibility toggle)
        window.addEventListener('scroll', function() {
            const scrollTop = window.scrollY;
            const docHeight = document.documentElement.scrollHeight - window.innerHeight;
            const progress = docHeight > 0 ? Math.min(1, scrollTop / docHeight) : 0;
            const circumference = 2 * Math.PI * 24; // ~150.8
            backToTopArc.style.strokeDashoffset = circumference * (1 - progress);
        }, { passive: true });
    }
});

