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
                    
                    <form id="createJobForm" onsubmit="CreateJobModal.submit(event); return false;">
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 5px; font-weight: bold;">Address *</label>
                            <input type="text" id="job_address_input" value="${address || ''}" required style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;" placeholder="Enter job address">
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
    },
    
    async submit(event) {
        event.preventDefault();
        
        // Get address from input
        const addressInput = document.getElementById('job_address_input').value.trim();
        
        if (!addressInput) {
            // Use notification instead of alert for better UX
            if (window.showNotification) {
                window.showNotification('Please enter an address', 'error');
            }
            return;
        }
        
        // Show loading state
        const submitButton = event.target.querySelector('button[type="submit"]');
        const originalText = submitButton.innerHTML;
        submitButton.innerHTML = '<i class="bi bi-hourglass-split"></i> Geocoding...';
        submitButton.disabled = true;
        
        try {
            // Geocode the address
            const geocodeResponse = await fetch(`/api/geocode?address=${encodeURIComponent(addressInput)}`);
            
            if (!geocodeResponse.ok) {
                throw new Error('Could not geocode address');
            }
            
            const geocodeData = await geocodeResponse.json();
            
            // Get form values
            const jobData = {
                job_number: document.getElementById('job_number').value,
                client: document.getElementById('job_client').value,
                address: geocodeData.formatted_address || addressInput,
                status: document.getElementById('job_status').value,
                notes: document.getElementById('job_notes').value || null,
                latitude: parseFloat(geocodeData.lat),
                longitude: parseFloat(geocodeData.lng)
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
    }
};
