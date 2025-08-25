// Simple modal handler without Alpine
window.SimpleModal = {
    currentJob: null,
    
    // Generate FEMA Flood Zone link from address
    generateFEMALink(address) {
        if (!address || address === 'N/A') return null;
        const baseURL = "https://msc.fema.gov/portal/search";
        return `${baseURL}?AddressQuery=${encodeURIComponent(address)}`;
    },
    
    // Generate status dropdown options
    generateStatusOptions(currentStatus) {
        const statuses = window.MarkerUtils ? Object.keys(window.MarkerUtils.EPIC_COLORS) : [];
        return statuses.map(status => {
            const color = window.MarkerUtils.EPIC_COLORS[status];
            const selected = status === currentStatus ? 'selected' : '';
            return `<option value="${status}" ${selected} style="background-color: white;">
                ${status}
            </option>`;
        }).join('');
    },
    
    // Toggle edit mode for a field
    toggleEdit(field) {
        const viewElement = document.getElementById(`${field}-view`);
        const editElement = document.getElementById(`${field}-edit`);
        
        if (viewElement && editElement) {
            const isEditing = editElement.style.display !== 'none';
            
            if (isEditing) {
                // Cancel edit
                viewElement.style.display = 'block';
                editElement.style.display = 'none';
                
                // Reset values
                if (field === 'status') {
                    const select = document.getElementById('status-select');
                    if (select) select.value = this.currentJob.status;
                } else if (field === 'client') {
                    const input = document.getElementById('client-input');
                    if (input) input.value = this.currentJob.client;
                }
            } else {
                // Enter edit mode
                viewElement.style.display = 'none';
                editElement.style.display = 'block';
                
                // Focus input
                if (field === 'client') {
                    const input = document.getElementById('client-input');
                    if (input) {
                        input.focus();
                        input.select();
                    }
                }
            }
        }
    },
    
    // Save field update
    async saveField(field) {
        let newValue;
        let endpoint = `/api/jobs/${this.currentJob.job_number}`;
        
        // Get the new value
        if (field === 'status') {
            const select = document.getElementById('status-select');
            newValue = select ? select.value : null;
        } else if (field === 'client') {
            const input = document.getElementById('client-input');
            newValue = input ? input.value.trim() : null;
        }
        
        if (!newValue) {
            this.showNotification('Value cannot be empty', 'error');
            return;
        }
        
        // Show loading state
        const saveBtn = document.querySelector(`#${field}-edit .btn-success`);
        const originalContent = saveBtn ? saveBtn.innerHTML : '';
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="bi bi-hourglass-split"></i>';
        }
        
        try {
            const response = await fetch(endpoint, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ [field]: newValue })
            });
            
            if (response.ok) {
                const data = await response.json();
                
                // Update current job data
                this.currentJob[field] = newValue;
                
                // Update the job in AppState cache if available
                if (window.AppState) {
                    // Update in allJobs
                    const allJobsIndex = window.AppState.allJobs.findIndex(j => j.job_number === this.currentJob.job_number);
                    if (allJobsIndex !== -1) {
                        // Use the full updated job from the response if available
                        if (data.job) {
                            window.AppState.allJobs[allJobsIndex] = data.job;
                            this.currentJob = { ...data.job }; // Update modal's current job with full data
                        } else {
                            window.AppState.allJobs[allJobsIndex][field] = newValue;
                        }
                    }
                    
                    // Update in filteredJobs
                    const filteredIndex = window.AppState.filteredJobs.findIndex(j => j.job_number === this.currentJob.job_number);
                    if (filteredIndex !== -1) {
                        if (data.job) {
                            window.AppState.filteredJobs[filteredIndex] = data.job;
                        } else {
                            window.AppState.filteredJobs[filteredIndex][field] = newValue;
                        }
                    }
                }
                
                // Update view
                if (field === 'status') {
                    const statusBadge = document.getElementById('status-badge');
                    const statusText = document.getElementById('status-view-text');
                    if (statusBadge) {
                        const color = window.MarkerUtils?.EPIC_COLORS[newValue] || '#6c757d';
                        statusBadge.style.background = color;
                        statusBadge.textContent = newValue;
                    }
                    if (statusText) {
                        statusText.textContent = newValue;
                    }
                } else if (field === 'client') {
                    const clientText = document.getElementById('client-view-text');
                    if (clientText) {
                        clientText.textContent = newValue;
                    }
                }
                
                // Exit edit mode
                this.toggleEdit(field);
                
                // Show success feedback
                this.showNotification(`${field.charAt(0).toUpperCase() + field.slice(1)} updated successfully`, 'success');
                
                // Update marker on map if status changed
                if (field === 'status' && window.updateJobMarker) {
                    // Pass the full updated job data if available
                    const jobToUpdate = data.job || this.currentJob;
                    window.updateJobMarker(this.currentJob.job_number, jobToUpdate);
                }
                
            } else {
                const error = await response.json();
                throw new Error(error.error || 'Update failed');
            }
        } catch (error) {
            console.error(`Failed to update ${field}:`, error);
            this.showNotification(`Failed to update ${field}: ${error.message}`, 'error');
        } finally {
            // Restore button
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = originalContent;
            }
        }
    },
    
    show(job) {
        console.log('SimpleModal.show called with job:', job);
        this.currentJob = { ...job }; // Store a copy of the job data
        
        // Generate FEMA link if job has address
        const femaLink = this.generateFEMALink(job.address);
        
        // Create modal HTML with editable fields
        const modalHTML = `
            <div id="simpleJobModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center" style="z-index: 2000;">
                <!-- Backdrop -->
                <div class="absolute inset-0" onclick="SimpleModal.hide()"></div>
                
                <!-- Modal Content -->
                <div class="bg-white rounded-lg shadow-xl p-6 w-11/12 max-w-lg relative max-h-90vh overflow-y-auto">
                    <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" onclick="SimpleModal.hide()">✕</button>
                    
                    <h3 class="font-bold text-lg mb-2 text-primary">Job #${job.job_number || 'N/A'}</h3>
                    
                    <!-- Editable Status -->
                    <div class="mb-4">
                        <div id="status-view" style="display: block;">
                            <div class="inline-block px-3 py-1 rounded-full text-white text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity" 
                                 id="status-badge"
                                 style="background: ${window.MarkerUtils?.EPIC_COLORS[job.status] || '#6c757d'};"
                                 onclick="SimpleModal.toggleEdit('status')"
                                 title="Click to edit">
                                <span id="status-view-text">${job.status || 'Unknown Status'}</span>
                                <i class="bi bi-pencil-square ml-1" style="font-size: 10px;"></i>
                            </div>
                        </div>
                        <div id="status-edit" style="display: none;" class="flex items-center gap-2">
                            <select id="status-select" class="select select-bordered select-sm flex-1">
                                ${this.generateStatusOptions(job.status)}
                            </select>
                            <button class="btn btn-sm btn-success" onclick="SimpleModal.saveField('status')">
                                <i class="bi bi-check-lg"></i>
                            </button>
                            <button class="btn btn-sm btn-ghost" onclick="SimpleModal.toggleEdit('status')">
                                <i class="bi bi-x-lg"></i>
                            </button>
                        </div>
                    </div>
                    
                    <div class="space-y-4">
                        <!-- Editable Client -->
                        <div>
                            <h4 class="text-gray-400 text-sm font-medium mb-1">Client</h4>
                            <div id="client-view" style="display: block;">
                                <p class="text-gray-700 cursor-pointer hover:bg-gray-50 rounded px-2 py-1 -mx-2 -my-1 transition-colors" 
                                   onclick="SimpleModal.toggleEdit('client')"
                                   title="Click to edit">
                                    <span id="client-view-text">${job.client || 'N/A'}</span>
                                    <i class="bi bi-pencil-square ml-2 text-gray-400" style="font-size: 12px;"></i>
                                </p>
                            </div>
                            <div id="client-edit" style="display: none;" class="flex items-center gap-2">
                                <input type="text" 
                                       id="client-input" 
                                       class="input input-bordered input-sm flex-1" 
                                       value="${job.client || ''}"
                                       onkeypress="if(event.key === 'Enter') SimpleModal.saveField('client')"
                                       onkeydown="if(event.key === 'Escape') SimpleModal.toggleEdit('client')">
                                <button class="btn btn-sm btn-success" onclick="SimpleModal.saveField('client')">
                                    <i class="bi bi-check-lg"></i>
                                </button>
                                <button class="btn btn-sm btn-ghost" onclick="SimpleModal.toggleEdit('client')">
                                    <i class="bi bi-x-lg"></i>
                                </button>
                            </div>
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
                        
                        ${femaLink ? `
                        <div>
                            <h4 class="text-gray-400 text-sm font-medium mb-1">Flood Zone Information</h4>
                            <button 
                                onclick="window.open('${femaLink}', '_blank')" 
                                class="btn btn-sm btn-primary"
                                title="View FEMA Flood Zone">
                                <i class="bi bi-water mr-1"></i>
                                <span>View FEMA Flood Zone</span>
                            </button>
                        </div>
                        ` : ''}
                        
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
        
        // Add custom styles for status dropdown color indicators
        const styleElement = document.createElement('style');
        styleElement.id = 'status-dropdown-styles';
        styleElement.textContent = `
            #status-select option {
                padding: 8px;
                position: relative;
            }
            #status-select option:before {
                content: '●';
                margin-right: 8px;
            }
            ${Object.entries(window.MarkerUtils?.EPIC_COLORS || {}).map(([status, color]) => `
                #status-select option[value="${status}"]:before {
                    color: ${color};
                }
            `).join('')}
        `;
        
        // Remove existing styles if any
        const existingStyles = document.getElementById('status-dropdown-styles');
        if (existingStyles) {
            existingStyles.remove();
        }
        document.head.appendChild(styleElement);
        
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
