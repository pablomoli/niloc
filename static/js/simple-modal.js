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
                        <p>${job.address || 'N/A'}</p>
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
    }
};

// Make it globally available
window.openJobModal = SimpleModal.show;
window.closeJobModal = SimpleModal.hide;
