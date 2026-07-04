// WeBuyAnyVehicle UK - Main JavaScript
// Vanilla JS, no dependencies

document.addEventListener('DOMContentLoaded', function() {
    // Mobile menu toggle
    const mobileToggle = document.getElementById('mobileToggle');
    const navLinks = document.getElementById('navLinks');

    if (mobileToggle && navLinks) {
        mobileToggle.addEventListener('click', function() {
            navLinks.classList.toggle('active');
            const icon = this.querySelector('i');
            if (icon) {
                icon.classList.toggle('fa-bars');
                icon.classList.toggle('fa-times');
            }
        });

        // Close menu when clicking outside
        document.addEventListener('click', function(e) {
            if (!mobileToggle.contains(e.target) && !navLinks.contains(e.target)) {
                navLinks.classList.remove('active');
                const icon = mobileToggle.querySelector('i');
                if (icon && icon.classList.contains('fa-times')) {
                    icon.classList.remove('fa-times');
                    icon.classList.add('fa-bars');
                }
            }
        });
    }

    // Navbar scroll effect
    const navbar = document.getElementById('navbar');
    if (navbar) {
        let lastScroll = 0;
        window.addEventListener('scroll', function() {
            const currentScroll = window.scrollY;
            if (currentScroll > 50) {
                navbar.classList.add('scrolled');
            } else {
                navbar.classList.remove('scrolled');
            }
            lastScroll = currentScroll;
        }, { passive: true });
    }

    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                // Close mobile menu if open
                if (navLinks && navLinks.classList.contains('active')) {
                    navLinks.classList.remove('active');
                    const icon = mobileToggle.querySelector('i');
                    if (icon) {
                        icon.classList.remove('fa-times');
                        icon.classList.add('fa-bars');
                    }
                }
            }
        });
    });

    // File upload visual feedback
    document.querySelectorAll('input[type="file"]').forEach(input => {
        input.addEventListener('change', function() {
            const parent = this.closest('.file-upload-zone');
            if (parent && this.files.length > 0) {
                // Validate file types and sizes
                const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
                const maxSize = 5 * 1024 * 1024; // 5MB
                let validFiles = [];
                let errors = [];

                for (let file of this.files) {
                    if (!allowedTypes.includes(file.type)) {
                        errors.push(`${file.name}: Invalid file type. Only JPG, PNG, WebP allowed.`);
                    } else if (file.size > maxSize) {
                        errors.push(`${file.name}: File too large (max 5MB).`);
                    } else {
                        validFiles.push(file);
                    }
                }

                if (errors.length > 0) {
                    parent.innerHTML = `
                        <i class="fas fa-exclamation-circle" style="color: var(--error); font-size: 2rem;"></i>
                        <p style="color: var(--error); font-weight: 700;">${errors.length} file(s) rejected</p>
                        <p><small>${errors[0]}${errors.length > 1 ? ' (+' + (errors.length - 1) + ' more)' : ''}</small></p>
                    `;
                } else {
                    parent.innerHTML = `
                        <i class="fas fa-check-circle" style="color: var(--success); font-size: 2rem;"></i>
                        <p style="color: var(--success); font-weight: 700;">${this.files.length} photo(s) selected</p>
                        <p><small>Click to change selection</small></p>
                    `;
                }
                parent.appendChild(this);
                this.style.display = 'none';
            } else if (parent) {
                parent.innerHTML = `
                    <i class="fas fa-cloud-upload-alt"></i>
                    <p><strong>Click to upload</strong> or drag photos here</p>
                    <p><small>JPG, PNG, WebP only. Max 5MB per file.</small></p>
                `;
            }
        });
    });

    // Form submission handling
    document.querySelectorAll('form').forEach(form => {
        form.addEventListener('submit', function(e) {
            const btn = this.querySelector('button[type="submit"]');
            if (btn && !btn.disabled) {
                const originalText = btn.innerHTML;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
                btn.disabled = true;

                // Re-enable if submission fails (after 10s timeout)
                setTimeout(() => {
                    if (btn.disabled) {
                        btn.innerHTML = originalText;
                        btn.disabled = false;
                    }
                }, 10000);
            }
        });
    });

    // FAQ accordion
    document.querySelectorAll('.faq-question').forEach(q => {
        q.addEventListener('click', function() {
            const item = this.parentElement;
            const isActive = item.classList.contains('active');

            // Close all others
            document.querySelectorAll('.faq-item.active').forEach(active => {
                if (active !== item) active.classList.remove('active');
            });

            // Toggle current
            item.classList.toggle('active', !isActive);
        });
    });

    // Flash message auto-dismiss
    document.querySelectorAll('.flash-message').forEach(msg => {
        setTimeout(() => {
            msg.style.opacity = '0';
            msg.style.transform = 'translateX(100%)';
            msg.style.transition = 'all 0.4s ease';
            setTimeout(() => msg.remove(), 400);
        }, 5000);
    });

    // Lazy load images
    if ('IntersectionObserver' in window) {
        const imgObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    if (img.dataset.src) {
                        img.src = img.dataset.src;
                        img.removeAttribute('data-src');
                        observer.unobserve(img);
                    }
                }
            });
        }, { rootMargin: '200px' });

        document.querySelectorAll('img[data-src]').forEach(img => {
            imgObserver.observe(img);
        });
    }

    // Admin sidebar mobile toggle
    const adminToggle = document.getElementById('adminToggle');
    const adminSidebar = document.querySelector('.admin-sidebar');
    if (adminToggle && adminSidebar) {
        adminToggle.addEventListener('click', function() {
            adminSidebar.classList.toggle('open');
        });
    }
});
