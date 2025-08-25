// Simple modal handler without Alpine
window.SimpleModal = {
    currentJob: null,
    fieldworkData: [],
    confirmModal: {
        title: '',
        message: '',
        callback: null
    },
    
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
    
    // Fetch fieldwork data for a job
    async fetchFieldworkData(jobNumber) {
        try {
            const response = await fetch(`/api/jobs/${jobNumber}/fieldwork`);
            if (response.ok) {
                this.fieldworkData = await response.json();
            } else {
                console.error('Failed to fetch fieldwork data');
                this.fieldworkData = [];
            }
        } catch (error) {
            console.error('Error fetching fieldwork data:', error);
            this.fieldworkData = [];
        }
    },

    show(job) {
        console.log('SimpleModal.show called with job:', job);
        this.currentJob = { ...job }; // Store a copy of the job data
        
        // Generate FEMA link if job has address
        const femaLink = this.generateFEMALink(job.address);
        
        // Fetch fieldwork data and render modal
        this.fetchFieldworkData(job.job_number).then(() => {
            this.renderModal(job, femaLink);
        });
    },

    // Generate fieldwork entries HTML
    generateFieldworkHTML() {
        if (this.fieldworkData.length === 0) {
            return `
                <div class="text-center py-4 text-gray-500">
                    <i class="bi bi-clock-history text-2xl mb-2"></i>
                    <p>No time entries recorded</p>
                </div>
            `;
        }

        return this.fieldworkData.map((fw, index) => `
            <div class="border border-gray-200 rounded-lg p-3 mb-2 hover:bg-gray-50 transition-colors">
                <div class="flex justify-between items-center">
                    <div class="flex-1">
                        <div class="font-medium text-gray-900">
                            ${index + 1}. ${this.formatDate(fw.work_date)} - ${this.formatDuration(fw.total_time)}
                        </div>
                    </div>
                    <div class="flex gap-1 ml-3">
                        <button class="btn btn-sm btn-ghost" onclick="SimpleModal.editFieldwork(${fw.id})" title="Edit entry">
                            <i class="bi bi-pencil"></i>
                        </button>
                        <button class="btn btn-sm btn-ghost text-red-600 hover:bg-red-50" onclick="SimpleModal.deleteFieldwork(${fw.id})" title="Delete entry">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    },

    // Calculate total time from start and end times
    calculateTotalTime(startTime, endTime) {
        if (!startTime || !endTime) return 0;
        
        const start = new Date(`1970-01-01T${startTime}:00`);
        const end = new Date(`1970-01-01T${endTime}:00`);
        
        // Handle overnight shifts
        if (end < start) {
            end.setDate(end.getDate() + 1);
        }
        
        const diffMs = end - start;
        const diffHours = diffMs / (1000 * 60 * 60);
        
        return Math.round(diffHours * 100) / 100; // Round to 2 decimal places
    },

    // Format date for display
    formatDate(dateString) {
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
    },

    // Format duration for display
    formatDuration(hours) {
        if (!hours || hours === 0) return '0.0h';
        return `${parseFloat(hours).toFixed(1)}h`;
    },

    // Calculate total time from all fieldwork entries
    getTotalFieldworkTime() {
        if (!this.fieldworkData || this.fieldworkData.length === 0) return 0;
        return this.fieldworkData.reduce((total, fw) => total + parseFloat(fw.total_time || 0), 0);
    },

    renderModal(job, femaLink) {
        // Create modal HTML with editable fields
        const modalHTML = `
            <div id="simpleJobModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center" style="z-index: 2000;">
                <!-- Backdrop -->
                <div class="absolute inset-0" onclick="SimpleModal.hide()"></div>
                
                <!-- Modal Content -->
                <div class="bg-white rounded-lg shadow-xl p-6 w-11/12 max-w-lg relative max-h-[90vh] overflow-y-auto">
                    <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" onclick="SimpleModal.hide()">✕</button>
                    
                    <h3 class="font-bold text-lg mb-2 text-primary">Job #${job.job_number || 'N/A'}</h3>
                    
                    <!-- Editable Status with Total Time -->
                    <div class="mb-4 flex justify-between items-start">
                        <div>
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
                        
                        <div class="text-right">
                            <h4 class="text-gray-400 text-xs font-medium mb-1">Total Time</h4>
                            <div id="total-time-badge" class="inline-block px-3 py-1 rounded-full text-white text-sm font-medium" 
                                 style="background-color: #FF1393;">
                                ${this.formatDuration(this.getTotalFieldworkTime())}
                            </div>
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
                        
                        <!-- Fieldwork Section -->
                        <div>
                            <div class="flex items-center justify-between mb-3">
                                <h4 class="text-gray-400 text-sm font-medium">Time Tracking</h4>
                                <button class="btn btn-sm btn-primary" onclick="SimpleModal.showAddFieldworkForm()" title="Add time entry">
                                    <i class="bi bi-plus-circle mr-1"></i>
                                    Add Entry
                                </button>
                            </div>
                            <div id="fieldwork-list">
                                ${this.generateFieldworkHTML()}
                            </div>
                        </div>
                    </div>
                    
                    <div class="flex justify-end mt-6">
                        <button class="px-6 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors" onclick="SimpleModal.hide()">Close</button>
                    </div>
                </div>
                
                <!-- Confirmation Modal -->
                <div id="fieldwork-confirm-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center hidden" style="z-index: 2001;">
                    <div class="bg-white rounded-lg shadow-xl p-6 w-11/12 max-w-md relative">
                        <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" onclick="SimpleModal.hideConfirmModal()">✕</button>
                        
                        <h3 id="confirm-title" class="font-bold text-lg mb-4 text-primary"></h3>
                        
                        <p id="confirm-message" class="mb-6"></p>
                        
                        <div class="flex justify-end space-x-3">
                            <button type="button" class="btn btn-ghost" onclick="SimpleModal.hideConfirmModal()">
                                Cancel
                            </button>
                            <button type="button" class="btn btn-error" onclick="SimpleModal.confirmAction()">
                                Delete
                            </button>
                        </div>
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

    // Show add fieldwork form
    showAddFieldworkForm() {
        const today = new Date().toISOString().split('T')[0];
        const currentTime = new Date().toTimeString().slice(0, 5);
        
        const formHTML = `
            <div id="fieldwork-form" class="mt-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
                <h5 class="font-medium text-gray-800 mb-3">Add Time Entry</h5>
                
                <div class="grid grid-cols-1 gap-3">
                    <!-- Date and Total Hours in 2 columns -->
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Work Date</label>
                            <input type="date" id="fw-work-date" class="input input-bordered input-md w-full" value="${today}" required>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Total Hours</label>
                            <input type="text" id="fw-total-time" class="input input-bordered input-md w-full bg-gray-100" readonly placeholder="0.00">
                        </div>
                    </div>
                    
                    <!-- Start and End Times -->
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                            <input type="time" id="fw-start-time" class="input input-bordered input-md w-full" onchange="SimpleModal.updateTotalTime()" required>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                            <input type="time" id="fw-end-time" class="input input-bordered input-md w-full" onchange="SimpleModal.updateTotalTime()" required>
                        </div>
                    </div>
                    
                    <!-- Crew and Drone Card - Stack on mobile -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Crew</label>
                            <input type="text" id="fw-crew" class="input input-bordered input-md w-full" placeholder="Optional">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Drone Card</label>
                            <input type="text" id="fw-drone-card" class="input input-bordered input-md w-full" placeholder="Optional">
                        </div>
                    </div>
                    
                    <!-- Notes -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                        <textarea id="fw-notes" class="textarea textarea-bordered w-full" placeholder="Optional notes" rows="2"></textarea>
                    </div>
                    
                    <div class="flex gap-2 pt-2">
                        <button id="fw-save-btn" class="btn btn-md btn-success flex-1" onclick="SimpleModal.saveFieldwork()">
                            <i class="bi bi-check-lg mr-1"></i>
                            Save Entry
                        </button>
                        <button class="btn btn-md btn-ghost" onclick="SimpleModal.hideAddFieldworkForm()">
                            <i class="bi bi-x-lg mr-1"></i>
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Find the time tracking section and add form
        const timeSection = document.querySelector('#fieldwork-list').parentElement;
        const existingForm = document.getElementById('fieldwork-form');
        
        if (existingForm) {
            existingForm.remove();
        }
        
        timeSection.insertAdjacentHTML('beforeend', formHTML);
    },

    // Hide add fieldwork form
    hideAddFieldworkForm() {
        const form = document.getElementById('fieldwork-form');
        if (form) {
            form.remove();
        }
    },

    // Update total time calculation
    updateTotalTime() {
        const startTime = document.getElementById('fw-start-time')?.value;
        const endTime = document.getElementById('fw-end-time')?.value;
        const totalTimeInput = document.getElementById('fw-total-time');
        
        if (startTime && endTime && totalTimeInput) {
            const totalHours = this.calculateTotalTime(startTime, endTime);
            totalTimeInput.value = totalHours.toFixed(2);
        }
    },

    // Save new fieldwork entry
    async saveFieldwork() {
        const saveBtn = document.getElementById('fw-save-btn');
        const originalContent = saveBtn.innerHTML;
        
        // Get form values
        const workDate = document.getElementById('fw-work-date').value;
        const startTime = document.getElementById('fw-start-time').value;
        const endTime = document.getElementById('fw-end-time').value;
        const totalTime = document.getElementById('fw-total-time').value;
        const crew = document.getElementById('fw-crew').value.trim();
        const droneCard = document.getElementById('fw-drone-card').value.trim();
        const notes = document.getElementById('fw-notes').value.trim();
        
        // Validation
        if (!workDate || !startTime || !endTime) {
            this.showNotification('Please fill in all required fields', 'error');
            return;
        }
        
        if (!totalTime || parseFloat(totalTime) <= 0) {
            this.showNotification('Invalid time range', 'error');
            return;
        }
        
        // Show loading
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Saving...';
        
        try {
            const response = await fetch(`/api/jobs/${this.currentJob.job_number}/fieldwork`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    work_date: workDate,
                    start_time: startTime,
                    end_time: endTime,
                    crew: crew || null,
                    drone_card: droneCard || null,
                    notes: notes || null
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                
                // Refresh fieldwork data and update display
                await this.fetchFieldworkData(this.currentJob.job_number);
                this.refreshFieldworkDisplay();
                
                // Hide form and show success
                this.hideAddFieldworkForm();
                this.showNotification('Time entry saved successfully', 'success');
                
            } else {
                const error = await response.json();
                throw new Error(error.error || 'Failed to save entry');
            }
        } catch (error) {
            console.error('Failed to save fieldwork:', error);
            this.showNotification(`Failed to save: ${error.message}`, 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalContent;
        }
    },

    // Refresh fieldwork display
    refreshFieldworkDisplay() {
        const fieldworkList = document.getElementById('fieldwork-list');
        if (fieldworkList) {
            fieldworkList.innerHTML = this.generateFieldworkHTML();
        }
        
        // Update total time display
        this.updateTotalTimeDisplay();
    },

    // Update total time display
    updateTotalTimeDisplay() {
        const totalTimeElement = document.getElementById('total-time-badge');
        if (totalTimeElement) {
            totalTimeElement.textContent = this.formatDuration(this.getTotalFieldworkTime());
        }
    },

    // Edit fieldwork entry
    editFieldwork(fieldworkId) {
        const fieldwork = this.fieldworkData.find(fw => fw.id === fieldworkId);
        if (!fieldwork) return;
        
        // Hide any existing forms
        this.hideAddFieldworkForm();
        this.hideEditFieldworkForm();
        
        const formHTML = `
            <div id="edit-fieldwork-form" class="mt-4 p-4 border border-gray-200 rounded-lg bg-blue-50">
                <h5 class="font-medium text-gray-800 mb-3">Edit Time Entry</h5>
                
                <div class="grid grid-cols-1 gap-3">
                    <!-- Date and Total Hours in 2 columns -->
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Work Date</label>
                            <input type="date" id="edit-fw-work-date" class="input input-bordered input-md w-full" value="${fieldwork.work_date}" required>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Total Hours</label>
                            <input type="text" id="edit-fw-total-time" class="input input-bordered input-md w-full bg-gray-100" readonly value="${fieldwork.total_time}">
                        </div>
                    </div>
                    
                    <!-- Start and End Times -->
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                            <input type="time" id="edit-fw-start-time" class="input input-bordered input-md w-full" value="${fieldwork.start_time}" onchange="SimpleModal.updateEditTotalTime()" required>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                            <input type="time" id="edit-fw-end-time" class="input input-bordered input-md w-full" value="${fieldwork.end_time}" onchange="SimpleModal.updateEditTotalTime()" required>
                        </div>
                    </div>
                    
                    <!-- Crew and Drone Card - Stack on mobile -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Crew</label>
                            <input type="text" id="edit-fw-crew" class="input input-bordered input-md w-full" value="${fieldwork.crew || ''}" placeholder="Optional">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Drone Card</label>
                            <input type="text" id="edit-fw-drone-card" class="input input-bordered input-md w-full" value="${fieldwork.drone_card || ''}" placeholder="Optional">
                        </div>
                    </div>
                    
                    <!-- Notes -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                        <textarea id="edit-fw-notes" class="textarea textarea-bordered w-full" placeholder="Optional notes" rows="2">${fieldwork.notes || ''}</textarea>
                    </div>
                    
                    <div class="flex gap-2 pt-2">
                        <button id="edit-fw-save-btn" class="btn btn-md btn-success flex-1" onclick="SimpleModal.saveEditFieldwork(${fieldworkId})">
                            <i class="bi bi-check-lg mr-1"></i>
                            Save Changes
                        </button>
                        <button class="btn btn-md btn-ghost" onclick="SimpleModal.hideEditFieldworkForm()">
                            <i class="bi bi-x-lg mr-1"></i>
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Find the time tracking section and add form
        const timeSection = document.querySelector('#fieldwork-list').parentElement;
        timeSection.insertAdjacentHTML('beforeend', formHTML);
    },

    // Hide edit fieldwork form
    hideEditFieldworkForm() {
        const form = document.getElementById('edit-fieldwork-form');
        if (form) {
            form.remove();
        }
    },

    // Update total time calculation for edit form
    updateEditTotalTime() {
        const startTime = document.getElementById('edit-fw-start-time')?.value;
        const endTime = document.getElementById('edit-fw-end-time')?.value;
        const totalTimeInput = document.getElementById('edit-fw-total-time');
        
        if (startTime && endTime && totalTimeInput) {
            const totalHours = this.calculateTotalTime(startTime, endTime);
            totalTimeInput.value = totalHours.toFixed(2);
        }
    },

    // Save edited fieldwork entry
    async saveEditFieldwork(fieldworkId) {
        const saveBtn = document.getElementById('edit-fw-save-btn');
        const originalContent = saveBtn.innerHTML;
        
        // Get form values
        const workDate = document.getElementById('edit-fw-work-date').value;
        const startTime = document.getElementById('edit-fw-start-time').value;
        const endTime = document.getElementById('edit-fw-end-time').value;
        const totalTime = document.getElementById('edit-fw-total-time').value;
        const crew = document.getElementById('edit-fw-crew').value.trim();
        const droneCard = document.getElementById('edit-fw-drone-card').value.trim();
        const notes = document.getElementById('edit-fw-notes').value.trim();
        
        // Validation
        if (!workDate || !startTime || !endTime) {
            this.showNotification('Please fill in all required fields', 'error');
            return;
        }
        
        if (!totalTime || parseFloat(totalTime) <= 0) {
            this.showNotification('Invalid time range', 'error');
            return;
        }
        
        // Show loading
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Saving...';
        
        try {
            const response = await fetch(`/api/fieldwork/${fieldworkId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    work_date: workDate,
                    start_time: startTime,
                    end_time: endTime,
                    crew: crew || null,
                    drone_card: droneCard || null,
                    notes: notes || null
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                
                // Refresh fieldwork data and update display
                await this.fetchFieldworkData(this.currentJob.job_number);
                this.refreshFieldworkDisplay();
                
                // Hide form and show success
                this.hideEditFieldworkForm();
                this.showNotification('Time entry updated successfully', 'success');
                
            } else {
                const error = await response.json();
                throw new Error(error.error || 'Failed to update entry');
            }
        } catch (error) {
            console.error('Failed to update fieldwork:', error);
            this.showNotification(`Failed to update: ${error.message}`, 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalContent;
        }
    },

    // Show confirmation modal
    showConfirm(title, message, callback) {
        this.confirmModal.title = title;
        this.confirmModal.message = message;
        this.confirmModal.callback = callback;
        
        // Update modal content
        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-message').textContent = message;
        
        // Show modal
        document.getElementById('fieldwork-confirm-modal').classList.remove('hidden');
    },

    // Hide confirmation modal
    hideConfirmModal() {
        document.getElementById('fieldwork-confirm-modal').classList.add('hidden');
        this.confirmModal.callback = null;
    },

    // Execute confirmed action
    confirmAction() {
        if (this.confirmModal.callback) {
            this.confirmModal.callback();
        }
        this.hideConfirmModal();
    },

    // Delete fieldwork entry with confirmation
    async deleteFieldwork(fieldworkId) {
        const fieldwork = this.fieldworkData.find(fw => fw.id === fieldworkId);
        if (!fieldwork) return;
        
        this.showConfirm(
            'Delete Time Entry',
            `Delete time entry for ${this.formatDate(fieldwork.work_date)}?\n\nThis action cannot be undone.`,
            async () => {
                try {
                    const response = await fetch(`/api/fieldwork/${fieldworkId}`, {
                        method: 'DELETE'
                    });
                    
                    if (response.ok) {
                        // Refresh fieldwork data and update display
                        await this.fetchFieldworkData(this.currentJob.job_number);
                        this.refreshFieldworkDisplay();
                        
                        this.showNotification('Time entry deleted successfully', 'success');
                        
                    } else {
                        const error = await response.json();
                        throw new Error(error.error || 'Failed to delete entry');
                    }
                } catch (error) {
                    console.error('Failed to delete fieldwork:', error);
                    this.showNotification(`Failed to delete: ${error.message}`, 'error');
                }
            }
        );
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
