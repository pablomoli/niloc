/**
 * Map Location Module
 * User geolocation handling and location marker management.
 */

/**
 * Initialize and request user geolocation.
 */
function initUserLocation() {
    if (!navigator.geolocation) {
        showNotification('Location services not available', 'error');
        return;
    }

    const storedPermission = LocationPermission.get();

    if (storedPermission === 'denied') {
        showLocationPrompt();
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude, accuracy } = position.coords;

            LocationPermission.set('granted');
            AppState.userLocation = { lat: latitude, lng: longitude, accuracy };

            const hasSavedState = MapViewState.get() !== null;
            if (!hasSavedState) {
                AppState.map.setView([latitude, longitude], 15);
            }

            updateUserLocationMarker(latitude, longitude, accuracy);
            startWatchingPosition();

            showNotification('Location found', 'success');
        },
        (error) => {
            console.error('Geolocation error:', error);
            let message = 'Unable to get your location';

            switch (error.code) {
                case error.PERMISSION_DENIED:
                    message = 'Location permission denied';
                    LocationPermission.set('denied');
                    setTimeout(() => showLocationPrompt(), 2000);
                    break;
                case error.POSITION_UNAVAILABLE:
                    message = 'Location information unavailable';
                    break;
                case error.TIMEOUT:
                    message = 'Location request timed out';
                    break;
            }

            showNotification(message, 'error');
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
}

/**
 * Show gentle prompt for users who denied location.
 */
function showLocationPrompt() {
    const prompt = document.createElement('div');
    prompt.className = 'location-prompt';
    prompt.innerHTML = `
        <div style="position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
                    background: white; padding: 15px 20px; border-radius: 8px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1); z-index: 1000;
                    display: flex; align-items: center; gap: 10px; max-width: 90%; width: auto;">
            <i class="bi bi-geo-alt" style="color: #0066cc;"></i>
            <span>Enable location to see your position on the map</span>
            <button onclick="retryLocation()" style="background: #0066cc; color: white;
                    border: none; padding: 5px 15px; border-radius: 4px; cursor: pointer;">
                Enable
            </button>
            <button onclick="this.parentElement.remove()" style="background: #f0f0f0;
                    border: none; padding: 5px 15px; border-radius: 4px; cursor: pointer;">
                Dismiss
            </button>
        </div>
    `;
    document.body.appendChild(prompt);

    setTimeout(() => prompt.remove(), 10000);
}

/**
 * Retry location access (clear stored denial and try again).
 */
function retryLocation() {
    LocationPermission.clear();
    document.querySelector('.location-prompt')?.remove();
    initUserLocation();
}

/**
 * Update user location marker and accuracy circle.
 */
function updateUserLocationMarker(lat, lng, accuracy) {
    if (AppState.userLocationMarker) {
        AppState.map.removeLayer(AppState.userLocationMarker);
    }
    if (AppState.userAccuracyCircle) {
        AppState.map.removeLayer(AppState.userAccuracyCircle);
    }

    AppState.userAccuracyCircle = L.circle([lat, lng], {
        radius: accuracy,
        className: 'user-accuracy-circle',
        interactive: false
    }).addTo(AppState.map);

    if (window.MarkerUtils) {
        AppState.userLocationMarker = MarkerUtils.createUserLocationMarker(lat, lng);
    } else {
        AppState.userLocationMarker = L.marker([lat, lng], {
            icon: L.divIcon({
                html: '<div style="width: 12px; height: 12px; background: #4285F4; border: 2px solid white; border-radius: 50%;"></div>',
                className: 'user-location-fallback',
                iconSize: [16, 16],
                iconAnchor: [8, 8]
            })
        });
    }

    AppState.userLocationMarker.addTo(AppState.map);
}

/**
 * Start watching user position.
 */
function startWatchingPosition() {
    if (!navigator.geolocation) return;

    if (AppState.watchPositionId) {
        navigator.geolocation.clearWatch(AppState.watchPositionId);
    }

    AppState.watchPositionId = navigator.geolocation.watchPosition(
        (position) => {
            const { latitude, longitude, accuracy } = position.coords;
            AppState.userLocation = { lat: latitude, lng: longitude, accuracy };
            updateUserLocationMarker(latitude, longitude, accuracy);
        },
        (error) => {
            console.error('Watch position error:', error);
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 1000
        }
    );
}

/**
 * Center map on user location.
 */
function centerOnUserLocation() {
    if (AppState.userLocation) {
        AppState.map.setView([AppState.userLocation.lat, AppState.userLocation.lng], 16);
        showNotification('Centered on your location', 'info');
    } else {
        const storedPermission = LocationPermission.get();
        if (storedPermission === 'denied') {
            showLocationPrompt();
        } else {
            showNotification('Getting your location...', 'info');
            initUserLocation();
        }
    }
}

// Export to window
window.initUserLocation = initUserLocation;
window.showLocationPrompt = showLocationPrompt;
window.retryLocation = retryLocation;
window.updateUserLocationMarker = updateUserLocationMarker;
window.startWatchingPosition = startWatchingPosition;
window.centerOnUserLocation = centerOnUserLocation;
