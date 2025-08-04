// Epic Map Location Debug Script
// Run this in the browser console on your production site

console.log('=== EPIC MAP LOCATION DEBUG ===');

// 1. Check HTTPS
console.log('\n1. SECURITY CONTEXT:');
console.log('- Protocol:', window.location.protocol);
console.log('- Secure context:', window.isSecureContext);
console.log('- Host:', window.location.host);

// 2. Check Geolocation API
console.log('\n2. GEOLOCATION API:');
if ('geolocation' in navigator) {
    console.log('✓ Geolocation API available');
    
    // Check permissions
    if ('permissions' in navigator) {
        navigator.permissions.query({name: 'geolocation'}).then(result => {
            console.log('- Permission state:', result.state);
        });
    }
} else {
    console.log('✗ Geolocation API NOT available');
}

// 3. Check Required Functions
console.log('\n3. REQUIRED FUNCTIONS:');
const functions = [
    'showNotification',
    'initUserLocation', 
    'updateUserLocationMarker',
    'centerOnUserLocation',
    'startWatchingPosition'
];

functions.forEach(fn => {
    console.log(`- ${fn}:`, typeof window[fn] === 'function' ? '✓ Loaded' : '✗ Missing');
});

// 4. Check AppState
console.log('\n4. APP STATE:');
if (window.AppState) {
    console.log('✓ AppState exists');
    console.log('- User location:', window.AppState.userLocation);
    console.log('- Location marker:', !!window.AppState.userLocationMarker);
    console.log('- Watch ID:', window.AppState.watchPositionId);
} else {
    console.log('✗ AppState missing');
}

// 5. Check MarkerUtils
console.log('\n5. MARKER UTILS:');
if (window.MarkerUtils) {
    console.log('✓ MarkerUtils loaded');
    console.log('- createUserLocationMarker:', typeof window.MarkerUtils.createUserLocationMarker);
} else {
    console.log('✗ MarkerUtils missing');
}

// 6. Test Geolocation
console.log('\n6. TESTING GEOLOCATION...');
if (navigator.geolocation && window.isSecureContext) {
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            console.log('✓ Location obtained:', {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy
            });
        },
        (err) => {
            console.log('✗ Location error:', err.code, err.message);
            switch(err.code) {
                case 1:
                    console.log('  → Permission denied. Check browser settings.');
                    break;
                case 2:
                    console.log('  → Position unavailable. Check device location settings.');
                    break;
                case 3:
                    console.log('  → Timeout. Try again.');
                    break;
            }
        },
        { timeout: 5000 }
    );
} else {
    console.log('✗ Cannot test - requires HTTPS or localhost');
}

console.log('\n=== END DEBUG ===');