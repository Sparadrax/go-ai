/* Load shared navigation and handle its menus and email clipboard feedback. */

/**
 * Load the shared navbar fragment and connect its interactive controls.
 *
 * Inputs: None; uses the current page's navigation placeholder.
 * @returns A promise that resolves after navigation setup or a retry prompt is shown.
 */
(async function loadNavigation() {
    const placeholder = document.getElementById('nav-placeholder');
    if (!placeholder) return;
    try {
        const response = await fetch('/NavBar.html', { cache: 'no-cache' });
        if (!response.ok) throw new Error(`Navigation request failed: ${response.status}`);
        placeholder.innerHTML = await response.text();
        const copyEmail = placeholder.querySelector('#copy-email');
        const copyNotification = placeholder.querySelector('#email-copy-notification');
        let notificationTimeout;
        copyEmail.addEventListener('click', copyEmailAddress);

        /**
         * Copy the displayed email and announce success only after clipboard access succeeds.
         *
         * Inputs: None; uses the enclosing email button and notification elements.
         * @returns A promise that resolves after showing clipboard success or failure feedback.
         */
        async function copyEmailAddress() {
            clearTimeout(notificationTimeout);
            copyNotification.textContent = '';

            try {
                const address = copyEmail.textContent.trim();
                if (navigator.clipboard && window.isSecureContext) {
                    try {
                        await navigator.clipboard.writeText(address);
                    } catch (error) {
                        copyWithSelection(address);
                    }
                } else {
                    // Older browsers and HTTP pages need the synchronous selection fallback.
                    copyWithSelection(address);
                }
                copyNotification.textContent = '✓ Mail copied';
            } catch (error) {
                // Keep the address selectable if clipboard permission is unavailable.
                copyNotification.textContent = 'Could not copy. Select the email to copy it manually.';
            }

            notificationTimeout = setTimeout(clearCopyNotification, 3500);
        }

        /**
         * Copy through a temporary selected field when the Clipboard API is unavailable.
         *
         * @param address - Email address to place on the clipboard.
         * @returns Nothing; restores focus and throws if copying is rejected.
         */
        function copyWithSelection(address) {
            const previousFocus = document.activeElement;
            const field = document.createElement('textarea');
            field.value = address;
            field.readOnly = true;
            field.style.position = 'fixed';
            field.style.opacity = '0';
            document.body.appendChild(field);

            try {
                field.select();
                field.setSelectionRange(0, address.length);
                if (!document.execCommand('copy')) {
                    throw new Error('Clipboard copy was rejected');
                }
            } finally {
                field.remove();
                if (previousFocus) {
                    previousFocus.focus({ preventScroll: true });
                }
            }
        }

        /**
         * Dismiss transient clipboard feedback without interrupting navigation.
         *
         * Inputs: None; uses the enclosing notification element.
         * @returns Nothing; clears the notification text.
         */
        function clearCopyNotification() {
            copyNotification.textContent = '';
        }

        const toggle = placeholder.querySelector('.navbar-toggler');
        const navigation = placeholder.querySelector('#site-navigation');
        const projects = placeholder.querySelector('#projects-menu');
        const menu = projects.nextElementSibling;
        /**
         * Close the project dropdown and synchronize its accessibility state.
         *
         * Inputs: None; uses the enclosing menu and projects button.
         * @returns Nothing; hides the menu and resets its expanded state.
         */
        function closeProjects() {
            menu.classList.remove('show');
            projects.setAttribute('aria-expanded', 'false');
        }
        toggle.addEventListener('click', () => {
            const expanded = navigation.classList.toggle('show');
            toggle.setAttribute('aria-expanded', String(expanded));
            if (!expanded) closeProjects();
        });
        projects.addEventListener('click', () => {
            const expanded = menu.classList.toggle('show');
            projects.setAttribute('aria-expanded', String(expanded));
        });
        document.addEventListener('click', (event) => {
            if (!projects.parentElement.contains(event.target)) closeProjects();
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && menu.classList.contains('show')) {
                closeProjects();
                projects.focus();
            } else if (event.key === 'Escape' && navigation.classList.contains('show')) {
                navigation.classList.remove('show');
                toggle.setAttribute('aria-expanded', 'false');
                toggle.focus();
            }
        });
        placeholder.querySelectorAll('a[href]').forEach((link) => {
            if (new URL(link.href).pathname === location.pathname) link.setAttribute('aria-current', 'page');
        });
    } catch (error) {
        console.error(error);
        placeholder.replaceChildren();
        const message = document.createElement('span');
        message.textContent = 'Navigation could not load. ';
        message.setAttribute('role', 'status');
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'btn btn-outline-light btn-sm';
        retry.textContent = 'Retry';
        retry.addEventListener('click', loadNavigation);
        placeholder.append(message, retry);
    }
})();
