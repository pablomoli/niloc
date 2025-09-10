// Create Job Modal Handler
window.CreateJobModal = {
    show(lat, lng, address) {
        console.log('CreateJobModal.show called with:', lat, lng, address);
        
        // Get available statuses from MarkerUtils
        const statuses = window.MarkerUtils ? Object.keys(window.MarkerUtils.EPIC_COLORS) : [
            "On Hold/Pending",
            "Needs Fieldwork",
            "Fieldwork Complete/Needs Office Work",
            "To Be Printed/Packaged",
            "Survey Complete/Invoice Sent/Unpaid",
            "Set/Flag Pins",
            "Completed/To Be Filed",
            "Ongoing Site Plan",
            "Estimate/Quote Available"
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
                <div class="bg-white rounded-lg shadow-xl p-6 w-11/12 max-w-lg relative max-h-90vh overflow-y-auto">
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
                                    <input type="text" id="brevard_tax_account" class="input input-bordered w-full" placeholder="Enter Tax Account Number" required>
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
                        
                        <div class="mb-6">
                            <label class="block text-gray-600 text-sm font-medium mb-2">Notes</label>
                            <textarea id="job_notes" rows="3" class="textarea textarea-bordered w-full"></textarea>
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
    
    hide() {
        const modal = document.getElementById('createJobModal');
        if (modal) {
            modal.remove();
        }
        document.body.style.overflow = '';
        // Clear any temporary markers
        if (window.tempParcelMarker) {
            window.AppState.map.removeLayer(window.tempParcelMarker);
            window.tempParcelMarker = null;
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
        
        if (county === 'brevard') {
            brevardInputs.style.display = 'block';
            orangeInputs.style.display = 'none';
        } else if (county === 'orange') {
            brevardInputs.style.display = 'none';
            orangeInputs.style.display = 'block';
        } else {
            brevardInputs.style.display = 'none';
            orangeInputs.style.display = 'none';
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
                // Parcel mode
                const county = document.getElementById('parcel_county').value;
                
                if (!county) {
                    if (window.showNotification) {
                        window.showNotification('Please select a county', 'error');
                    }
                    return;
                }
                
                submitButton.innerHTML = '<i class="bi bi-hourglass-split"></i> Looking up parcel...';
                
                let parcelResponse;
                
                if (county === 'brevard') {
                    const taxAccount = document.getElementById('brevard_tax_account').value.trim();
                    if (!taxAccount) {
                        if (window.showNotification) {
                            window.showNotification('Please enter Tax Account Number', 'error');
                        }
                        return;
                    }
                    parcelResponse = await fetch(`/api/geocode/brevard-parcel?tax_account=${encodeURIComponent(taxAccount)}`);
                } else if (county === 'orange') {
                    const parcelId = document.getElementById('orange_parcel_id').value.trim();
                    
                    if (!parcelId) {
                        if (window.showNotification) {
                            window.showNotification('Please enter Parcel ID', 'error');
                        }
                        return;
                    }
                    
                    parcelResponse = await fetch(`/api/geocode/orange-parcel?parcel_id=${encodeURIComponent(parcelId)}`);
                }
                
                if (!parcelResponse.ok) {
                    const errorData = await parcelResponse.json();
                    throw new Error(errorData.error || 'Could not find parcel');
                }
                
                const parcelResult = await parcelResponse.json();
                
                console.log('Parcel API response:', parcelResult);
                
                // Store parcel data for later
                parcelData = {
                    county: county,
                    parcel_id: parcelResult.parcel_id || parcelResult.tax_account,
                    raw_response: parcelResult
                };
                
                // Use parcel geocoding data
                geocodeData = {
                    lat: parcelResult.lat || parcelResult.latitude,
                    lng: parcelResult.lng || parcelResult.longitude || parcelResult.lon,
                    formatted_address: parcelResult.address || parcelResult.formatted_address || 'Parcel Location'
                };
                
                console.log('Processed geocode data:', geocodeData);
                
                // Show temporary marker and ask for confirmation
                submitButton.innerHTML = originalText;
                submitButton.disabled = false;
                
                // Hide the create job modal temporarily
                const createModal = document.getElementById('createJobModal');
                if (createModal) {
                    createModal.style.display = 'none';
                }
                
                // Create temporary marker using SVG
                if (window.tempParcelMarker) {
                    window.AppState.map.removeLayer(window.tempParcelMarker);
                }
                
                console.log('Creating purple marker at:', geocodeData.lat, geocodeData.lng);
                console.log('Map object:', window.AppState.map);
                
                const lat = parseFloat(geocodeData.lat);
                const lng = parseFloat(geocodeData.lng);
                
                console.log('Parsed coordinates:', lat, lng);
                
                if (isNaN(lat) || isNaN(lng)) {
                    console.error('Invalid coordinates:', geocodeData);
                    throw new Error('Invalid coordinates received from parcel lookup');
                }
                
                // Try simple circle marker first
                window.tempParcelMarker = L.circleMarker([lat, lng], {
                    color: '#9b59b6',
                    fillColor: '#9b59b6',
                    fillOpacity: 0.8,
                    radius: 15,
                    weight: 3
                }).addTo(window.AppState.map);
                
                console.log('Marker created:', window.tempParcelMarker);
                
                // Pan to location
                window.AppState.map.setView([lat, lng], 17);
                
                // Add a popup to make it more visible for debugging
                window.tempParcelMarker.bindPopup(`
                    <strong>Parcel Location</strong><br>
                    Lat: ${lat}<br>
                    Lng: ${lng}
                `).openPopup();
                
                // Show confirmation dialog
                const confirmResult = await CreateJobModal.showParcelConfirmation(geocodeData, parcelData);
                
                // Show the create modal again
                if (createModal) {
                    createModal.style.display = 'flex';
                }
                
                if (!confirmResult) {
                    // User cancelled - remove temporary marker
                    if (window.tempParcelMarker) {
                        window.AppState.map.removeLayer(window.tempParcelMarker);
                        window.tempParcelMarker = null;
                    }
                    return;
                }
                
                // User confirmed - remove temporary marker before creating job
                if (window.tempParcelMarker) {
                    window.AppState.map.removeLayer(window.tempParcelMarker);
                    window.tempParcelMarker = null;
                }
            }
            
            // Get form values
            const jobData = {
                job_number: document.getElementById('job_number').value,
                client: document.getElementById('job_client').value,
                address: geocodeData.formatted_address || document.getElementById('job_address_input').value.trim(),
                status: document.getElementById('job_status').value,
                notes: document.getElementById('job_notes').value || null,
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
                
                // Close modal
                CreateJobModal.hide();
                
                // Remove search marker if any
                if (window.currentSearchMarker) {
                    window.AppState.map.removeLayer(window.currentSearchMarker);
                    window.currentSearchMarker = null;
                }
                
                // Reload jobs to show the new one
                if (window.loadJobs) {
                    window.loadJobs();
                }
                
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
    },
    
    showParcelConfirmation(geocodeData, parcelData) {
        return new Promise((resolve) => {
            const isMobile = window.innerWidth <= 768;
            const widthClass = isMobile ? 'w-[85%]' : 'w-[380px]';
            const leftBackdropWidth = isMobile ? 'w-full' : 'w-[400px]';
            const confirmHTML = `
                <div id="parcelConfirmModal" class="fixed inset-0 z-[999999] pointer-events-none">
                    <div class="absolute top-0 left-0 ${leftBackdropWidth} h-full bg-black/30 pointer-events-auto"></div>
                    <div class="absolute left-0 top-1/2 -translate-y-1/2 bg-white p-5 rounded-r-lg shadow-2xl pointer-events-auto ${widthClass} max-w-[400px]">
                        <h3 class="mt-0 font-bold text-lg">Confirm Parcel Location</h3>
                        <div class="my-5">
                            <p class="mb-2"><strong>Does this location look correct?</strong></p>
                            <div class="bg-gray-100 p-3 rounded text-sm">
                                <div class="mb-1"><strong>Parcel ID:</strong> ${parcelData.parcel_id}</div>
                                <div class="mb-1"><strong>County:</strong> ${parcelData.county.charAt(0).toUpperCase() + parcelData.county.slice(1)}</div>
                                <div><strong>Address:</strong> ${geocodeData.formatted_address}</div>
                            </div>
                            <p class="mt-2 text-sm text-gray-500">
                                <i class="bi bi-geo-alt-fill text-purple-500"></i> The purple marker shows the parcel location on the map.
                            </p>
                        </div>
                        <div class="flex gap-2 justify-end">
                            <button onclick="CreateJobModal.resolveConfirmation(false)" class="btn btn-ghost">No, Try Again</button>
                            <button onclick="CreateJobModal.resolveConfirmation(true)" class="btn btn-success">
                                <i class="bi bi-check-circle"></i> Yes, Create Job
                            </button>
                        </div>
                    </div>
                </div>
            `;
            
            // Store resolve function
            window.parcelConfirmResolve = resolve;
            
            // Add modal to body
            document.body.insertAdjacentHTML('beforeend', confirmHTML);
        });
    },
    
    resolveConfirmation(confirmed) {
        // Remove confirmation modal
        const confirmModal = document.getElementById('parcelConfirmModal');
        if (confirmModal) {
            confirmModal.remove();
        }
        
        // Resolve the promise
        if (window.parcelConfirmResolve) {
            window.parcelConfirmResolve(confirmed);
            window.parcelConfirmResolve = null;
        }
    }
};
