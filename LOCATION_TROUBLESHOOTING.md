# User Location Tracking Troubleshooting Guide

## Overview
This guide helps troubleshoot the user location tracking feature that works on development server but fails on production.

## 1. Common Issues with Geolocation on Production Sites

### HTTPS Requirement ⚠️
**This is the most common cause of geolocation failure on production!**

The Geolocation API requires a secure context (HTTPS) to work on production sites. This is a browser security requirement implemented by all modern browsers.

- ✅ **Works on:** `https://` URLs, `localhost`, `127.0.0.1`, `file://` URLs
- ❌ **Fails on:** `http://` URLs (except localhost)

**Solution:** Ensure your production site uses HTTPS with a valid SSL certificate.

### Mixed Content Issues
If your site is HTTPS but loads resources over HTTP, browsers may block functionality.

**Check for:**
- Scripts loaded via HTTP
- Stylesheets loaded via HTTP
- API calls made to HTTP endpoints

## 2. Browser Console Debugging Steps

### Step 1: Open Browser Developer Tools
- **Chrome/Edge:** Press `F12` or `Ctrl+Shift+I` (Windows) / `Cmd+Option+I` (Mac)
- **Safari:** Enable Developer menu in Preferences, then `Cmd+Option+I`
- **Mobile Safari:** Connect iPhone to Mac, open Safari, Develop menu > Select your device

### Step 2: Check Console for Errors
Look for these specific error messages:

```javascript
// Common error messages and their meanings:

"getCurrentPosition() and watchPosition() no longer work on insecure origins"
// → Your site is not using HTTPS

"User denied Geolocation"
// → User clicked "Block" on permission prompt

"Network location provider at 'https://www.googleapis.com/' : No response received"
// → Network connectivity issue

"Only secure origins are allowed"
// → HTTPS required
```

### Step 3: Test Geolocation Manually
In the console, run:

```javascript
// Test if geolocation is available
console.log('Geolocation available:', 'geolocation' in navigator);

// Test getting current position
navigator.geolocation.getCurrentPosition(
    position => console.log('Success:', position),
    error => console.error('Error:', error),
    { enableHighAccuracy: true, timeout: 10000 }
);
```

### Step 4: Check Specific App Functions
Test if the functions are defined:

```javascript
// Check if app functions exist
console.log('centerOnUserLocation:', typeof window.centerOnUserLocation);
console.log('initUserLocation:', typeof window.initUserLocation);
console.log('AppState:', window.AppState);
console.log('User location:', window.AppState?.userLocation);
```

## 3. Permission and Security Considerations

### Browser Permissions
1. **Check site permissions:**
   - Click the padlock icon in the address bar
   - Look for "Location" permission
   - Ensure it's set to "Allow"

2. **Reset permissions if needed:**
   - Chrome: `chrome://settings/content/location`
   - Firefox: `about:preferences#privacy`
   - Safari: Preferences > Websites > Location

### iOS Specific Settings
1. **Settings > Privacy & Security > Location Services**
   - Ensure Location Services is ON
   - Find your browser (Safari/Chrome)
   - Set to "While Using App"

2. **Settings > [Your Browser] > Location**
   - Set to "Ask" or "Allow"

### Android Specific Settings
1. **Settings > Location > App permissions**
   - Find your browser
   - Set to "Allow only while using app"

## 4. Mobile-Specific Issues

### iOS Safari Issues
- **Motion & Orientation Access:** iOS 13+ requires permission for device motion
- **Private Browsing:** Geolocation may be restricted in private mode
- **Low Power Mode:** May affect GPS accuracy

### Common Mobile Problems
1. **GPS not available indoors:** Test outside for better signal
2. **Wi-Fi assist:** Enable Wi-Fi for better location accuracy
3. **Background location:** Not available in web browsers

## 5. Checking JavaScript Files are Loaded and Updated

### Verify Script Loading
In console, check if scripts loaded:

```javascript
// Check if required objects exist
console.log('MarkerUtils loaded:', typeof window.MarkerUtils);
console.log('Alpine loaded:', typeof Alpine);
console.log('Leaflet loaded:', typeof L);
```

### Check Script Versions
View page source and verify script URLs:
- Look for `?v=` or version parameters
- Check if using cached versions

### Network Tab Investigation
1. Open Network tab in Developer Tools
2. Reload the page
3. Filter by "JS"
4. Check for:
   - ❌ Red entries (failed loads)
   - ⚠️ 304 responses (cached, might be outdated)
   - Status codes for each script

## 6. Cache-Related Issues and Force Refresh

### Force Refresh Methods

**Desktop Browsers:**
- **Windows/Linux:** `Ctrl + F5` or `Ctrl + Shift + R`
- **Mac:** `Cmd + Shift + R`

**Mobile Browsers:**
- **iOS Safari:** Settings > Safari > Clear History and Website Data
- **Chrome Mobile:** Menu > Settings > Privacy > Clear Browsing Data

### Disable Cache During Testing
1. Open Developer Tools
2. Network tab
3. Check "Disable cache" checkbox
4. Keep DevTools open while testing

### Cache Busting for Scripts
Ensure your script tags use cache busting:

```html
<!-- Add version or timestamp to force reload -->
<script src="/static/js/map.js?v=1.2.3"></script>
<!-- Or use timestamp -->
<script src="/static/js/map.js?t=1234567890"></script>
```

## 7. Production-Specific Debugging

### Check Production Configuration

1. **Verify HTTPS Certificate:**
   ```bash
   # Check SSL certificate
   curl -I https://yourdomain.com
   ```

2. **Test Geolocation Support:**
   Visit: https://yourdomain.com and run:
   ```javascript
   console.log(window.isSecureContext); // Should be true
   ```

3. **Check Content Security Policy:**
   Look for CSP headers that might block geolocation:
   ```
   Content-Security-Policy: geolocation 'self' https://yourdomain.com
   ```

### Common Production Issues and Fixes

| Issue | Symptom | Solution |
|-------|---------|----------|
| No HTTPS | Geolocation silently fails | Install SSL certificate |
| Self-signed cert | Browser warnings | Use Let's Encrypt or valid cert |
| Outdated scripts | Old behavior persists | Implement cache busting |
| CSP blocking | Console errors about CSP | Update CSP headers |
| Reverse proxy | HTTPS terminated early | Ensure proxy forwards HTTPS |

## 8. Quick Diagnostic Script

Run this comprehensive diagnostic in the browser console:

```javascript
// Diagnostic script for location tracking
console.log('=== Location Tracking Diagnostic ===');
console.log('1. Secure context:', window.isSecureContext);
console.log('2. Geolocation available:', 'geolocation' in navigator);
console.log('3. Current URL protocol:', window.location.protocol);
console.log('4. Scripts loaded:');
console.log('   - MarkerUtils:', typeof window.MarkerUtils !== 'undefined');
console.log('   - AppState:', typeof window.AppState !== 'undefined');
console.log('   - centerOnUserLocation:', typeof window.centerOnUserLocation !== 'undefined');
console.log('5. User location data:', window.AppState?.userLocation);
console.log('6. Location marker exists:', !!window.AppState?.userLocationMarker);

// Test actual geolocation
console.log('\n7. Testing geolocation...');
navigator.geolocation.getCurrentPosition(
    pos => {
        console.log('✅ Geolocation works!');
        console.log('   Latitude:', pos.coords.latitude);
        console.log('   Longitude:', pos.coords.longitude);
        console.log('   Accuracy:', pos.coords.accuracy, 'meters');
    },
    err => {
        console.error('❌ Geolocation failed:', err.message);
        console.error('   Error code:', err.code);
        console.error('   Likely cause:', 
            err.code === 1 ? 'Permission denied' :
            err.code === 2 ? 'Position unavailable' :
            err.code === 3 ? 'Timeout' : 'Unknown'
        );
    },
    { enableHighAccuracy: true, timeout: 10000 }
);
```

## 9. Step-by-Step Resolution Process

1. **Run the diagnostic script** (Section 8) on both dev and production
2. **Compare results** between environments
3. **Check HTTPS** - This is the most common issue
4. **Clear all caches** and force refresh
5. **Check browser permissions** for location access
6. **Monitor console** for specific error messages
7. **Verify scripts loaded** with correct versions
8. **Test on multiple devices** to isolate the issue

## 10. If All Else Fails

1. **Check server logs** for any 500 errors or issues serving static files
2. **Use Chrome Remote Debugging** for mobile devices
3. **Test with a different browser** to rule out browser-specific issues
4. **Temporarily disable** any ad blockers or privacy extensions
5. **Check if problem persists** in an incognito/private window

## Contact for Help

If the issue persists after following this guide:
1. Document which steps you've tried
2. Save console logs from the diagnostic script
3. Note any error messages
4. Include browser version and device type
5. Share the production URL (if possible) for direct testing