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
            <div id="createJobModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 999999; display: flex; align-items: center; justify-content: center;">
                <!-- Backdrop -->
                <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5);" onclick="CreateJobModal.hide()"></div>
                
                <!-- Modal Content -->
                <div style="position: relative; background: white; padding: 20px; border-radius: 8px; max-width: 500px; width: 90%; max-height: 90vh; overflow-y: auto; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
                    <button style="position: absolute; top: 10px; right: 10px; background: none; border: none; font-size: 24px; cursor: pointer;" onclick="CreateJobModal.hide()">&times;</button>
                    
                    <h2>Create New Job</h2>
                    
                    <!-- Tab Navigation -->
                    <div style="border-bottom: 2px solid #dee2e6; margin-bottom: 20px;">
                        <button type="button" id="addressTab" onclick="CreateJobModal.switchTab('address')" style="padding: 10px 20px; background: none; border: none; border-bottom: 3px solid #0d6efd; color: #0d6efd; font-weight: 500; cursor: pointer;">
                            Address
                        </button>
                        <button type="button" id="parcelTab" onclick="CreateJobModal.switchTab('parcel')" style="padding: 10px 20px; background: none; border: none; border-bottom: 3px solid transparent; color: #6c757d; font-weight: 500; cursor: pointer;">
                            Parcel ID
                        </button>
                    </div>
                    
                    <form id="createJobForm" onsubmit="CreateJobModal.submit(event); return false;">
                        <!-- Address Input Section -->
                        <div id="addressSection" style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 5px; font-weight: bold;">Address *</label>
                            <input type="text" id="job_address_input" value="${address || ''}" required style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;" placeholder="Enter job address">
                        </div>
                        
                        <!-- Parcel Input Section (hidden by default) -->
                        <div id="parcelSection" style="display: none; margin-bottom: 15px;">
                            <div style="margin-bottom: 15px;">
                                <label style="display: block; margin-bottom: 5px; font-weight: bold;">County *</label>
                                <select id="parcel_county" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;" onchange="CreateJobModal.updateParcelInputs()">
                                    <option value="">Select County</option>
                                    <option value="brevard">Brevard County</option>
                                    <option value="orange">Orange County</option>
                                </select>
                            </div>
                            
                            <!-- Brevard County Inputs -->
                            <div id="brevardInputs" style="display: none;">
                                <div style="margin-bottom: 10px;">
                                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">Tax Account Number</label>
                                    <input type="text" id="brevard_tax_account" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;" placeholder="Enter Tax Account Number">
                                </div>
                                <div style="text-align: center; margin: 10px 0; color: #6c757d; font-weight: 500;">OR</div>
                                <div style="margin-bottom: 10px;">
                                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">Parcel ID</label>
                                    <input type="text" id="brevard_parcel_id" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;" placeholder="Enter Parcel ID">
                                </div>
                            </div>
                            
                            <!-- Orange County Inputs -->
                            <div id="orangeInputs" style="display: none;">
                                <div style="margin-bottom: 10px;">
                                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">Parcel ID *</label>
                                    <input type="text" id="orange_parcel_id" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;" placeholder="Format: XX-XX-XX-XXXX-XX-XXX">
                                    <small style="color: #6c757d; display: block; margin-top: 5px;">Example: 13-23-32-7600-00-070</small>
                                </div>
                            </div>
                        </div>
                        
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 5px; font-weight: bold;">Job Number *</label>
                            <input type="text" id="job_number" required style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                        </div>
                        
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 5px; font-weight: bold;">Client Name *</label>
                            <input type="text" id="job_client" required style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                        </div>
                        
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 5px; font-weight: bold;">Status *</label>
                            <select id="job_status" required style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                                <option value="">Select Status</option>
                                ${statusOptions}
                            </select>
                        </div>
                        
                        <div style="margin-bottom: 20px;">
                            <label style="display: block; margin-bottom: 5px; font-weight: bold;">Notes</label>
                            <textarea id="job_notes" rows="3" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"></textarea>
                        </div>
                        
                        <div style="display: flex; gap: 10px; justify-content: flex-end;">
                            <button type="button" style="padding: 10px 20px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;" onclick="CreateJobModal.hide()">Cancel</button>
                            <button type="submit" style="padding: 10px 20px; background: #0d6efd; color: white; border: none; border-radius: 4px; cursor: pointer;">
                                <i class="bi bi-plus-circle"></i> Create Job
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
            addressTab.style.borderBottomColor = '#0d6efd';
            addressTab.style.color = '#0d6efd';
            parcelTab.style.borderBottomColor = 'transparent';
            parcelTab.style.color = '#6c757d';
            addressSection.style.display = 'block';
            parcelSection.style.display = 'none';
            addressInput.required = true;
        } else {
            addressTab.style.borderBottomColor = 'transparent';
            addressTab.style.color = '#6c757d';
            parcelTab.style.borderBottomColor = '#0d6efd';
            parcelTab.style.color = '#0d6efd';
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
                    const parcelId = document.getElementById('brevard_parcel_id').value.trim();
                    
                    if (!taxAccount && !parcelId) {
                        if (window.showNotification) {
                            window.showNotification('Please enter either Tax Account Number or Parcel ID', 'error');
                        }
                        return;
                    }
                    
                    const params = new URLSearchParams();
                    if (taxAccount) params.append('tax_account', taxAccount);
                    if (parcelId) params.append('parcel_id', parcelId);
                    
                    parcelResponse = await fetch(`/api/geocode/brevard-parcel?${params.toString()}`);
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
            // Determine if mobile or desktop
            const isMobile = window.innerWidth <= 768;
            
            const confirmHTML = `
                <div id="parcelConfirmModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 999999; pointer-events: none;">
                    <!-- Semi-transparent backdrop only on left side -->
                    <div style="position: absolute; top: 0; left: 0; width: ${isMobile ? '100%' : '400px'}; height: 100%; background: rgba(0,0,0,0.3); pointer-events: auto;"></div>
                    
                    <!-- Modal Content - positioned on the left -->
                    <div style="position: absolute; left: 0; top: 50%; transform: translateY(-50%); background: white; padding: 20px; border-radius: 0 8px 8px 0; width: ${isMobile ? '85%' : '380px'}; max-width: 400px; box-shadow: 2px 0 20px rgba(0,0,0,0.3); pointer-events: auto;">
                        <h3 style="margin-top: 0;">Confirm Parcel Location</h3>
                        
                        <div style="margin: 20px 0;">
                            <p style="margin-bottom: 10px;"><strong>Does this location look correct?</strong></p>
                            <div style="background: #f8f9fa; padding: 10px; border-radius: 4px; font-size: 14px;">
                                <div style="margin-bottom: 5px;">
                                    <strong>Parcel ID:</strong> ${parcelData.parcel_id}
                                </div>
                                <div style="margin-bottom: 5px;">
                                    <strong>County:</strong> ${parcelData.county.charAt(0).toUpperCase() + parcelData.county.slice(1)}
                                </div>
                                <div>
                                    <strong>Address:</strong> ${geocodeData.formatted_address}
                                </div>
                            </div>
                            <p style="margin-top: 10px; font-size: 14px; color: #6c757d;">
                                <i class="bi bi-geo-alt-fill" style="color: #9b59b6;"></i> The purple marker shows the parcel location on the map.
                            </p>
                        </div>
                        
                        <div style="display: flex; gap: 10px; justify-content: flex-end;">
                            <button onclick="CreateJobModal.resolveConfirmation(false)" style="padding: 10px 20px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;">
                                No, Try Again
                            </button>
                            <button onclick="CreateJobModal.resolveConfirmation(true)" style="padding: 10px 20px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">
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
