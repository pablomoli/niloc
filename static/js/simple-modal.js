// Simple modal handler without Alpine
// In-memory Tag cache for the map session
window.TagCache = {
    items: [],
    loaded: false,
    async loadOnce() {
        if (this.loaded && Array.isArray(this.items) && this.items.length) return this.items;
        try {
            const fetcher = window.cachedFetch || window.fetch;
            const resp = await fetcher('/api/tags', {}, { ttl: 120_000 });
            this.items = await resp.json();
        } catch (_) {
            this.items = [];
        }
        this.loaded = true;
        return this.items;
    },
    invalidate() {
        this.loaded = false;
        if (window.ApiCache && typeof window.ApiCache.invalidateMatching === 'function') {
            window.ApiCache.invalidateMatching('/api/tags');
        }
    },
    add(tag) { if (tag && tag.id && !this.items.find(t => t.id === tag.id)) this.items.push(tag); }
};
window.SimpleModal = {
    currentJob: null,
    fieldworkData: [],
    fieldworkLoaded: false,
    allTags: [],
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
                } else if (field === 'due_date') {
                    const input = document.getElementById('due_date-input');
                    if (input) input.value = this.currentJob.due_date || '';
                } else if (field === 'address') {
                    const input = document.getElementById('address-input');
                    if (input) input.value = this.currentJob.address || '';
                } else if (field === 'notes') {
                    const textarea = document.getElementById('notes-input');
                    if (textarea) textarea.value = this.currentJob.notes || '';
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
                } else if (field === 'due_date') {
                    const input = document.getElementById('due_date-input');
                    if (input) {
                        input.focus();
                    }
                } else if (field === 'address') {
                    const input = document.getElementById('address-input');
                    if (input) {
                        input.focus();
                        input.select();
                    }
                } else if (field === 'notes') {
                    const textarea = document.getElementById('notes-input');
                    if (textarea) {
                        setTimeout(() => {
                            textarea.focus();
                            // Move cursor to end
                            if (textarea.value) {
                                textarea.setSelectionRange(textarea.value.length, textarea.value.length);
                            }
                        }, 50);
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
        } else if (field === 'due_date') {
            const input = document.getElementById('due_date-input');
            newValue = input ? input.value : null;
        } else if (field === 'address') {
            const input = document.getElementById('address-input');
            newValue = input ? input.value.trim() : null;
        } else if (field === 'notes') {
            const textarea = document.getElementById('notes-input');
            newValue = textarea ? textarea.value.trim() : null;
            // Notes can be empty, so we allow null/empty string
        }
        
        if (field !== 'notes' && field !== 'due_date' && !newValue) {
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
                } else if (field === 'due_date') {
                    const dueDateText = document.getElementById('due_date-view-text');
                    const updatedDueDate = (data.job && data.job.due_date !== undefined)
                        ? data.job.due_date
                        : newValue;
                    if (dueDateText) {
                        dueDateText.textContent = updatedDueDate || 'None';
                    }
                } else if (field === 'client') {
                    const clientText = document.getElementById('client-view-text');
                    if (clientText) {
                        clientText.textContent = newValue;
                    }
                } else if (field === 'address') {
                    const addrText = document.getElementById('address-view-text');
                    const copyBtn = document.getElementById('copyAddressBtn');
                    // Update using formatted address if returned
                    const updatedAddr = (data.job && data.job.address) ? data.job.address : newValue;
                    if (addrText) addrText.textContent = updatedAddr;
                    if (copyBtn) {
                        copyBtn.setAttribute('onclick', `SimpleModal.copyAddress('${(updatedAddr || '').replace(/'/g, "\\'")}')`);
                    }
                    // Update county if returned
                    if (data.job && data.job.county) {
                        const countyEl = document.getElementById('county-view-text');
                        if (countyEl) countyEl.textContent = `${data.job.county} County`;
                    }
                } else if (field === 'notes') {
                    const viewText = document.getElementById('notes-view-text');
                    const viewDiv = document.getElementById('notes-view');
                    if (viewText) {
                        viewText.textContent = newValue || 'No notes';
                    }
                    // Show/hide view div based on whether notes exist
                    if (viewDiv) {
                        viewDiv.style.display = newValue ? 'block' : 'none';
                    }
                    // Update current job notes
                    this.currentJob.notes = newValue || null;
                }
                
                // Exit edit mode
                if (window.ApiCache && typeof window.ApiCache.invalidateMatching === 'function') {
                    window.ApiCache.invalidateMatching('/api/jobs');
                    window.ApiCache.invalidateMatching('/admin/api/dashboard');
                }

                this.toggleEdit(field);
                
                // Show success feedback
                this.showNotification(`${field.charAt(0).toUpperCase() + field.slice(1)} updated successfully`, 'success');
                
                // Update marker on map if status or address changed
                if ((field === 'status' || field === 'address') && window.updateJobMarker) {
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
        this.currentJob = { ...job };
        this.fieldworkLoaded = false;
        const femaLink = this.generateFEMALink(job.address);
        // Render immediately with placeholders
        this.renderModal(job, femaLink);
        // Warm tags cache
        this.fetchAllTags();
        // Load fieldwork and refresh section
        this.fetchFieldworkData(job.job_number).then(() => {
            this.fieldworkLoaded = true;
            this.refreshFieldworkDisplay();
            this.updateTotalTimeDisplay();
        });
    },

    // Generate fieldwork entries HTML
    generateFieldworkHTML() {
        if (!this.fieldworkLoaded) {
            return `
                <div class="text-center py-4 text-gray-400">
                    <i class="bi bi-hourglass-split"></i> Loading fieldwork...
                </div>
            `;
        }
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

    // Generate tags HTML (read-only chips)
    generateTagsHTML(job) {
        try {
            const tags = Array.isArray(job?.tags) ? job.tags : [];
            if (!tags.length) return '<span class="text-gray-500">None</span>';
            const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
            return tags.map(t => `
                <span class="badge border-2" style="border-color:${t.color||'#007bff'}; color:${t.color||'#007bff'}">
                    ${esc(t.name)}
                    <button class="ml-1 text-xs" onclick="SimpleModal.removeTag(${t.id})" title="Remove">✕</button>
                </span>
            `).join('');
        } catch (_) {
            return '<span class="text-gray-500">None</span>';
        }
    },

    // Fetch all tags for suggestions
    async fetchAllTags() {
        try {
            const items = await window.TagCache.loadOnce();
            this.allTags = items || [];
        } catch (_) { this.allTags = []; }
    },

    // Add tag to the current job by name (create allowed only for admin via backend)
    async addTag() {
        const input = document.getElementById('modal-tag-input');
        if (!input) return;
        const name = (input.value || '').trim();
        if (!name) return;
        const existing = (this.allTags || []).find(t => (t.name||'').toLowerCase() === name.toLowerCase());
        let payload;
        if (existing) {
            payload = { tag_id: existing.id };
        } else {
            // attempt create (admin only)
            payload = { name };
        }
        try {
            const resp = await fetch(`/api/jobs/${this.currentJob.job_number}/tags`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error || 'Failed to add tag');
            // Update job tags in modal and AppState
            this.currentJob.tags = data.tags || [];
            this.updateTagsSection();
            if (window.AppState) {
                const idx = window.AppState.allJobs.findIndex(j => j.job_number === this.currentJob.job_number);
                if (idx !== -1) window.AppState.allJobs[idx].tags = this.currentJob.tags;
                const idx2 = window.AppState.filteredJobs.findIndex(j => j.job_number === this.currentJob.job_number);
                if (idx2 !== -1) window.AppState.filteredJobs[idx2].tags = this.currentJob.tags;
            }
            input.value = '';
            // refresh tags cache if a new tag got created
            if (!existing) { window.TagCache.invalidate(); this.fetchAllTags(); }
            if (window.ApiCache && typeof window.ApiCache.invalidateMatching === 'function') {
                window.ApiCache.invalidateMatching('/api/jobs');
                window.ApiCache.invalidateMatching('/api/tags');
            }
            this.showNotification('Tag added', 'success');
        } catch (e) {
            this.showNotification(e.message || 'Failed to add tag', 'error');
        }
    },

    // Add an existing tag by id (from suggestions)
    async addExistingTag(tagId) {
        try {
            const resp = await fetch(`/api/jobs/${this.currentJob.job_number}/tags`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tag_id: tagId })
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error || 'Failed to add tag');
            this.currentJob.tags = data.tags || [];
            this.updateTagsSection();
            if (window.AppState) {
                const idx = window.AppState.allJobs.findIndex(j => j.job_number === this.currentJob.job_number);
                if (idx !== -1) window.AppState.allJobs[idx].tags = this.currentJob.tags;
                const idx2 = window.AppState.filteredJobs.findIndex(j => j.job_number === this.currentJob.job_number);
                if (idx2 !== -1) window.AppState.filteredJobs[idx2].tags = this.currentJob.tags;
            }
            const input = document.getElementById('modal-tag-input');
            if (input) input.value = '';
            this.updateTagSuggestions();
            if (window.ApiCache && typeof window.ApiCache.invalidateMatching === 'function') {
                window.ApiCache.invalidateMatching('/api/jobs');
                window.ApiCache.invalidateMatching('/api/tags');
            }
            this.showNotification('Tag added', 'success');
        } catch (e) {
            this.showNotification(e.message || 'Failed to add tag', 'error');
        }
    },

    // Update dropdown suggestions as user types
    updateTagSuggestions() {
        const input = document.getElementById('modal-tag-input');
        const panel = document.getElementById('modal-tag-suggestions');
        if (!input || !panel) return;
        const q = (input.value || '').toLowerCase().trim();
        const assigned = new Set((Array.isArray(this.currentJob.tags) ? this.currentJob.tags : []).map(t => t.id));
        if (!q) { panel.innerHTML = ''; panel.style.display = 'none'; return; }
        const matches = (this.allTags || [])
            .filter(t => !assigned.has(t.id) && (t.name || '').toLowerCase().includes(q))
            .slice(0, 8);
        if (matches.length === 0) { panel.innerHTML = ''; panel.style.display = 'none'; return; }
        panel.innerHTML = matches.map(t => `
            <button class="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2" onclick="SimpleModal.addExistingTag(${t.id})">
                <span class="badge badge-ghost" style="color:${t.color||'#007bff'}; border-color:${t.color||'#007bff'}">${(t.name||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}</span>
            </button>
        `).join('');
        panel.style.display = 'block';
    },

    hideTagSuggestions() {
        const panel = document.getElementById('modal-tag-suggestions');
        if (panel) { panel.innerHTML = ''; panel.style.display = 'none'; }
    },

    async removeTag(tagId) {
        try {
            const resp = await fetch(`/api/jobs/${this.currentJob.job_number}/tags/${tagId}`, { method: 'DELETE' });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error || 'Failed to remove tag');
            this.currentJob.tags = data.tags || (this.currentJob.tags || []).filter(t => t.id !== tagId);
            this.updateTagsSection();
            if (window.AppState) {
                const idx = window.AppState.allJobs.findIndex(j => j.job_number === this.currentJob.job_number);
                if (idx !== -1) window.AppState.allJobs[idx].tags = this.currentJob.tags;
                const idx2 = window.AppState.filteredJobs.findIndex(j => j.job_number === this.currentJob.job_number);
                if (idx2 !== -1) window.AppState.filteredJobs[idx2].tags = this.currentJob.tags;
            }
            window.TagCache.invalidate();
            if (window.ApiCache && typeof window.ApiCache.invalidateMatching === 'function') {
                window.ApiCache.invalidateMatching('/api/jobs');
                window.ApiCache.invalidateMatching('/api/tags');
            }
            this.showNotification('Tag removed', 'success');
        } catch (e) {
            this.showNotification(e.message || 'Failed to remove tag', 'error');
        }
    },

    updateTagsSection() {
        const container = document.getElementById('modal-tags-container');
        if (container) container.innerHTML = this.generateTagsHTML(this.currentJob);
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
                <div id="simpleJobModalContent" class="bg-white rounded-lg shadow-2xl p-6 w-11/12 max-w-lg relative max-h-[90vh] overflow-y-auto border border-gray-100">
                    <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2 hover:bg-gray-100 transition-colors" onclick="SimpleModal.hide()" aria-label="Close modal">✕</button>
                    
                    <!-- Header Section -->
                    <div class="mb-6 pb-4 border-b border-gray-200">
                        <h3 class="font-bold text-xl mb-3 text-gray-900">
                            <span class="font-mono text-primary">Job #${job.job_number || 'N/A'}</span>
                        </h3>
                        ${job.is_parcel_job ? `
                        <div class="mb-3">
                            <button class="btn btn-sm btn-primary" onclick="SimpleModal.openPromotion('${job.job_number}')" title="Upgrade to address job"> 
                                <i class="bi bi-arrow-up-right-square mr-1"></i>
                                Upgrade
                            </button>
                            <p class="text-xs text-gray-500 mt-1">Requires an address to replace parcel location.</p>
                        </div>
                        ` : ''}
                        
                        <!-- Status and Total Time - Improved Layout -->
                        <div class="flex justify-between items-center gap-4">
                            <div class="flex-1">
                                <label class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Status</label>
                                <div id="status-view" style="display: block;">
                                    <div class="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-semibold cursor-pointer hover:opacity-90 transition-all shadow-sm" 
                                         id="status-badge"
                                         style="background: ${window.MarkerUtils?.EPIC_COLORS[job.status] || '#6c757d'};"
                                         onclick="SimpleModal.toggleEdit('status')"
                                         title="Click to edit">
                                        <span id="status-view-text">${window.MarkerUtils?.STATUS_NAMES[job.status] || job.status || 'Unknown Status'}</span>
                                        <i class="bi bi-pencil-square ml-1 text-xs opacity-75"></i>
                                    </div>
                                </div>
                                <div id="status-edit" style="display: none;" class="flex items-center gap-2 mt-2">
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
                            
                            <div class="text-right flex-shrink-0">
                                <label class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Total Time</label>
                                <div id="total-time-badge" class="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-sm font-semibold shadow-sm" 
                                     style="background: linear-gradient(135deg, #FF1393 0%, #e0117f 100%);">
                                    <i class="bi bi-clock-history text-xs"></i>
                                    <span>${this.formatDuration(this.getTotalFieldworkTime())}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="space-y-5">
                        <!-- Tags Section - Enhanced -->
                        <div class="bg-gray-50 rounded-lg p-4 border border-gray-100">
                            <label class="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 block">Tags</label>
                            <div id="modal-tags-container" class="flex flex-wrap gap-2 mb-3 min-h-[24px]">${this.generateTagsHTML(job)}</div>
                            <div class="relative">
                                <div class="flex gap-2 items-center">
                                    <input id="modal-tag-input" class="input input-bordered input-sm flex-1 bg-white" placeholder="Type to search tags..." 
                                           oninput="SimpleModal.updateTagSuggestions()" onfocus="SimpleModal.updateTagSuggestions()" onkeydown="if(event.key==='Enter') SimpleModal.addTag()">
                                    <button class="btn btn-sm btn-primary" onclick="SimpleModal.addTag()">
                                        <i class="bi bi-plus-lg"></i>
                                    </button>
                                </div>
                                <div id="modal-tag-suggestions" class="absolute z-20 mt-1 w-full bg-white rounded-lg border border-gray-200 shadow-lg" style="display:none;"></div>
                            </div>
                        </div>
                        
                        <!-- Client Section - Enhanced -->
                        <div>
                            <label class="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 block">Client</label>
                            <div id="client-view" style="display: block;">
                                <div class="flex items-center justify-between group">
                                    <p class="text-gray-900 font-medium cursor-pointer hover:text-primary transition-colors px-3 py-2 rounded-lg hover:bg-gray-50 -mx-3 -my-2" 
                                       onclick="SimpleModal.toggleEdit('client')"
                                       title="Click to edit">
                                        <span id="client-view-text">${job.client || 'N/A'}</span>
                                    </p>
                                    <button class="opacity-0 group-hover:opacity-100 transition-opacity btn btn-xs btn-ghost" onclick="SimpleModal.toggleEdit('client')" title="Edit client">
                                        <i class="bi bi-pencil-square text-gray-400"></i>
                                    </button>
                                </div>
                            </div>
                            <div id="client-edit" style="display: none;" class="flex items-center gap-2 mt-2">
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

                        <!-- Due Date Section - Enhanced -->
                        <div>
                            <label class="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 block">Due Date</label>
                            <div id="due_date-view" style="display: block;">
                                <div class="flex items-center justify-between group">
                                    <p class="text-gray-900 font-medium cursor-pointer hover:text-primary transition-colors px-3 py-2 rounded-lg hover:bg-gray-50 -mx-3 -my-2"
                                       onclick="SimpleModal.toggleEdit('due_date')"
                                       title="Click to edit">
                                        <span id="due_date-view-text">${job.due_date || 'None'}</span>
                                    </p>
                                    <button class="opacity-0 group-hover:opacity-100 transition-opacity btn btn-xs btn-ghost" onclick="SimpleModal.toggleEdit('due_date')" title="Edit due date">
                                        <i class="bi bi-pencil-square text-gray-400"></i>
                                    </button>
                                </div>
                            </div>
                            <div id="due_date-edit" style="display: none;" class="flex items-center gap-2 mt-2">
                                <input type="date"
                                       id="due_date-input"
                                       class="input input-bordered input-sm flex-1"
                                       value="${job.due_date || ''}"
                                       onkeypress="if(event.key === 'Enter') SimpleModal.saveField('due_date')"
                                       onkeydown="if(event.key === 'Escape') SimpleModal.toggleEdit('due_date')">
                                <button class="btn btn-sm btn-success" onclick="SimpleModal.saveField('due_date')">
                                    <i class="bi bi-check-lg"></i>
                                </button>
                                <button class="btn btn-sm btn-ghost" onclick="SimpleModal.toggleEdit('due_date')">
                                    <i class="bi bi-x-lg"></i>
                                </button>
                            </div>
                        </div>
                        
                        <!-- Address Section - Enhanced -->
                        <div class="bg-blue-50 rounded-lg p-4 border border-blue-100">
                            <label class="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 block">Location</label>
                            <div id="address-view" style="display: block;">
                                <div class="flex items-start gap-3">
                                    <div class="flex-1">
                                        <p id="address-view-text" class="text-gray-900 font-medium leading-relaxed cursor-pointer hover:text-primary transition-colors px-3 py-2 rounded-lg hover:bg-white -mx-3 -my-2" 
                                           onclick="SimpleModal.toggleEdit('address')" 
                                           title="Click to edit">
                                            ${job.address || 'N/A'}
                                        </p>
                                        <div class="mt-2">
                                            <span id="county-view-text" class="text-xs text-gray-500 font-medium">${job.county || 'N/A'} County</span>
                                        </div>
                                    </div>
                                    ${job.address && job.address !== 'N/A' ? `
                                        <button 
                                            id="copyAddressBtn"
                                            onclick="SimpleModal.copyAddress('${job.address.replace(/'/g, "\\'")}')" 
                                            class="btn btn-sm btn-primary flex-shrink-0"
                                            title="Copy address to clipboard">
                                            <i class="bi bi-clipboard mr-1"></i>
                                            <span id="copyBtnText">Copy</span>
                                        </button>
                                    ` : ''}
                                </div>
                            </div>
                            <div id="address-edit" style="display: none;" class="flex items-center gap-2 mt-2">
                                <input type="text" id="address-input" class="input input-bordered input-sm flex-1" value="${(job.address || '').replace(/"/g,'&quot;') }" onkeypress="if(event.key==='Enter') SimpleModal.saveField('address')" onkeydown="if(event.key==='Escape') SimpleModal.toggleEdit('address')">
                                <button class="btn btn-sm btn-success" onclick="SimpleModal.saveField('address')">
                                    <i class="bi bi-check-lg"></i>
                                </button>
                                <button class="btn btn-sm btn-ghost" onclick="SimpleModal.toggleEdit('address')">
                                    <i class="bi bi-x-lg"></i>
                                </button>
                            </div>
                        </div>
                        
                        ${femaLink ? `
                        <div>
                            <button 
                                onclick="window.open('${femaLink}', '_blank')" 
                                class="btn btn-sm btn-outline-primary w-full justify-center"
                                title="View FEMA Flood Zone">
                                <i class="bi bi-water mr-2"></i>
                                <span>View FEMA Flood Zone Map</span>
                                <i class="bi bi-box-arrow-up-right ml-2 text-xs"></i>
                            </button>
                        </div>
                        ` : ''}
                        
                        <!-- Notes Section - Enhanced -->
                        <div>
                            <label class="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 block">Notes</label>
                            <div id="notes-view" style="display: ${job.notes ? 'block' : 'none'};">
                                <div class="bg-gray-50 rounded-lg p-3 border border-gray-200">
                                    <p class="text-gray-700 leading-relaxed cursor-pointer hover:text-primary transition-colors group" 
                                       onclick="SimpleModal.toggleEdit('notes')"
                                       title="Click to edit">
                                        <span id="notes-view-text">${job.notes || 'No notes'}</span>
                                        <i class="bi bi-pencil-square ml-2 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" style="font-size: 12px;"></i>
                                    </p>
                                </div>
                            </div>
                            <div id="notes-edit" style="display: none;" class="flex flex-col gap-2 mt-2">
                                <textarea id="notes-input" 
                                       class="textarea textarea-bordered textarea-sm w-full" 
                                       rows="4"
                                       placeholder="Add notes about this job..."
                                       onkeydown="if(event.key === 'Escape') SimpleModal.toggleEdit('notes')">${job.notes || ''}</textarea>
                                <div class="flex items-center gap-2">
                                    <button class="btn btn-sm btn-success" onclick="SimpleModal.saveField('notes')">
                                        <i class="bi bi-check-lg"></i> Save
                                    </button>
                                    <button class="btn btn-sm btn-ghost" onclick="SimpleModal.toggleEdit('notes')">
                                        <i class="bi bi-x-lg"></i> Cancel
                                    </button>
                                </div>
                            </div>
                            ${!job.notes ? `
                            <button class="btn btn-sm btn-outline-primary w-full mt-2" onclick="SimpleModal.toggleEdit('notes')" title="Add notes">
                                <i class="bi bi-plus-circle mr-1"></i> Add Notes
                            </button>
                            ` : ''}
                        </div>
                        
                        <!-- Time Tracking Section - Enhanced -->
                        <div class="bg-gray-50 rounded-lg p-4 border border-gray-100">
                            <div class="flex items-center justify-between mb-3">
                                <label class="text-xs font-semibold text-gray-600 uppercase tracking-wide">Time Tracking</label>
                                <button class="btn btn-sm btn-primary" onclick="SimpleModal.showAddFieldworkForm()" title="Add time entry">
                                    <i class="bi bi-plus-circle mr-1"></i>
                                    Add Entry
                                </button>
                            </div>
                            <div id="fieldwork-list" class="space-y-2">
                                ${this.generateFieldworkHTML()}
                            </div>
                        </div>
                    </div>
                    
                    <div class="flex justify-end mt-8 pt-4 border-t border-gray-200">
                        <button class="btn btn-primary px-8" onclick="SimpleModal.hide()">Close</button>
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

                <!-- Promotion Modal (Upgrade) -->
                <div id="promotion-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center hidden" style="z-index: 2002;">
                    <div class="bg-white rounded-lg shadow-xl p-6 w-11/12 max-w-md relative">
                        <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" onclick="SimpleModal.closePromotion()">✕</button>
                        <h3 class="font-bold text-lg mb-4 text-primary">Upgrade to Address Job</h3>
                        <div class="mb-3">
                            <label class="block text-gray-600 text-sm font-medium mb-2">Address *</label>
                            <input type="text" id="promotion-address-input" class="input input-bordered w-full" placeholder="Enter full address" />
                        </div>
                        <div class="flex justify-end space-x-3 mt-2">
                            <button type="button" class="btn btn-ghost" onclick="SimpleModal.closePromotion()">Cancel</button>
                            <button type="button" class="btn btn-primary" onclick="SimpleModal.submitPromotion()">Upgrade</button>
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
    
    // Open in-app promotion modal
    openPromotion(jobNumber) {
        this._promotionJobNumber = jobNumber;
        const modal = document.getElementById('promotion-modal');
        const input = document.getElementById('promotion-address-input');
        if (modal) modal.classList.remove('hidden');
        if (input) { input.value = ''; setTimeout(() => input.focus(), 50); }
    },
    closePromotion() {
        const modal = document.getElementById('promotion-modal');
        if (modal) modal.classList.add('hidden');
    },
    async submitPromotion() {
        const input = document.getElementById('promotion-address-input');
        const address = (input?.value || '').trim();
        if (!address) {
            this.showNotification('Address is required to upgrade this job', 'error');
            return;
        }
        await this.promoteToAddress(this._promotionJobNumber, address);
        this.closePromotion();
    },
    
    async promoteToAddress(jobNumber, address) {
        try {
            const response = await fetch(`/api/jobs/${jobNumber}/promote-to-address`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address })
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error || 'Failed to promote job');
            }
            const data = await response.json();
            // Update current job data
            this.currentJob.is_parcel_job = false;
            if (address) this.currentJob.address = address;
            this.renderModal(this.currentJob, this.generateFEMALink(this.currentJob.address));
            this.showNotification('Job promoted to address job successfully', 'success');
            // Update job in global state if available
            if (window.AppState && window.AppState.allJobs) {
                const idx = window.AppState.allJobs.findIndex(j => j.job_number === jobNumber);
                if (idx !== -1) {
                    window.AppState.allJobs[idx].is_parcel_job = false;
                    window.AppState.allJobs[idx].address = address;
                }
            }
            if (window.ApiCache && typeof window.ApiCache.invalidateMatching === 'function') {
                window.ApiCache.invalidateMatching('/api/jobs');
                window.ApiCache.invalidateMatching('/admin/api/dashboard');
            }
        } catch (error) {
            console.error('Promotion error:', error);
            this.showNotification(error.message || 'Failed to promote job', 'error');
        }
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
        
        const formHTML = `
            <div id="fieldwork-form" class="mt-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
                <h5 class="font-medium text-gray-800 mb-3">Add Time Entry</h5>
                
                <div class="grid grid-cols-1 gap-3">
                    <!-- Date and Total Time in 2 columns -->
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Work Date</label>
                            <input type="date" id="fw-work-date" class="input input-bordered input-md w-full" value="${today}" required>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Total Time (Hours:Minutes)</label>
                            <input type="text" id="fw-total-time" class="input input-bordered input-md w-full" placeholder="2:30" pattern="[0-9]+:[0-5][0-9]" required>
                            <p class="text-xs text-gray-500 mt-1">Format: H:MM (e.g., 2:30)</p>
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

    // Parse time input (HH:MM format) and validate
    parseTimeInput(timeStr) {
        if (!timeStr) return null;
        
        // Check if it's in HH:MM format
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
        
        // Try parsing as decimal hours
        const decimal = parseFloat(timeStr);
        return isNaN(decimal) ? null : decimal;
    },

    // Convert decimal hours to HH:MM format
    formatTimeInput(decimalHours) {
        if (!decimalHours || decimalHours === 0) return '0:00';
        const hours = Math.floor(decimalHours);
        const minutes = Math.round((decimalHours - hours) * 60);
        return `${hours}:${minutes.toString().padStart(2, '0')}`;
    },

    // Save new fieldwork entry
    async saveFieldwork() {
        const saveBtn = document.getElementById('fw-save-btn');
        const originalContent = saveBtn.innerHTML;
        
        // Get form values
        const workDate = document.getElementById('fw-work-date').value;
        const totalTime = document.getElementById('fw-total-time').value;
        const crew = document.getElementById('fw-crew').value.trim();
        const droneCard = document.getElementById('fw-drone-card').value.trim();
        const notes = document.getElementById('fw-notes').value.trim();
        
        // Validation
        if (!workDate || !totalTime) {
            this.showNotification('Please fill in all required fields', 'error');
            return;
        }
        
        // Validate time format
        const parsedTime = this.parseTimeInput(totalTime);
        if (parsedTime === null || parsedTime <= 0) {
            this.showNotification('Invalid time format. Use H:MM (e.g., 2:30)', 'error');
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
                    total_time: totalTime,
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
        
        // Convert total_time (decimal hours) to HH:MM format for display
        const timeDisplay = this.formatTimeInput(fieldwork.total_time);
        
        const formHTML = `
            <div id="edit-fieldwork-form" class="mt-4 p-4 border border-gray-200 rounded-lg bg-blue-50">
                <h5 class="font-medium text-gray-800 mb-3">Edit Time Entry</h5>
                
                <div class="grid grid-cols-1 gap-3">
                    <!-- Date and Total Time in 2 columns -->
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Work Date</label>
                            <input type="date" id="edit-fw-work-date" class="input input-bordered input-md w-full" value="${fieldwork.work_date}" required>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Total Time (Hours:Minutes)</label>
                            <input type="text" id="edit-fw-total-time" class="input input-bordered input-md w-full" value="${timeDisplay}" placeholder="2:30" pattern="[0-9]+:[0-5][0-9]" required>
                            <p class="text-xs text-gray-500 mt-1">Format: H:MM (e.g., 2:30)</p>
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

    // Save edited fieldwork entry
    async saveEditFieldwork(fieldworkId) {
        const saveBtn = document.getElementById('edit-fw-save-btn');
        const originalContent = saveBtn.innerHTML;
        
        // Get form values
        const workDate = document.getElementById('edit-fw-work-date').value;
        const totalTime = document.getElementById('edit-fw-total-time').value;
        const crew = document.getElementById('edit-fw-crew').value.trim();
        const droneCard = document.getElementById('edit-fw-drone-card').value.trim();
        const notes = document.getElementById('edit-fw-notes').value.trim();
        
        // Validation
        if (!workDate || !totalTime) {
            this.showNotification('Please fill in all required fields', 'error');
            return;
        }
        
        // Validate time format
        const parsedTime = this.parseTimeInput(totalTime);
        if (parsedTime === null || parsedTime <= 0) {
            this.showNotification('Invalid time format. Use H:MM (e.g., 2:30)', 'error');
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
                    total_time: totalTime,
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
