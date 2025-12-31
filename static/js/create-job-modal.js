// Create Job Modal Handler
window.CreateJobModal = {
    _allTags: [],
    _selectedTagIds: new Set(),
    show(lat, lng, address) {
        console.log('CreateJobModal.show called with:', lat, lng, address);
        
        // Get available statuses from MarkerUtils (single source of truth)
        const statuses = window.MarkerUtils ? Object.keys(window.MarkerUtils.EPIC_COLORS) : [
            "On Hold/Pending Estimate",
            "Needs Fieldwork",
            "Fieldwork Complete",
            "To Be Printed",
            "Set/Flag Pins",
            "Survey Complete/Invoice Sent",
            "Completed/To be Filed",
            "Site Plan"
        ];
        
        // Create status options HTML
        const statusOptions = statuses.map(status => 
            `<option value="${status}">${window.MarkerUtils?.STATUS_NAMES[status] || status}</option>`
        ).join('');
        
        // Create modal HTML
        const modalHTML = `
            <div id="createJobModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center" style="z-index: 2000;">
                <!-- Backdrop -->
                <div class="absolute inset-0" onclick="CreateJobModal.hide()"></div>
                
                <!-- Modal Content -->
                <div class="bg-white rounded-lg shadow-xl p-6 w-11/12 max-w-lg relative max-h-[90vh] overflow-y-auto">
                    <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" onclick="CreateJobModal.hide()">✕</button>
                    
                    <h3 class="font-bold text-lg mb-4 text-primary">Create New Job</h3>
                    
                    <!-- Tab Navigation -->
                    <div class="flex bg-gray-100 rounded-lg p-1 mb-4">
                        <button type="button" id="addressTab" onclick="CreateJobModal.switchTab('address')" class="flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors bg-pink-500 text-white">
                            <i class="bi bi-geo-alt mr-1"></i> Address
                        </button>
                        <button type="button" id="parcelTab" onclick="CreateJobModal.switchTab('parcel')" class="flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors text-gray-700 hover:bg-gray-200">
                            <i class="bi bi-map mr-1"></i> Parcel ID
                        </button>
                    </div>
                    
                    <form id="createJobForm" onsubmit="CreateJobModal.submit(event); return false;" class="space-y-4">
                        <!-- Address Input Section -->
                        <div id="addressSection">
                            <label class="block text-gray-600 text-sm font-medium mb-2">Address *</label>
                            <input type="text" id="job_address_input" value="${address || ''}" required class="input input-bordered w-full" placeholder="Enter job address">
                        </div>
                        
                        <!-- Parcel Input Section (hidden by default) -->
                        <div id="parcelSection" style="display: none;">
                            <div class="mb-4">
                                <label class="block text-gray-600 text-sm font-medium mb-2">County *</label>
                                <select id="parcel_county" class="select select-bordered w-full" onchange="CreateJobModal.updateParcelInputs()">
                                    <option value="">Select County</option>
                                    <option value="brevard">Brevard County</option>
                                    <option value="orange">Orange County</option>
                                </select>
                            </div>
                            
                            <!-- Brevard County Inputs -->
                            <div id="brevardInputs" style="display: none;">
                                <div class="mb-3">
                                    <label class="block text-gray-600 text-sm font-medium mb-2">Tax Account Number *</label>
                                    <input type="text" id="brevard_tax_account" class="input input-bordered w-full" placeholder="Enter Tax Account Number">
                                </div>
                            </div>
                            
                            <!-- Orange County Inputs -->
                            <div id="orangeInputs" style="display: none;">
                                <div class="mb-3">
                                    <label class="block text-gray-600 text-sm font-medium mb-2">Parcel ID *</label>
                                    <input type="text" id="orange_parcel_id" class="input input-bordered w-full" placeholder="Format: XX-XX-XX-XXXX-XX-XXX">
                                    <small class="text-gray-400 text-xs block mt-1">Example: 13-23-32-7600-00-070</small>
                                </div>
                            </div>
                        </div>
                        
                        <div class="mb-4">
                            <label class="block text-gray-600 text-sm font-medium mb-2">Job Number *</label>
                            <input type="text" id="job_number" required class="input input-bordered w-full">
                        </div>
                        
                        <div class="mb-4">
                            <label class="block text-gray-600 text-sm font-medium mb-2">Client Name *</label>
                            <input type="text" id="job_client" required class="input input-bordered w-full">
                        </div>
                        
                        <div class="mb-4">
                            <label class="block text-gray-600 text-sm font-medium mb-2">Status *</label>
                            <select id="job_status" required class="select select-bordered w-full">
                                <option value="">Select Status</option>
                                ${statusOptions}
                            </select>
                        </div>

                        <div class="mb-4">
                            <label class="block text-gray-600 text-sm font-medium mb-2">Due Date</label>
                            <input type="date" id="job_due_date" class="input input-bordered w-full">
                        </div>
                        
                        <div class="mb-4">
                            <label class="block text-gray-600 text-sm font-medium mb-2">Notes</label>
                            <textarea id="job_notes" rows="3" class="textarea textarea-bordered w-full"></textarea>
                        </div>

                        <!-- Tags selection -->
                        <div class="mb-6">
                            <label class="block text-gray-600 text-sm font-medium mb-2">Tags</label>
                            <input id="job_tags_input" type="text" class="input input-bordered w-full mb-2" placeholder="Type to search existing tags" oninput="CreateJobModal.updateTagSuggestions()" />
                            <div id="job_tag_suggestions" class="bg-white border rounded-md shadow-sm divide-y max-h-40 overflow-auto hidden"></div>
                            <div id="job_selected_tags" class="flex flex-wrap gap-2 mt-2"></div>
                            <small class="text-gray-400">Only existing tags can be added here.</small>
                        </div>
                        
                        <div class="flex justify-end space-x-3">
                            <button type="button" class="btn btn-ghost" onclick="CreateJobModal.hide()">Cancel</button>
                            <button type="submit" class="btn btn-primary">
                                <i class="bi bi-plus-circle mr-1"></i> Create Job
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        
        // Remove any existing modal
        const existing = document.getElementById('createJobModal');
        if (existing) {
            existing.remove();
        }
        
        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        // Initialize tag state
        this._selectedTagIds = new Set();
        this.loadTagsOnce();
        
        // Prevent body scroll
        document.body.style.overflow = 'hidden';
        
        // Focus on address field if empty, otherwise job number
        setTimeout(() => {
            if (!address) {
                document.getElementById('job_address_input').focus();
            } else {
                document.getElementById('job_number').focus();
            }
        }, 100);
    },
    
    async loadTagsOnce() {
        try {
            const fetcher = window.cachedFetch || window.fetch;
            const resp = await fetcher('/api/tags', {}, { ttl: 120_000 });
            const tags = await resp.json();
            if (Array.isArray(tags)) this._allTags = tags; else this._allTags = [];
        } catch (_) {
            this._allTags = [];
        }
    },
    
    updateTagSuggestions() {
        const input = document.getElementById('job_tags_input');
        const q = (input?.value || '').toLowerCase().trim();
        const box = document.getElementById('job_tag_suggestions');
        if (!box) return;
        const results = (this._allTags || []).filter(t => t.name.toLowerCase().includes(q) && !this._selectedTagIds.has(t.id)).slice(0, 10);
        if (!q || results.length === 0) {
            box.innerHTML = '';
            box.classList.add('hidden');
            return;
        }
        box.innerHTML = results.map(t => `<button type=\"button\" class=\"w-full text-left px-3 py-2 hover:bg-gray-50\" onclick=\"CreateJobModal.addTagById(${t.id})\">${t.name}</button>`).join('');
        box.classList.remove('hidden');
    },
    
    addTagById(id) {
        const tag = (this._allTags || []).find(t => t.id === id);
        if (!tag) return;
        this._selectedTagIds.add(tag.id);
        const sel = document.getElementById('job_selected_tags');
        if (sel) {
            const chip = document.createElement('span');
            chip.className = 'badge border-2';
            chip.style.borderColor = tag.color || '#007bff';
            chip.style.color = tag.color || '#007bff';
            chip.dataset.tagId = String(tag.id);
            chip.innerHTML = `${tag.name} <button type=\"button\" class=\"ml-1 text-xs\" onclick=\"CreateJobModal.removeSelectedTag(${tag.id})\">✕</button>`;
            sel.appendChild(chip);
        }
        const box = document.getElementById('job_tag_suggestions');
        if (box) { box.innerHTML = ''; box.classList.add('hidden'); }
        const input = document.getElementById('job_tags_input');
        if (input) input.value = '';
    },
    
    removeSelectedTag(id) {
        this._selectedTagIds.delete(id);
        const sel = document.getElementById('job_selected_tags');
        if (!sel) return;
        const chips = Array.from(sel.children);
        for (const c of chips) {
            if (c.dataset && c.dataset.tagId === String(id)) {
                sel.removeChild(c);
                break;
            }
        }
    },
    
    hide() {
        const modal = document.getElementById('createJobModal');
        if (modal) {
            modal.remove();
        }
        document.body.style.overflow = '';
        // Clear any temporary markers using ParcelGeocoding module
        if (window.ParcelGeocoding && window.AppState?.map) {
            window.ParcelGeocoding.removeTempMarker(window.AppState.map);
        }
    },
    
    switchTab(tab) {
        const addressTab = document.getElementById('addressTab');
        const parcelTab = document.getElementById('parcelTab');
        const addressSection = document.getElementById('addressSection');
        const parcelSection = document.getElementById('parcelSection');
        const addressInput = document.getElementById('job_address_input');
        
        if (tab === 'address') {
            addressTab.className = 'flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors bg-pink-500 text-white';
            parcelTab.className = 'flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors text-gray-700 hover:bg-gray-200';
            addressSection.style.display = 'block';
            parcelSection.style.display = 'none';
            addressInput.required = true;
        } else {
            addressTab.className = 'flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors text-gray-700 hover:bg-gray-200';
            parcelTab.className = 'flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors bg-pink-500 text-white';
            addressSection.style.display = 'none';
            parcelSection.style.display = 'block';
            addressInput.required = false;
        }
    },
    
    updateParcelInputs() {
        const county = document.getElementById('parcel_county').value;
        const brevardInputs = document.getElementById('brevardInputs');
        const orangeInputs = document.getElementById('orangeInputs');
        const brevardTax = document.getElementById('brevard_tax_account');
        const orangeParcel = document.getElementById('orange_parcel_id');
        
        if (county === 'brevard') {
            brevardInputs.style.display = 'block';
            orangeInputs.style.display = 'none';
            if (brevardTax) brevardTax.required = true;
            if (orangeParcel) orangeParcel.required = false;
        } else if (county === 'orange') {
            brevardInputs.style.display = 'none';
            orangeInputs.style.display = 'block';
            if (brevardTax) brevardTax.required = false;
            if (orangeParcel) orangeParcel.required = true;
        } else {
            brevardInputs.style.display = 'none';
            orangeInputs.style.display = 'none';
            if (brevardTax) brevardTax.required = false;
            if (orangeParcel) orangeParcel.required = false;
        }
    },
    
    async submit(event) {
        event.preventDefault();
        
        // Check which tab is active
        const addressSection = document.getElementById('addressSection');
        const isAddressMode = addressSection.style.display !== 'none';
        
        // Show loading state
        const submitButton = event.target.querySelector('button[type="submit"]');
        const originalText = submitButton.innerHTML;
        submitButton.disabled = true;
        
        let geocodeData = null;
        let parcelData = null;
        
        try {
            if (isAddressMode) {
                // Address mode - existing logic
                const addressInput = document.getElementById('job_address_input').value.trim();
                
                if (!addressInput) {
                    if (window.showNotification) {
                        window.showNotification('Please enter an address', 'error');
                    }
                    return;
                }
                
                submitButton.innerHTML = '<i class="bi bi-hourglass-split"></i> Geocoding...';
                
                // Geocode the address (append Florida for better accuracy)
                const geocodeResponse = await fetch(`/api/geocode?address=${encodeURIComponent(addressInput + ', Florida')}`);
                
                if (!geocodeResponse.ok) {
                    throw new Error('Could not geocode address');
                }
                
                geocodeData = await geocodeResponse.json();
            } else {
                // Parcel mode - use ParcelGeocoding module
                const county = document.getElementById('parcel_county').value;

                if (!county) {
                    if (window.showNotification) {
                        window.showNotification('Please select a county', 'error');
                    }
                    return;
                }

                submitButton.innerHTML = '<i class="bi bi-hourglass-split"></i> Looking up parcel...';

                let parcelResult;

                if (county === 'brevard') {
                    const taxAccount = document.getElementById('brevard_tax_account').value.trim();
                    if (!taxAccount) {
                        if (window.showNotification) {
                            window.showNotification('Please enter Tax Account Number', 'error');
                        }
                        return;
                    }
                    parcelResult = await window.ParcelGeocoding.lookupBrevard(taxAccount);
                } else if (county === 'orange') {
                    const parcelId = document.getElementById('orange_parcel_id').value.trim();
                    if (!parcelId) {
                        if (window.showNotification) {
                            window.showNotification('Please enter Parcel ID', 'error');
                        }
                        return;
                    }
                    parcelResult = await window.ParcelGeocoding.lookupOrange(parcelId);
                }

                // Store parcel data for later
                parcelData = {
                    county: parcelResult.county,
                    parcel_id: parcelResult.parcel_id,
                    raw_response: parcelResult.raw_response
                };

                // Use normalized geocode data from module
                geocodeData = {
                    lat: parcelResult.lat,
                    lng: parcelResult.lng,
                    formatted_address: parcelResult.address
                };

                // Show temporary marker and ask for confirmation
                submitButton.innerHTML = originalText;
                submitButton.disabled = false;

                // Hide the create job modal temporarily
                const createModal = document.getElementById('createJobModal');
                if (createModal) {
                    createModal.style.display = 'none';
                }

                // Create temporary marker using ParcelGeocoding module
                window.ParcelGeocoding.createTempMarker(
                    parcelResult.lat,
                    parcelResult.lng,
                    window.AppState.map
                );

                // Show confirmation dialog using ParcelGeocoding module
                const confirmResult = await window.ParcelGeocoding.showConfirmation(
                    { lat: parcelResult.lat, lng: parcelResult.lng, address: parcelResult.address },
                    parcelData
                );

                // Show the create modal again
                if (createModal) {
                    createModal.style.display = 'flex';
                }

                if (!confirmResult) {
                    // User cancelled - remove temporary marker
                    window.ParcelGeocoding.removeTempMarker(window.AppState.map);
                    return;
                }

                // User confirmed - remove temporary marker before creating job
                window.ParcelGeocoding.removeTempMarker(window.AppState.map);
            }
            
            // Get form values
            const jobData = {
                job_number: document.getElementById('job_number').value,
                client: document.getElementById('job_client').value,
                // Do not store any address for parcel-created jobs
                address: isAddressMode ? (document.getElementById('job_address_input').value.trim()) : undefined,
                status: document.getElementById('job_status').value,
                notes: document.getElementById('job_notes').value || null,
                due_date: document.getElementById('job_due_date').value || null,
                latitude: parseFloat(geocodeData.lat),
                longitude: parseFloat(geocodeData.lng),
                is_parcel_job: !isAddressMode,
                parcel_data: parcelData
            };
            
            console.log('Submitting job:', jobData);
            
            // Submit to API
            const response = await fetch('/api/jobs', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(jobData)
            });
            
            const responseText = await response.text();
            console.log('Response status:', response.status);
            console.log('Response text:', responseText);
            
            if (response.ok) {
                let result;
                try {
                    result = JSON.parse(responseText);
                } catch (e) {
                    // If response is not JSON, just use the text
                    result = responseText;
                }
                console.log('Job created:', result);
                const createdJob = (result && result.job) ? result.job : null;
                const jobNumber = createdJob?.job_number || jobData.job_number;

                // Attach selected tags if any
                if (jobNumber && this._selectedTagIds && this._selectedTagIds.size > 0) {
                    try {
                        const tagIds = Array.from(this._selectedTagIds);
                        await Promise.all(tagIds.map(id => fetch(`/api/jobs/${jobNumber}/tags`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ tag_id: id })
                        })));
                    } catch (e) {
                        console.warn('Failed assigning tags to new job', e);
                    }
                }

                if (window.ApiCache && typeof window.ApiCache.invalidateMatching === 'function') {
                    window.ApiCache.invalidateMatching('/api/jobs');
                    window.ApiCache.invalidateMatching('/admin/api/dashboard');
                    window.ApiCache.invalidateMatching('/api/jobs/deleted');
                    window.ApiCache.invalidateMatching('/api/tags');
                }

                // Close modal
                CreateJobModal.hide();
                
                // Remove search marker if any
                if (window.currentSearchMarker) {
                    window.AppState.map.removeLayer(window.currentSearchMarker);
                    window.currentSearchMarker = null;
                }
                
                // Reload jobs to show the new one (map)
                window.loadJobs?.(true);
                // Broadcast creation for listeners (admin)
                try { document.dispatchEvent(new CustomEvent('jobCreated', { detail: createdJob || jobData })); } catch(_) {}
                
                // Show success notification
                if (window.showNotification) {
                    window.showNotification('Job created successfully!', 'success');
                }
            } else {
                // Try to parse error message
                let errorMessage = 'Error creating job';
                try {
                    const errorData = JSON.parse(responseText);
                    errorMessage = errorData.error || errorData.message || responseText;
                } catch (e) {
                    errorMessage = responseText;
                }
                if (window.showNotification) {
                    window.showNotification('Error creating job: ' + errorMessage, 'error');
                }
            }
        } catch (error) {
            console.error('Error:', error);
            if (window.showNotification) {
                window.showNotification(error.message || 'Error creating job', 'error');
            }
        } finally {
            // Restore button state
            submitButton.innerHTML = originalText;
            submitButton.disabled = false;
        }
    }
};
