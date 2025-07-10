// Simple modal handler without Alpine
window.SimpleModal = {
    show(job) {
        console.log('SimpleModal.show called with job:', job);
        
        // Create modal HTML
        const modalHTML = `
            <div id="simpleJobModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 999999; display: flex; align-items: center; justify-content: center;">
                <!-- Backdrop -->
                <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5);" onclick="SimpleModal.hide()"></div>
                
                <!-- Modal Content -->
                <div style="position: relative; background: white; padding: 20px; border-radius: 8px; max-width: 600px; width: 90%; max-height: 90vh; overflow-y: auto; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
                    <button style="position: absolute; top: 10px; right: 10px; background: none; border: none; font-size: 24px; cursor: pointer;" onclick="SimpleModal.hide()">&times;</button>
                    
                    <h2>Job #${job.job_number || 'N/A'}</h2>
                    <div style="display: inline-block; background: ${window.MarkerUtils?.EPIC_COLORS[job.status] || '#6c757d'}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; margin-bottom: 15px;">
                        ${job.status || 'Unknown Status'}
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <h4>Client</h4>
                        <p>${job.client || 'N/A'}</p>
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <h4>Address</h4>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <p style="margin: 0; flex: 1;">${job.address || 'N/A'}</p>
                            ${job.address && job.address !== 'N/A' ? `
                                <button 
                                    id="copyAddressBtn"
                                    onclick="SimpleModal.copyAddress('${job.address.replace(/'/g, "\\'")}')" 
                                    style="background: #0d6efd; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; gap: 6px; min-height: 44px; min-width: 44px; font-size: 14px;"
                                    title="Copy address to clipboard">
                                    <i class="bi bi-clipboard"></i>
                                    <span id="copyBtnText">Copy</span>
                                </button>
                            ` : ''}
                        </div>
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <div>
                            <h4>County</h4>
                            <p>${job.county || 'N/A'}</p>
                        </div>
                    </div>
                    
                    ${job.notes ? `
                    <div style="margin-bottom: 20px;">
                        <h4>Notes</h4>
                        <p>${job.notes}</p>
                    </div>
                    ` : ''}
                    
                    <!-- Statistics section commented out
                    <div style="border-top: 1px solid #ddd; padding-top: 20px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px;">
                        <div>
                            <small style="color: #666;">Visits</small>
                            <p style="font-weight: bold; margin: 0;">${job.visited || 0}</p>
                        </div>
                        <div>
                            <small style="color: #666;">Total Time</small>
                            <p style="font-weight: bold; margin: 0;">${Number(job.total_time_spent || 0).toFixed(2)} hours</p>
                        </div>
                        <div>
                            <small style="color: #666;">Created</small>
                            <p style="font-weight: bold; margin: 0;">${job.created_at ? new Date(job.created_at).toLocaleDateString() : 'N/A'}</p>
                        </div>
                    </div>
                    -->
                    
                    <button style="margin-top: 20px; padding: 10px 20px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;" onclick="SimpleModal.hide()">Close</button>
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
