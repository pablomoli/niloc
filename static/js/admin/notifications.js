/**
 * Admin Notifications Store
 * Alpine.js store for managing toast notifications.
 * Must be loaded before Alpine.js initializes.
 */

document.addEventListener("alpine:init", () => {
    Alpine.store("notifications", {
        items: [],
        nextId: 1,

        /**
         * Add a notification to the store.
         * @param {string} message - The notification message
         * @param {string} type - Notification type: 'info', 'success', 'warning', 'error'
         * @param {number} duration - Duration in ms before auto-dismiss (default: 5000)
         */
        add(message, type = "info", duration = 5000) {
            const actualDuration = type === 'error' ? 10000 : duration;
            const notification = {
                id: this.nextId++,
                message,
                type,
                show: false,
            };

            this.items.push(notification);

            // Animate in
            setTimeout(() => {
                notification.show = true;
            }, 10);

            // Auto-dismiss
            setTimeout(() => {
                this.remove(notification.id);
            }, actualDuration);
        },

        /**
         * Remove a notification by ID.
         * @param {number} id - The notification ID to remove
         */
        remove(id) {
            const index = this.items.findIndex((item) => item.id === id);
            if (index > -1) {
                this.items[index].show = false;
                // Allow animation to complete before removing
                setTimeout(() => {
                    this.items.splice(index, 1);
                }, 300);
            }
        },
    });
});
