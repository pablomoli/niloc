/**
 * Modal Utilities Module
 * Formatting, time calculations, and notifications.
 */

/**
 * Generate FEMA Flood Zone link from address.
 */
SimpleModal.generateFEMALink = function(address) {
    if (!address || address === 'N/A') return null;
    const baseURL = "https://msc.fema.gov/portal/search";
    return `${baseURL}?AddressQuery=${encodeURIComponent(address)}`;
};

/**
 * Generate status dropdown options.
 */
SimpleModal.generateStatusOptions = function(currentStatus) {
    const statuses = window.MarkerUtils ? Object.keys(window.MarkerUtils.EPIC_COLORS) : [];
    return statuses.map(status => {
        const selected = status === currentStatus ? 'selected' : '';
        return `<option value="${status}" ${selected} style="background-color: white;">
            ${status}
        </option>`;
    }).join('');
};

/**
 * Calculate total time from start and end times.
 */
SimpleModal.calculateTotalTime = function(startTime, endTime) {
    if (!startTime || !endTime) return 0;

    const start = new Date(`1970-01-01T${startTime}:00`);
    const end = new Date(`1970-01-01T${endTime}:00`);

    // Handle overnight shifts
    if (end < start) {
        end.setDate(end.getDate() + 1);
    }

    const diffMs = end - start;
    const diffHours = diffMs / (1000 * 60 * 60);

    return Math.round(diffHours * 100) / 100;
};

/**
 * Format date for display.
 */
SimpleModal.formatDate = function(dateString) {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString);
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const year = date.getFullYear();
        return `${month}/${day}/${year}`;
    } catch (error) {
        return dateString;
    }
};

/**
 * Format duration for display.
 */
SimpleModal.formatDuration = function(hours) {
    if (!hours || hours === 0) return '0.0h';
    return `${parseFloat(hours).toFixed(1)}h`;
};

/**
 * Calculate total time from all fieldwork entries.
 */
SimpleModal.getTotalFieldworkTime = function() {
    if (!this.fieldworkData || this.fieldworkData.length === 0) return 0;
    return this.fieldworkData.reduce((total, fw) => total + parseFloat(fw.total_time || 0), 0);
};

/**
 * Parse time input (HH:MM format) and validate.
 */
SimpleModal.parseTimeInput = function(timeStr) {
    if (!timeStr) return null;

    if (timeStr.includes(':')) {
        const parts = timeStr.split(':');
        if (parts.length === 2) {
            const hours = parseInt(parts[0], 10);
            const minutes = parseInt(parts[1], 10);
            if (isNaN(hours) || isNaN(minutes) || minutes < 0 || minutes >= 60) {
                return null;
            }
            return hours + (minutes / 60.0);
        }
    }

    const decimal = parseFloat(timeStr);
    return isNaN(decimal) ? null : decimal;
};

/**
 * Convert decimal hours to HH:MM format.
 */
SimpleModal.formatTimeInput = function(decimalHours) {
    if (!decimalHours || decimalHours === 0) return '0:00';
    const hours = Math.floor(decimalHours);
    const minutes = Math.round((decimalHours - hours) * 60);
    return `${hours}:${minutes.toString().padStart(2, '0')}`;
};

/**
 * Show notification message.
 */
SimpleModal.showNotification = function(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#17a2b8'};
        color: white;
        padding: 12px 20px;
        border-radius: 4px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        z-index: 1000000;
        animation: slideUp 0.3s ease-out;
    `;
    notification.textContent = message;

    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideUp {
            from { transform: translate(-50%, 100%); opacity: 0; }
            to { transform: translate(-50%, 0); opacity: 1; }
        }
    `;
    document.head.appendChild(style);

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideUp 0.3s ease-out reverse';
        setTimeout(() => {
            notification.remove();
            style.remove();
        }, 300);
    }, 3000);
};

/**
 * Copy address to clipboard.
 */
SimpleModal.copyAddress = async function(address) {
    const btn = document.getElementById('copyAddressBtn');
    const btnText = document.getElementById('copyBtnText');

    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(address);
        } else {
            const textArea = document.createElement('textarea');
            textArea.value = address;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();

            try {
                document.execCommand('copy');
            } catch (err) {
                console.error('Fallback copy failed:', err);
                throw new Error('Copy failed');
            } finally {
                textArea.remove();
            }
        }

        if (btn && btnText) {
            const originalBg = btn.style.background;
            btn.style.background = '#28a745';
            btnText.textContent = 'Copied!';

            setTimeout(() => {
                btn.style.background = originalBg;
                btnText.textContent = 'Copy';
            }, 2000);
        }

        SimpleModal.showNotification('Address copied to clipboard!', 'success');

    } catch (err) {
        console.error('Failed to copy address:', err);
        SimpleModal.showNotification('Failed to copy address', 'error');
    }
};

