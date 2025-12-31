/**
 * Parcel Geocoding Module
 * Handles parcel lookup for Brevard and Orange counties, including
 * temporary marker display and confirmation flow.
 */

const ParcelGeocoding = {
    /** Reference to the temporary marker shown during parcel confirmation */
    tempMarker: null,

    /** Stored resolve function for the confirmation promise */
    _confirmResolve: null,

    /**
     * Lookup a parcel in Brevard County by tax account number.
     * @param {string} taxAccount - The tax account number
     * @returns {Promise<{lat: number, lng: number, address: string, parcel_id: string}>}
     */
    async lookupBrevard(taxAccount) {
        const response = await fetch(
            `/api/geocode/brevard-parcel?tax_account=${encodeURIComponent(taxAccount)}`
        );

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Could not find parcel');
        }

        const result = await response.json();
        return this._normalizeParcelResult(result, 'brevard');
    },

    /**
     * Lookup a parcel in Orange County by parcel ID.
     * @param {string} parcelId - The parcel ID (format: XX-XX-XX-XXXX-XX-XXX)
     * @returns {Promise<{lat: number, lng: number, address: string, parcel_id: string}>}
     */
    async lookupOrange(parcelId) {
        const response = await fetch(
            `/api/geocode/orange-parcel?parcel_id=${encodeURIComponent(parcelId)}`
        );

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Could not find parcel');
        }

        const result = await response.json();
        return this._normalizeParcelResult(result, 'orange');
    },

    /**
     * Normalize parcel API response to a consistent format.
     * @private
     */
    _normalizeParcelResult(result, county) {
        const lat = parseFloat(result.lat || result.latitude);
        const lng = parseFloat(result.lng || result.longitude || result.lon);

        if (isNaN(lat) || isNaN(lng)) {
            throw new Error('Invalid coordinates received from parcel lookup');
        }

        return {
            lat,
            lng,
            address: result.address || result.formatted_address || 'Parcel Location',
            parcel_id: result.parcel_id || result.tax_account,
            county,
            raw_response: result
        };
    },

    /**
     * Create a temporary marker on the map to preview parcel location.
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @param {L.Map} map - Leaflet map instance
     * @returns {L.CircleMarker} The created marker
     */
    createTempMarker(lat, lng, map) {
        this.removeTempMarker(map);

        this.tempMarker = L.circleMarker([lat, lng], {
            color: '#9b59b6',
            fillColor: '#9b59b6',
            fillOpacity: 0.8,
            radius: 15,
            weight: 3
        }).addTo(map);

        map.setView([lat, lng], 17);
        return this.tempMarker;
    },

    /**
     * Remove the temporary parcel marker from the map.
     * @param {L.Map} map - Leaflet map instance
     */
    removeTempMarker(map) {
        if (this.tempMarker && map) {
            map.removeLayer(this.tempMarker);
            this.tempMarker = null;
        }
    },

    /**
     * Show a confirmation dialog for the parcel location.
     * @param {Object} geocodeData - Contains lat, lng, address
     * @param {Object} parcelData - Contains parcel_id, county
     * @returns {Promise<boolean>} True if user confirms, false otherwise
     */
    showConfirmation(geocodeData, parcelData) {
        return new Promise((resolve) => {
            this._confirmResolve = resolve;

            const isMobile = window.innerWidth <= 768;
            const widthClass = isMobile ? 'w-[85%]' : 'w-[380px]';
            const leftBackdropWidth = isMobile ? 'w-full' : 'w-[400px]';
            const countyDisplay = parcelData.county.charAt(0).toUpperCase() + parcelData.county.slice(1);

            const confirmHTML = `
                <div id="parcelConfirmModal" class="fixed inset-0 z-[999999] pointer-events-none">
                    <div class="absolute top-0 left-0 ${leftBackdropWidth} h-full bg-black/30 pointer-events-auto"></div>
                    <div class="absolute left-0 top-1/2 -translate-y-1/2 bg-white p-5 rounded-r-lg shadow-2xl pointer-events-auto ${widthClass} max-w-[400px]">
                        <h3 class="mt-0 font-bold text-lg">Confirm Parcel Location</h3>
                        <div class="my-5">
                            <p class="mb-2"><strong>Does this location look correct?</strong></p>
                            <div class="bg-gray-100 p-3 rounded text-sm">
                                <div class="mb-1"><strong>Parcel ID:</strong> ${parcelData.parcel_id}</div>
                                <div class="mb-1"><strong>County:</strong> ${countyDisplay}</div>
                                <div><strong>Address:</strong> ${geocodeData.address}</div>
                            </div>
                            <p class="mt-2 text-sm text-gray-500">
                                <i class="bi bi-geo-alt-fill text-purple-500"></i> The purple marker shows the parcel location on the map.
                            </p>
                        </div>
                        <div class="flex gap-2 justify-end">
                            <button onclick="ParcelGeocoding.resolveConfirmation(false)" class="btn btn-ghost">No, Try Again</button>
                            <button onclick="ParcelGeocoding.resolveConfirmation(true)" class="btn btn-success">
                                <i class="bi bi-check-circle"></i> Yes, Create Job
                            </button>
                        </div>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', confirmHTML);
        });
    },

    /**
     * Resolve the confirmation dialog promise.
     * @param {boolean} confirmed - Whether user confirmed the location
     */
    resolveConfirmation(confirmed) {
        const confirmModal = document.getElementById('parcelConfirmModal');
        if (confirmModal) {
            confirmModal.remove();
        }

        if (this._confirmResolve) {
            this._confirmResolve(confirmed);
            this._confirmResolve = null;
        }
    }
};

// Attach to window for global access
window.ParcelGeocoding = ParcelGeocoding;
