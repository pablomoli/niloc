/**
 * Map Notifications Module
 * Toast-style notification system with touch support.
 */

/**
 * Display a transient toast-style notification.
 * @param {string} message - The text content to show.
 * @param {('info'|'success'|'error'|'warning')} [type='info'] - Visual style.
 */
function showNotification(message, type = 'info') {
    const container = document.getElementById('notification-container');
    if (!container) return;

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;

    const icons = {
        success: '<i class="bi bi-check-circle-fill"></i>',
        error: '<i class="bi bi-exclamation-triangle-fill"></i>',
        info: '<i class="bi bi-info-circle-fill"></i>',
        warning: '<i class="bi bi-exclamation-triangle-fill"></i>'
    };

    notification.innerHTML = `
        <div class="flex items-center gap-3">
            <span class="notification-icon">${icons[type] || icons.info}</span>
            <span class="notification-message">${message}</span>
        </div>
    `;

    container.appendChild(notification);

    const removeNotification = () => {
        notification.classList.add('hiding');
        setTimeout(() => {
            notification.remove();
        }, 300);
    };

    const timeout = setTimeout(removeNotification, 3000);

    notification.addEventListener('click', () => {
        clearTimeout(timeout);
        removeNotification();
    });

    // Touch swipe to dismiss
    let startY = 0;
    notification.addEventListener('touchstart', (e) => {
        startY = e.touches[0].clientY;
    });

    notification.addEventListener('touchmove', (e) => {
        const currentY = e.touches[0].clientY;
        const diff = currentY - startY;
        if (diff > 0) {
            notification.style.transform = `translateY(${diff}px)`;
            notification.style.opacity = 1 - (diff / 100);
        }
    });

    notification.addEventListener('touchend', (e) => {
        const currentY = e.changedTouches[0].clientY;
        const diff = currentY - startY;
        if (diff > 50) {
            clearTimeout(timeout);
            removeNotification();
        } else {
            notification.style.transform = '';
            notification.style.opacity = '';
        }
    });
}

window.showNotification = showNotification;
