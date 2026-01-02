/**
 * Admin Utility Functions
 * Pure utility functions extracted from admin_spa.html for reusability and maintainability.
 */

const AdminUtils = {
    /**
     * Parse a date string, handling UTC timezone if not specified.
     * @param {string} dateString - The date string to parse
     * @returns {Date|null} Parsed Date object or null if invalid
     */
    parseDate(dateString) {
        if (!dateString) return null;

        let date;
        if (dateString.endsWith('Z') || dateString.includes('+') || dateString.includes('-', 10)) {
            date = new Date(dateString);
        } else {
            date = new Date(dateString + 'Z');
        }

        return isNaN(date.getTime()) ? null : date;
    },

    /**
     * Format a date string for display.
     * @param {string} dateString - The date string to format
     * @returns {string} Formatted date string
     */
    formatDate(dateString) {
        if (!dateString) return "Never";
        // Check if it's a date-only string (YYYY-MM-DD) - don't apply timezone conversion
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
            return this.formatDateOnly(dateString);
        }
        const date = this.parseDate(dateString);
        if (!date) return "Invalid date";
        return date.toLocaleDateString();
    },

    /**
     * Format a date-only string (YYYY-MM-DD) without timezone conversion.
     * @param {string} dateString - The date string in YYYY-MM-DD format
     * @returns {string} Formatted date string
     */
    formatDateOnly(dateString) {
        if (!dateString) return "Never";
        const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) return "Invalid date";
        const [, year, month, day] = match;
        // Create date at noon local time to avoid any DST edge cases
        const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 12, 0, 0);
        return date.toLocaleDateString();
    },

    /**
     * Format a date as relative time (e.g., "2 hours ago", "Yesterday").
     * @param {string} dateString - The date string to format
     * @returns {string} Relative time string
     */
    formatRelativeDate(dateString) {
        if (!dateString) return "Never";
        const date = this.parseDate(dateString);
        if (!date) return "Invalid date";

        const now = new Date();
        const diffMs = Math.max(0, now.getTime() - date.getTime());
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            if (diffHours === 0) {
                const diffMins = Math.floor(diffMs / (1000 * 60));
                return diffMins <= 1 ? "Just now" : `${diffMins} minutes ago`;
            }
            return diffHours === 1 ? "1 hour ago" : `${diffHours} hours ago`;
        } else if (diffDays === 1) {
            return "Yesterday";
        } else if (diffDays < 7) {
            return `${diffDays} days ago`;
        } else if (diffDays < 30) {
            const weeks = Math.floor(diffDays / 7);
            return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
        } else if (diffDays < 365) {
            const months = Math.floor(diffDays / 30);
            return months === 1 ? "1 month ago" : `${months} months ago`;
        } else {
            return date.toLocaleDateString();
        }
    },

    /**
     * Format a date string to show only time.
     * @param {string} dateString - The date string to format
     * @returns {string} Formatted time string
     */
    formatTime(dateString) {
        if (!dateString) return "";
        const date = this.parseDate(dateString);
        if (!date) return "";
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    },

    /**
     * Check if an IP address is private/internal.
     * @param {string} ip - The IP address to check
     * @returns {boolean} True if private IP
     */
    isPrivateIP(ip) {
        if (!ip || ip === '-' || ip === 'Unknown') return false;
        const privateRanges = [
            /^10\./,
            /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
            /^192\.168\./,
            /^127\./,
            /^169\.254\./,
            /^::1$/,
            /^fc00:/,
            /^fe80:/,
        ];
        return privateRanges.some(range => range.test(ip));
    },

    /**
     * Format an IP address for display.
     * @param {string} ip - The IP address to format
     * @returns {string} Formatted IP or "Internal Network" for private IPs
     */
    formatIP(ip) {
        if (!ip || ip === '-' || ip === 'Unknown') return '-';
        if (this.isPrivateIP(ip)) return 'Internal Network';
        return ip;
    },

    /**
     * Validate an email address format.
     * @param {string} email - The email to validate
     * @returns {boolean} True if valid email format
     */
    isValidEmail(email) {
        if (!email) return false;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    },

    /**
     * Check if a password is invalid (non-empty but too short).
     * @param {string} password - The password to check
     * @returns {boolean} True if password has content but is < 8 chars
     */
    hasInvalidPassword(password) {
        if (!password) return false;
        const trimmed = password.trim();
        return trimmed.length > 0 && trimmed.length < 8;
    },

    /**
     * Normalize whitespace in a string.
     * @param {string} value - The string to normalize
     * @returns {string} String with normalized whitespace
     */
    normalizeWhitespace(value) {
        return (value || '').toLowerCase().replace(/\s+/g, ' ').trim();
    },

    /**
     * Check if a field matches a search term with various matching strategies.
     * @param {string} value - The field value to search
     * @param {string} rawTerm - The raw search term
     * @param {string} strippedTerm - Search term with spaces removed
     * @param {string} normalizedTerm - Search term with normalized whitespace
     * @returns {boolean} True if field matches
     */
    matchesSearchField(value, rawTerm, strippedTerm, normalizedTerm = null) {
        const lower = (value || '').toLowerCase();
        const collapsed = this.normalizeWhitespace(lower);
        const noSpace = collapsed.replace(/\s+/g, '');
        const effectiveNormalized = normalizedTerm ?? this.normalizeWhitespace(rawTerm);
        return (
            (rawTerm && lower.includes(rawTerm)) ||
            (effectiveNormalized && collapsed.includes(effectiveNormalized)) ||
            (strippedTerm && noSpace.includes(strippedTerm))
        );
    },

    /**
     * Parse a time input string to decimal hours.
     * Supports H:MM format (e.g., "2:30") or decimal hours (e.g., "2.5").
     * @param {string} timeStr - The time string to parse
     * @returns {number|null} Decimal hours or null if invalid
     */
    parseTimeInput(timeStr) {
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
    },

    /**
     * Format a duration in hours for display.
     * @param {number} hours - The duration in hours
     * @returns {string} Formatted duration string
     */
    formatDuration(hours) {
        if (!hours || hours === 0) return '0.0h';
        return `${parseFloat(hours).toFixed(1)}h`;
    },

    /**
     * Get the CSS class for a job status badge.
     * @param {string} status - The job status
     * @returns {string} CSS class string for the badge
     */
    getStatusBadgeClass(status) {
        const base = "badge whitespace-nowrap border-2";
        const map = {
            "Completed/To be Filed": "badge-completed",
            "Needs Fieldwork": "badge-needs-fieldwork",
            "Set/Flag Pins": "badge-set-flag",
            "To Be Printed": "badge-to-be-printed",
            "Fieldwork Complete": "badge-office-work",
            "Survey Complete/Invoice Sent": "badge-invoice-sent",
            "Site Plan": "badge-ongoing-plan",
            "On Hold/Pending Estimate": "badge-on-hold",
            // Backward compatibility
            "Completed": "badge-completed",
            "Set Pins": "badge-set-flag",
            "Needs Office Work": "badge-office-work",
            "Invoice Sent": "badge-invoice-sent",
            "Ongoing Site": "badge-ongoing-plan",
            "On Hold": "badge-on-hold",
        };
        return `${base} ${map[status] || 'badge-default'}`;
    },

    /**
     * Get the background color hex code for a status.
     * @param {string} status - The job status
     * @returns {string} Hex color code
     */
    getStatusColor(status) {
        const colors = {
            "Completed/To be Filed": "#28a745",
            "Needs Fieldwork": "#e09132",
            "Set/Flag Pins": "#dc3545",
            "To Be Printed": "#0066cc",
            "Fieldwork Complete": "#6f42c1",
            "Survey Complete/Invoice Sent": "#f5c842",
            "Site Plan": "#e685b5",
            "On Hold/Pending Estimate": "#a8a8a8",
            // Backward compatibility
            "Completed": "#28a745",
            "Set Pins": "#dc3545",
            "Needs Office Work": "#6f42c1",
            "Invoice Sent": "#f5c842",
            "Ongoing Site": "#e685b5",
            "On Hold": "#a8a8a8",
        };
        return colors[status] || "#6c757d";
    },

    /**
     * Determine if text should be dark or light based on background color.
     * @param {string} hexColor - Hex color code
     * @returns {string} CSS class for text color
     */
    getTextColorClass(hexColor) {
        if (!hexColor) return 'tag-text-light';
        const hex = hexColor.replace("#", "");
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        return brightness > 155 ? 'tag-text-dark' : 'tag-text-light';
    }
};

// Attach to window for global access
window.AdminUtils = AdminUtils;
