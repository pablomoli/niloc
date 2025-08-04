// Simple modal handler without Alpine
window.SimpleModal = {
    show(job) {
        console.log('SimpleModal.show called with job:', job);
        
        // Create modal HTML
        const modalHTML = `
            <div id="simpleJobModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center" style="z-index: 2000;">
                <!-- Backdrop -->
                <div class="absolute inset-0" onclick="SimpleModal.hide()"></div>
                
                <!-- Modal Content -->
                <div class="bg-white rounded-lg shadow-xl p-6 w-11/12 max-w-lg relative max-h-90vh overflow-y-auto">
                    <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" onclick="SimpleModal.hide()">✕</button>
                    
                    <h3 class="font-bold text-lg mb-2 text-primary">Job #${job.job_number || 'N/A'}</h3>
                    <div class="inline-block px-3 py-1 rounded-full text-white text-xs font-medium mb-4" style="background: ${window.MarkerUtils?.EPIC_COLORS[job.status] || '#6c757d'};">
                        ${job.status || 'Unknown Status'}
                    </div>
                    
                    <div class="space-y-4">
                        <div>
                            <h4 class="text-gray-400 text-sm font-medium mb-1">Client</h4>
                            <p class="text-gray-700">${job.client || 'N/A'}</p>
                        </div>
                        
                        <div>
                            <h4 class="text-gray-400 text-sm font-medium mb-1">Address</h4>
                            <div class="flex items-center gap-3">
                                <p class="text-gray-700 flex-1">${job.address || 'N/A'}</p>
                                ${job.address && job.address !== 'N/A' ? `
                                    <button 
                                        id="copyAddressBtn"
                                        onclick="SimpleModal.copyAddress('${job.address.replace(/'/g, "\\'")}')" 
                                        class="btn btn-sm btn-primary"
                                        title="Copy address to clipboard">
                                        <i class="bi bi-clipboard mr-1"></i>
                                        <span id="copyBtnText">Copy</span>
                                    </button>
                                ` : ''}
                            </div>
                        </div>
                        
                        <div>
                            <h4 class="text-gray-400 text-sm font-medium mb-1">County</h4>
                            <p class="text-gray-700">${job.county || 'N/A'}</p>
                        </div>
                        
                        ${job.notes ? `
                        <div>
                            <h4 class="text-gray-400 text-sm font-medium mb-1">Notes</h4>
                            <p class="text-gray-700">${job.notes}</p>
                        </div>
                        ` : ''}
                    </div>
                    
                    <div class="flex justify-end mt-6">
                        <button class="px-6 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors" onclick="SimpleModal.hide()">Close</button>
                    </div>
                </div>
            </div>
        `;
        
        // Remove any existing modal
        const existing = document.getElementById('simpleJobModal');
        if (existing) {
            existing.remove();
        }
        
        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Prevent body scroll
        document.body.style.overflow = 'hidden';
    },
    
    hide() {
        const modal = document.getElementById('simpleJobModal');
        if (modal) {
            modal.remove();
        }
        document.body.style.overflow = '';
    },
    
    async copyAddress(address) {
        const btn = document.getElementById('copyAddressBtn');
        const btnText = document.getElementById('copyBtnText');
        
        try {
            // Modern clipboard API (works on HTTPS and localhost)
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(address);
            } else {
                // Fallback for older browsers or non-secure contexts
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
            
            // Visual feedback
            if (btn && btnText) {
                const originalBg = btn.style.background;
                btn.style.background = '#28a745';
                btnText.textContent = 'Copied!';
                
                // Reset after 2 seconds
                setTimeout(() => {
                    btn.style.background = originalBg;
                    btnText.textContent = 'Copy';
                }, 2000);
            }
            
            // Show notification
            SimpleModal.showNotification('Address copied to clipboard!', 'success');
            
        } catch (err) {
            console.error('Failed to copy address:', err);
            SimpleModal.showNotification('Failed to copy address', 'error');
        }
    },
    
    showNotification(message, type = 'info') {
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
        
        // Add animation styles
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideUp {
                from { transform: translate(-50%, 100%); opacity: 0; }
                to { transform: translate(-50%, 0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
        
        document.body.appendChild(notification);
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.animation = 'slideUp 0.3s ease-out reverse';
            setTimeout(() => {
                notification.remove();
                style.remove();
            }, 300);
        }, 3000);
    }
};

// Make it globally available
window.openJobModal = SimpleModal.show;
window.closeJobModal = SimpleModal.hide;
