# EpicMap Project TODO List

# Project Context Prompt for AI Assistants

I'm working on a Flask-based surveying job management system called EpicMap. Here's the key context:

ARCHITECTURE:

- Flask backend with SQLAlchemy models (Job, FieldWork, User, Tag)
- RESTful API endpoints in api_routes.py
- Admin SPA (Single Page Application) with admin_spa.js
- Leaflet map interface with clustering and filtering
- PostgreSQL database with soft deletion pattern

KEY MODELS:

- Job: job_number, client, address/parcel_id, status, coordinates, timestamps, soft deletion
- FieldWork: linked to jobs, tracks work_date, start/end times, crew, drone usage
- User: authentication with admin/user roles
- Relationships: Job.field_work (one-to-many), Job.created_by/deleted_by (many-to-one)

CURRENT FEATURES:

- Interactive map with job markers colored by status
- Job CRUD operations via both map interface and admin panel
- Multi-job selection and route planning with Google Maps
- Fieldwork time tracking with daily totals
- Admin dashboard with basic metrics
- User management with role-based permissions
- Address geocoding and parcel ID lookup (Orange, Brevard, Seminole, Lake, Osceola counties)
- Real-time search/filtering across all jobs in database
- Complete deleted jobs management with restore and permanent deletion

STATUS WORKFLOW:
8 job statuses from "On Hold/Pending" through "Completed/To Be Filed" plus "Estimate/Quote Available"

PRIORITY FEATURES:

- Dual job input: address-based OR parcel ID-based with separate UI flows
- Enhanced map interface with better UX
- Basic mobile-responsive design (office-focused tool)
- Simple fieldwork tracking for crews
- Outlook calendar integration

KNOWN ARCHITECTURE:

- app.py: Main Flask app with backward compatibility routes
- api_routes.py: Consolidated RESTful API endpoints
- admin/routes.py: Admin view routes and API proxies
- map.js: Enhanced Leaflet map with clustering and multi-select
- admin_spa.js: Admin SPA controller with caching and filtering
- models.py: SQLAlchemy models with relationship management

---

# ✅ **COMPLETED FEATURES**

## Real-Time Search & Filtering System ✅
- [x] Remove pagination limitations - always search ALL jobs in database
- [x] Create unified search endpoint that handles job_number, client, address, parcel_id
- [x] Implement efficient database indexing for search fields
- [x] Add fuzzy matching for partial searches
- [x] Remove complex `hasAllJobs` logic and pagination conflicts
- [x] Implement instant search with 150ms debounce on input changes
- [x] Add search result highlighting and match indicators
- [x] Create "X results found" display with clear filters button
- [x] Simplify admin_spa.js to single filter state object
- [x] Remove conflicting pagination vs search logic
- [x] Implement proper loading states during search
- [x] Add database indexes on job_number, client, address, parcel_id
- [x] Implement search result caching (5-minute TTL)
- [x] Optimize SQL queries for large datasets
- [x] Add search performance monitoring

## Deleted Jobs Management System ✅
- [x] Modify soft delete to append timestamp to job_number (e.g., "JOB123" → "JOB123_DEL_20250127")
- [x] Add database indexes for deleted job queries
- [x] Create migration script for existing deleted jobs
- [x] Add validation to prevent conflicts on restore
- [x] Create new "Deleted Jobs" section in admin SPA navigation
- [x] Build deleted jobs table with original job_number display
- [x] Add search capability within deleted jobs
- [x] Show deletion date and user who deleted
- [x] Create restore endpoint that removes "_DEL_timestamp" suffix
- [x] Add restore button with confirmation dialog
- [x] Validate no active job exists with same number before restore
- [x] Add restore success notifications
- [x] Add "permanent delete" option with double confirmation
- [x] Cascade delete related fieldwork entries
- [x] Add audit log entry for permanent deletions
- [x] Implement "are you absolutely sure?" dialog

---

# 🚧 **PHASE 1: Foundation Enhancement** 
*Complete the core system stability*

## A. Dual Job Input System (PRIORITY)
**Goal**: Allow job creation via either address OR parcel ID

### Database Schema Enhancement
- [ ] Add `parcel_id` field to Job model (nullable string)
- [ ] Add `input_type` field to Job model ('address' or 'parcel')
- [ ] Create database migration for new fields
- [ ] Update Job.to_dict() method to include new fields

### Backend API Updates
- [ ] Modify job creation endpoint to handle both input types
- [ ] Add parcel ID validation and formatting
- [ ] Update job update endpoint for both input types
- [ ] Create parcel lookup stub endpoint (for Phase 2)

### Frontend Modal Structure
- [ ] Create job input type selector (toggle: Address/Parcel ID)
- [ ] Build conditional form display based on selection
- [ ] Update create job modal with dual input capability
- [ ] Modify edit job modal to handle both types

### Display Logic Updates
- [ ] Update job table to show appropriate identifier (address vs parcel)
- [ ] Modify map popup to display correct information
- [ ] Update search to include parcel ID field
- [ ] Add visual indicators for job input type

## B. User Experience Polish
**Goal**: Improve interface responsiveness and feedback

### Toast Notification System
- [ ] Replace all alert() calls with toast notifications
- [ ] Add success, error, warning, and info toast types
- [ ] Implement toast queue and auto-dismiss timers
- [ ] Add toast accessibility features

### Loading States & Validation
- [ ] Add skeleton screens for search results
- [ ] Add button loading states for form submissions
- [ ] Create network error handling
- [ ] Add client-side validation for job creation/editing
- [ ] Implement real-time validation feedback
- [ ] Add server-side validation error display
- [ ] Create validation for parcel ID format

---

# 🗺️ **PHASE 2: Parcel Integration & Map Enhancement**
*Complete the parcel system and improve map interface*

## A. Parcel ID Integration System
**Goal**: Full parcel ID support with property appraiser integration

### Property Appraiser API Integration
- [ ] Research and integrate Orange County property appraiser API
- [ ] Add Brevard County property appraiser integration
- [ ] Implement Seminole, Lake, and Osceola county APIs
- [ ] Create county detection from parcel ID format

### Geocoding from Parcel ID
- [ ] Extract coordinates from property records
- [ ] Store lat/lng when parcel ID is used instead of address
- [ ] Implement fallback geocoding if property record lacks coordinates

### Parcel Validation & Formatting
- [ ] Create parcel ID format validation per county
- [ ] Implement auto-formatting (e.g., add dashes, leading zeros)
- [ ] Add parcel ID verification against county records
- [ ] Create error messages for invalid parcel IDs

### Enhanced Job Display
- [ ] Add property appraiser link generation

## B. Map Interface Improvements
**Goal**: Better map UX and mobile experience

### Enhanced Job Creation from Map
- [ ] Improve click-to-create workflow with better UX

### Route Planning Integration
- [ ] Integrate with Google Maps for route planning, at least show the route on my map

### Mobile Map Experience
- [ ] Optimize map controls for touch devices
- [ ] Add GPS location button for field crews

---

# 📊 **PHASE 3: Dashboard & Analytics**
*Improve business insights and reporting*

## A. Enhanced Dashboard
**Goal**: Real-time operational insights

### Key Metrics Display
- [ ] Show today's scheduled fieldwork
- [ ] Add weather integration for fieldwork planning

### Performance Indicators
- [ ] Track jobs by status with time in status
- [ ] Display productivity trends

### Real-Time Updates
- [ ] Auto-refresh dashboard every 5 minutes
- [ ] Add manual refresh button
- [ ] Show last updated timestamp

## B. Data Quality & Maintenance
**Goal**: System health and data integrity

### Data Validation
- [ ] Implement duplicate job detection
- [ ] Create incomplete job identification

### System Maintenance Tools
- [ ] Create database cleanup utilities
- [ ] Add cache management tools
- [ ] Implement log rotation and cleanup
- [ ] Create system health monitoring

### Backup & Recovery
- [ ] Implement automated daily backups
- [ ] Create backup verification processes
- [ ] Add point-in-time recovery capabilities
- [ ] Create disaster recovery procedures

---

# 🔌 **PHASE 4: Integration & Production**
*External integrations and deployment readiness*

## A. Outlook Calendar Integration
**Goal**: Seamless calendar synchronization

### Calendar Connection
- [ ] Implement Outlook API integration
- [ ] Add OAuth authentication for calendar access
- [ ] Create calendar permission management
- [ ] Test with multiple Outlook account types

### Appointment Synchronization
- [ ] Sync fieldwork entries to calendar
- [ ] Create calendar events for job deadlines
- [ ] Implement two-way sync for schedule changes

### Schedule Management
- [ ] Add conflict detection for double-booked time
- [ ] Create availability checking before scheduling
- [ ] Implement automatic rescheduling suggestions
- [ ] Add calendar view within the application

## B. Mobile & Field Crew Interface
**Goal**: Better mobile experience for field work

### Field Crew Interface
- [ ] Create simplified mobile interface for crews
- [ ] Add quick fieldwork entry forms
- [ ] Implement GPS location capture

### Cross-Device Synchronization
- [ ] Ensure real-time sync across devices
- [ ] Create session management across devices
- [ ] Implement automatic logout on multiple devices

## C. Security & Production Readiness
**Goal**: Production-ready security and deployment

### Authentication Enhancements
- [ ] Create login attempt monitoring
- [ ] Add IP address restrictions if needed

### Data Security
- [ ] Implement HTTPS enforcement
- [ ] Add data encryption for sensitive fields
- [ ] Create secure file upload handling
- [ ] Add SQL injection prevention review

### Production Deployment
- [ ] Create production server configuration
- [ ] Set up SSL certificates
- [ ] Configure production database
- [ ] Implement environment variable management

---

# 🎯 **SUCCESS METRICS BY PHASE**

**Phase 1 (Foundation Enhancement)**:
- ✅ Dual input system (address/parcel) working in all modals
- ✅ Toast notifications replace all alert() calls
- ✅ Real-time form validation working
- ✅ Loading states implemented across the application

**Phase 2 (Parcel Integration)**:
- ✅ Parcel ID integration working for all 5 counties
- ✅ Jobs created via parcel ID automatically geocoded
- ✅ Enhanced job management workflows reduce creation time by 50%
- ✅ Mobile map experience optimized

**Phase 3 (Dashboard & Analytics)**:
- ✅ Dashboard provides actionable daily operational insights
- ✅ System maintains < 500ms response times under normal load
- ✅ Automated backup system operational

**Phase 4 (Integration & Production)**:
- ✅ Outlook calendar integration syncs fieldwork automatically
- ✅ Mobile web app works for basic field crew operations
- ✅ System deployed to production with 99.9% uptime monitoring

---

# 📝 **QUICK REFERENCE**

**Current Status**: Phase 1 ready to begin
**Next Priority**: Dual Job Input System (A)
**Estimated Phase 1 Duration**: 1-2 weeks
**Critical Dependencies**: Parcel integration depends on dual input system

**Development Approach**: Feature-first, user-focused development with emphasis on completing full workflows before moving to next phase.