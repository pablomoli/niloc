/**
 * Marker Utilities for Epic Map
 * Provides custom markers with status-based colors
 */

// Epic Color System - Status-based colors
// This is the single source of truth for status colors in the frontend
const EPIC_COLORS = {
  "On Hold/Pending Estimate": "#C0C0C0", // Grey
  "Needs Fieldwork": "#FFA500",          // Orange
  "Fieldwork Complete": "#8A2BE2",     // Purple
  "To Be Printed": "#1E90FF",           // Blue
  "Set/Flag Pins": "#FF0000",           // Red
  "Survey Complete/Invoice Sent": "#FFFF00", // Yellow
  "Completed/To be Filed": "#9ACD32",  // Green
  "Site Plan": "#FF69B4",                // Pink
};

// Status Display Names (for UI display)
const STATUS_NAMES = {
  "On Hold/Pending Estimate": "On Hold/Pending Estimate",
  "Needs Fieldwork": "Needs Fieldwork",
  "Fieldwork Complete": "Fieldwork Complete",
  "To Be Printed": "To Be Printed",
  "Set/Flag Pins": "Set/Flag Pins",
  "Survey Complete/Invoice Sent": "Survey Complete/Invoice Sent",
  "Completed/To be Filed": "Completed/To be Filed",
  "Site Plan": "Site Plan",
};

/**
 * Create Epic Marker SVG - Original design from map.js
 * @param {string} status - Job status for color coding
 * @param {boolean} isSelected - Whether the marker is selected
 * @param {boolean} isHighlighted - Whether the marker is highlighted
 * @returns {string} SVG string for the marker
 */
function createEpicMarkerSVG(
  status,
  isSelected = false,
  isHighlighted = false,
) {
  const color = EPIC_COLORS[status] || EPIC_COLORS["To Be Printed"];
  const strokeColor = isSelected
    ? "#ff0000"
    : isHighlighted
      ? "#ffff00"
      : "#333";
  const strokeWidth = isSelected ? "3" : isHighlighted ? "2.5" : "1.5";

  return `
    <svg width="25" height="41" viewBox="0 0 25 41" xmlns="http://www.w3.org/2000/svg">
      <path d="M12.5 2C6.7 2 2 6.7 2 12.5c0 7.3 10.5 26.5 10.5 26.5s10.5-19.2 10.5-26.5C23 6.7 18.3 2 12.5 2z" 
            fill="${color}" 
            stroke="${strokeColor}" 
            stroke-width="${strokeWidth}"/>
      
      <circle cx="12.5" cy="12.5" r="6" fill="white" stroke="${strokeColor}" stroke-width="1"/>
      <circle cx="12.5" cy="12.5" r="3" fill="${color}"/>
      
      ${isSelected ? '<circle cx="12.5" cy="12.5" r="2" fill="red"/>' : ""}
    </svg>
  `;
}

/**
 * Get Leaflet icon for a job status
 * @param {string} status - Job status
 * @param {boolean} isSelected - Whether the marker is selected
 * @param {boolean} isHighlighted - Whether the marker is highlighted
 * @returns {L.DivIcon} Leaflet DivIcon object
 */
function getStatusIcon(status, isSelected = false, isHighlighted = false) {
  // Create a wrapper div with larger touch area for mobile
  const svgContent = createEpicMarkerSVG(status, isSelected, isHighlighted);
  const html = `
    <div style="position: relative; width: 44px; height: 44px; margin-left: -9.5px; margin-top: -3px;">
      <div style="position: absolute; top: 3px; left: 9.5px;">
        ${svgContent}
      </div>
    </div>
  `;

  return L.divIcon({
    html: html,
    className: `epic-svg-marker ${isSelected ? "selected" : ""} ${isHighlighted ? "highlighted" : ""}`,
    iconSize: [44, 44],
    iconAnchor: [22, 44],
    popupAnchor: [0, -37],
  });
}

/**
 * Create a job marker with appropriate icon and popup
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {Object} job - Job object
 * @param {boolean} isSelected - Whether the marker is selected
 * @returns {L.Marker} Leaflet marker object
 */
function createJobMarker(lat, lng, job, isSelected = false) {
  const marker = L.marker([lat, lng], {
    icon: getStatusIcon(job.status, isSelected),
    title: job.job_number, // Tooltip on hover
  });

  // Store job data on marker for easy access
  marker.jobData = job;

  return marker;
}

/**
 * Create a temporary marker (for click mode)
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {L.Marker} Leaflet marker object
 */
function createTempMarker(lat, lng) {
  return L.marker([lat, lng], {
    icon: L.divIcon({
      html: '<div class="temp-marker-dot"></div>',
      className: "temp-marker",
      iconSize: [12, 12],
      iconAnchor: [6, 6],
    }),
  });
}

/**
 * Create a search result marker
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {L.Marker} Leaflet marker object
 */
function createSearchMarker(lat, lng) {
  return L.marker([lat, lng], {
    icon: L.divIcon({
      html: '<div class="search-result-marker-dot"></div>',
      className: "search-result-marker",
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    }),
  });
}

/**
 * Create a user location marker (blue dot like Google Maps)
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {L.Marker} Leaflet marker object
 */
function createUserLocationMarker(lat, lng) {
  return L.marker([lat, lng], {
    icon: L.divIcon({
      html: `
        <div class="user-location-marker">
          <div class="user-location-pulse"></div>
          <div class="user-location-dot"></div>
        </div>
      `,
      className: "user-location-icon",
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    }),
    zIndexOffset: 1000, // Keep above other markers
  });
}

/**
 * Create status filter buttons
 * @param {Array} jobs - Array of job objects
 * @param {Element} container - DOM element to append filters to
 */
function createStatusFilters(jobs, container) {
  const statuses = [...new Set(jobs.map((job) => job.status).filter(Boolean))];

  statuses.forEach((status) => {
    const button = document.createElement("button");
    button.className = "filter-btn";
    button.dataset.status = status;

    const color = EPIC_COLORS[status] || "#999";
    const name = STATUS_NAMES[status] || status;

    button.innerHTML = `
            <span class="status-dot" style="background-color: ${color}"></span>
            <span>${name}</span>
        `;

    container.appendChild(button);
  });
}

/**
 * Create a status legend control for the map
 * @returns {L.Control} Leaflet control object
 */
function createStatusLegend() {
  const legend = L.control({ position: "bottomright" });

  legend.onAdd = function (map) {
    const div = L.DomUtil.create("div", "epic-map-legend");
    div.style.cssText = `
            background: white;
            padding: 10px;
            border-radius: 5px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            font-size: 12px;
        `;

    let legendHTML =
      '<h5 style="margin: 0 0 10px 0; font-size: 14px;">Status Legend</h5>';

    // Create legend items
    for (const [status, color] of Object.entries(EPIC_COLORS)) {
      const name = STATUS_NAMES[status] || status;
      legendHTML += `
                <div style="margin-bottom: 5px; display: flex; align-items: center;">
                    <svg width="16" height="16" style="margin-right: 8px;">
                        <circle cx="8" cy="8" r="6" fill="${color}" stroke="#333" stroke-width="1"/>
                    </svg>
                    <span>${name}</span>
                </div>
            `;
    }

    div.innerHTML = legendHTML;
    return div;
  };

  return legend;
}

/**
 * Helper function to determine if a color is light
 * @param {string} color - Hex color code
 * @returns {boolean} True if color is light
 */
function isLightColor(color) {
  const hex = color.replace("#", "");
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 155;
}

/**
 * Add marker styles to the page
 */
function addMarkerStyles() {
  const style = document.createElement("style");
  style.textContent = `
        .epic-svg-marker {
            background: transparent;
            border: none;
        }
        
        .temp-marker-dot {
            width: 12px;
            height: 12px;
            background-color: #ff0000;
            border: 2px solid #fff;
            border-radius: 50%;
        }
        
        .search-result-marker-dot {
            width: 16px;
            height: 16px;
            background-color: #0d6efd;
            border: 3px solid #fff;
            border-radius: 50%;
            animation: pulse 2s ease-in-out infinite;
        }
        
        @keyframes pulse {
            0% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.2); opacity: 0.8; }
            100% { transform: scale(1); opacity: 1; }
        }
        
        .status-dot {
            display: inline-block;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            margin-right: 6px;
            border: 1px solid rgba(0, 0, 0, 0.2);
        }
        
        .filter-btn {
            display: inline-flex;
            align-items: center;
            padding: 4px 12px;
            margin: 2px;
            border: 1px solid #ddd;
            border-radius: 16px;
            background: white;
            cursor: pointer;
            font-size: 12px;
            transition: all 0.2s;
        }
        
        .filter-btn:hover {
            background: #f0f0f0;
        }
        
        .filter-btn.active {
            background: #0d6efd;
            color: white;
            border-color: #0d6efd;
        }
        
        .filter-btn.active .status-dot {
            border-color: rgba(255, 255, 255, 0.5);
        }
        
        /* User Location Marker Styles */
        .user-location-icon {
            background: transparent;
            border: none;
        }
        
        .user-location-marker {
            position: relative;
            width: 24px;
            height: 24px;
        }
        
        .user-location-dot {
            position: absolute;
            top: 6px;
            left: 6px;
            width: 12px;
            height: 12px;
            background-color: #4285F4;
            border: 2px solid #fff;
            border-radius: 50%;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            z-index: 2;
        }
        
        .user-location-pulse {
            position: absolute;
            top: 0;
            left: 0;
            width: 24px;
            height: 24px;
            background-color: #4285F4;
            border-radius: 50%;
            opacity: 0.3;
            animation: userLocationPulse 2s ease-out infinite;
            z-index: 1;
        }
        
        @keyframes userLocationPulse {
            0% {
                transform: scale(0.5);
                opacity: 0.7;
            }
            100% {
                transform: scale(1.5);
                opacity: 0;
            }
        }
        
        /* Accuracy Circle */
        .user-accuracy-circle {
            fill: #4285F4;
            fill-opacity: 0.15;
            stroke: #4285F4;
            stroke-width: 1;
            stroke-opacity: 0.3;
        }
    `;
  document.head.appendChild(style);
}

// Initialize styles when the script loads
addMarkerStyles();

// Export utilities
window.MarkerUtils = {
  EPIC_COLORS,
  STATUS_NAMES,
  createEpicMarkerSVG,
  getStatusIcon,
  createJobMarker,
  createTempMarker,
  createSearchMarker,
  createUserLocationMarker,
  createStatusFilters,
  createStatusLegend,
  isLightColor,
};
