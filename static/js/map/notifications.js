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

    const iconClasses = {
        success: 'bi-check-circle-fill',
        error: 'bi-exclamation-triangle-fill',
        info: 'bi-info-circle-fill',
        warning: 'bi-exclamation-triangle-fill'
    };

    const wrapper = document.createElement('div');
    wrapper.className = 'flex items-center gap-3';

    const iconSpan = document.createElement('span');
    iconSpan.className = 'notification-icon';
    const icon = document.createElement('i');
    icon.className = `bi ${iconClasses[type] || iconClasses.info}`;
    iconSpan.appendChild(icon);

    const messageSpan = document.createElement('span');
    messageSpan.className = 'notification-message';
    messageSpan.textContent = message;

    wrapper.appendChild(iconSpan);
    wrapper.appendChild(messageSpan);
    notification.appendChild(wrapper);

    container.appendChild(notification);

    const removeNotification = () => {
        notification.classList.add('hiding');
        setTimeout(() => {
            notification.remove();
        }, 300);
    };

    const timeout = setTimeout(removeNotification, 5000);

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
