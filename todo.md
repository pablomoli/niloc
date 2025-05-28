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
- Admin dashboard with basic metrics (no complex analytics needed)
- User management with role-based permissions
- Address geocoding and parcel ID lookup (Orange, Brevard, Seminole, Lake, Osceola counties)
- Real-time search/filtering across all jobs in database

STATUS WORKFLOW:
8 job statuses from "On Hold/Pending" through "Completed/To Be Filed" plus "Estimate/Quote Available"

PRIORITY FEATURES:

- Real-time search across all jobs (performance is not a concern)
- Dual job input: address-based OR parcel ID-based with separate UI flows
- Deleted jobs management with restoration capability
- Basic mobile-responsive design (office-focused tool)
- Simple fieldwork tracking for crews
- Outlook calendar integration only

KNOWN ARCHITECTURE:

- app.py: Main Flask app with backward compatibility routes
- api_routes.py: Consolidated RESTful API endpoints
- admin/routes.py: Admin view routes and API proxies
- map.js: Enhanced Leaflet map with clustering and multi-select
- admin_spa.js: Admin SPA controller with caching and filtering
- models.py: SQLAlchemy models with relationship management

# 🚀 EpicMap Streamlined Sprint Plan - Feature-First Development

## 📅 Sprint 1: Core System Stability (Week 1)

**Focus**: Fix critical bugs and establish solid foundation

### 1. Real-Time Search & Filtering System

**1a. Backend Search Architecture**

- [ ] Remove pagination limitations - always search ALL jobs in database
- [ ] Create unified search endpoint that handles job_number, client, address, parcel_id
- [ ] Implement efficient database indexing for search fields
- [ ] Add fuzzy matching for partial searches

**1b. Frontend Real-Time Search**

- [ ] Remove complex `hasAllJobs` logic and pagination conflicts
- [ ] Implement instant search with 150ms debounce on input changes
- [ ] Add search result highlighting and match indicators
- [ ] Create "X results found" display with clear filters button

**1c. Filter State Management**

- [ ] Simplify admin_spa.js to single filter state object
- [ ] Remove conflicting pagination vs search logic
- [ ] Implement proper loading states during search
- [ ] Add URL state persistence for search results

**1d. Performance Optimization**

- [ ] Add database indexes on job_number, client, address, parcel_id
- [ ] Implement search result caching (5-minute TTL)
- [ ] Optimize SQL queries for large datasets
- [ ] Add search performance monitoring

### 2. Deleted Jobs Management System

**2a. Database Schema Updates**

- [ ] Modify soft delete to append timestamp to job_number (e.g., "JOB123" → "JOB123_DEL_20250127")
- [ ] Add database indexes for deleted job queries
- [ ] Create migration script for existing deleted jobs
- [ ] Add validation to prevent conflicts on restore

**2b. Deleted Jobs Interface**

- [ ] Create new "Deleted Jobs" section in admin SPA navigation
- [ ] Build deleted jobs table with original job_number display
- [ ] Add search capability within deleted jobs
- [ ] Show deletion date and user who deleted

**2c. Restore Functionality**

- [ ] Create restore endpoint that removes "\_DEL_timestamp" suffix
- [ ] Add restore button with confirmation dialog
- [ ] Validate no active job exists with same number before restore
- [ ] Add restore success notifications

**2d. Permanent Deletion (Admin Only)**

- [ ] Add "permanent delete" option with double confirmation
- [ ] Cascade delete related fieldwork entries
- [ ] Add audit log entry for permanent deletions
- [ ] Implement "are you absolutely sure?" dialog

### 3. Dual Job Input System Foundation

**3a. Database Schema Enhancement**

- [ ] Add `parcel_id` field to Job model (nullable string)
- [ ] Add `input_type` field to Job model ('address' or 'parcel')
- [ ] Create database migration for new fields
- [ ] Update Job.to_dict() method to include new fields

**3b. Backend API Updates**

- [ ] Modify job creation endpoint to handle both input types
- [ ] Add parcel ID validation and formatting
- [ ] Update job update endpoint for both input types
- [ ] Create parcel lookup stub endpoint (for Sprint 2)

**3c. Frontend Modal Structure**

- [ ] Create job input type selector (toggle: Address/Parcel ID)
- [ ] Build conditional form display based on selection
- [ ] Update create job modal with dual input capability
- [ ] Modify edit job modal to handle both types

**3d. Display Logic Updates**

- [ ] Update job table to show appropriate identifier (address vs parcel)
- [ ] Modify map popup to display correct information
- [ ] Update search to include parcel ID field
- [ ] Add visual indicators for job input type

### 4. Error Handling & UX Polish

**4a. Toast Notification System**

- [ ] Replace all alert() calls with toast notifications
- [ ] Add success, error, warning, and info toast types
- [ ] Implement toast queue and auto-dismiss timers
- [ ] Add toast accessibility features

**4b. Loading States**

- [ ] Add skeleton screens for search results
- [ ] Implement search loading indicators
- [ ] Add button loading states for form submissions
- [ ] Create network error handling

**4c. Form Validation**

- [ ] Add client-side validation for job creation/editing
- [ ] Implement real-time validation feedback
- [ ] Add server-side validation error display
- [ ] Create validation for parcel ID format

**4d. Mobile Responsiveness**

- [ ] Ensure admin panel works on tablets
- [ ] Optimize touch interactions for mobile
- [ ] Test dual input forms on mobile devices
- [ ] Improve modal display on small screens

---

## 📅 Sprint 2: Parcel Integration & Enhanced Job Management (Week 2)

**Focus**: Complete parcel ID system and improve workflows

### 5. Parcel ID Integration System

**5a. Property Appraiser API Integration**

- [ ] Research and integrate Orange County property appraiser API
- [ ] Add Brevard County property appraiser integration
- [ ] Implement Seminole, Lake, and Osceola county APIs
- [ ] Create county detection from parcel ID format

**5b. Geocoding from Parcel ID**

- [ ] Extract coordinates from property records
- [ ] Store lat/lng when parcel ID is used instead of address
- [ ] Implement fallback geocoding if property record lacks coordinates
- [ ] Add property boundary data if available

**5c. Parcel Validation & Formatting**

- [ ] Create parcel ID format validation per county
- [ ] Implement auto-formatting (e.g., add dashes, leading zeros)
- [ ] Add parcel ID verification against county records
- [ ] Create error messages for invalid parcel IDs

**5d. Enhanced Job Display**

- [ ] Show property owner information when available
- [ ] Display parcel acreage and zoning information
- [ ] Add property appraiser link generation
- [ ] Create parcel-specific job details layout

### 6. Advanced Job Management

**6a. Bulk Operations**

- [ ] Add multi-select checkboxes to job tables
- [ ] Implement bulk status updates for selected jobs
- [ ] Create bulk delete with confirmation
- [ ] Add bulk restore for deleted jobs

**6b. Job Templates**

- [ ] Create simple job templates for common survey types
- [ ] Add template selection in job creation modal
- [ ] Implement template field pre-population
- [ ] Create template management interface

**6c. Enhanced Search Features**

- [ ] Add date range filtering (created, modified)
- [ ] Implement crew member filtering
- [ ] Add map bounds filtering (jobs within visible area)
- [ ] Create saved search functionality

**6d. Quick Actions**

- [ ] Add keyboard shortcuts for common actions (Ctrl+N for new job)
- [ ] Implement right-click context menus
- [ ] Create quick status change buttons
- [ ] Add "duplicate job" functionality

### 7. Map Interface Improvements

**7a. Enhanced Job Creation from Map**

- [ ] Improve click-to-create workflow with better UX
- [ ] Add automatic address lookup from coordinates
- [ ] Implement parcel ID lookup from map coordinates
- [ ] Create visual feedback for creation mode

**7b. Map Display Enhancements**

- [ ] Add different marker styles for parcel vs address jobs
- [ ] Implement job clustering by type/status
- [ ] Add property boundary overlays when available
- [ ] Create custom map controls for job management

**7c. Route Planning Integration**

- [ ] Integrate with Google Maps for route planning
- [ ] Add estimated travel time between jobs
- [ ] Create printable route sheets
- [ ] Implement route optimization for multiple jobs

**7d. Mobile Map Experience**

- [ ] Optimize map controls for touch devices
- [ ] Add GPS location button for field crews
- [ ] Implement simple offline job viewing
- [ ] Create location sharing functionality

### 8. Fieldwork Enhancement

**8a. Daily Time Tracking**

- [ ] Add daily fieldwork summary per job
- [ ] Calculate total hours spent per day across all jobs
- [ ] Create crew daily time reports
- [ ] Add time tracking validation (no overlapping entries)

**8b. Fieldwork Mobile Interface**

- [ ] Create mobile-optimized fieldwork entry forms
- [ ] Add timer functionality for real-time tracking
- [ ] Implement GPS location logging for fieldwork
- [ ] Create quick fieldwork templates

**8c. Crew Management**

- [ ] Add crew member profiles and contact info
- [ ] Implement crew assignment to jobs
- [ ] Create crew availability tracking
- [ ] Add crew productivity metrics

**8d. Equipment Tracking**

- [ ] Add equipment checkout/checkin to fieldwork
- [ ] Track drone usage and maintenance
- [ ] Create equipment availability calendar
- [ ] Add equipment cost tracking

---

## 📅 Sprint 3: Dashboard, Reporting & Basic Analytics (Week 3)

**Focus**: Useful business insights and data visualization

### 9. Enhanced Dashboard

**9a. Key Metrics Display**

- [ ] Add job completion rate metrics
- [ ] Show average time per job type
- [ ] Display crew utilization rates
- [ ] Create monthly/weekly completion trends

**9b. Daily Operations Overview**

- [ ] Show today's scheduled fieldwork
- [ ] Display jobs requiring attention (overdue, stuck in status)
- [ ] Add weather integration for fieldwork planning
- [ ] Create daily crew assignment overview

**9c. Performance Indicators**

- [ ] Track jobs by status with time in status
- [ ] Show bottlenecks in workflow
- [ ] Display productivity trends
- [ ] Add efficiency recommendations

**9d. Real-Time Updates**

- [ ] Auto-refresh dashboard every 5 minutes
- [ ] Add manual refresh button
- [ ] Show last updated timestamp
- [ ] Implement push notifications for urgent items

### 10. Basic Reporting System

**10a. Executive Summary Reports**

- [ ] Create monthly job completion reports
- [ ] Add crew productivity summaries
- [ ] Generate client activity reports
- [ ] Create revenue per job type analysis

**10b. Operational Reports**

- [ ] Build fieldwork time tracking reports
- [ ] Create job status progression reports
- [ ] Add equipment utilization reports
- [ ] Generate bottleneck analysis reports

**10c. Export Functionality**

- [ ] Add PDF export for all reports
- [ ] Implement Excel export with formatting
- [ ] Create CSV export for data analysis
- [ ] Add email delivery of reports

**10d. Report Scheduling**

- [ ] Create weekly automated reports
- [ ] Add monthly summary generation
- [ ] Implement report email subscriptions
- [ ] Create custom report intervals

### 11. Data Quality & Maintenance

**11a. Data Validation**

- [ ] Add data quality checks and warnings
- [ ] Implement duplicate job detection
- [ ] Create incomplete job identification
- [ ] Add data consistency validation

**11b. System Maintenance Tools**

- [ ] Create database cleanup utilities
- [ ] Add cache management tools
- [ ] Implement log rotation and cleanup
- [ ] Create system health monitoring

**11c. Backup & Recovery**

- [ ] Implement automated daily backups
- [ ] Create backup verification processes
- [ ] Add point-in-time recovery capabilities
- [ ] Create disaster recovery procedures

**11d. Performance Monitoring**

- [ ] Add database performance monitoring
- [ ] Implement API response time tracking
- [ ] Create slow query identification
- [ ] Add system resource monitoring

### 12. User Experience Polish

**12a. Advanced UI Features**

- [ ] Add dark mode toggle
- [ ] Implement user preferences storage
- [ ] Create customizable dashboard layouts
- [ ] Add accessibility improvements

**12b. Help & Documentation**

- [ ] Create in-app help tooltips
- [ ] Add user guide integration
- [ ] Implement feature tour for new users
- [ ] Create video tutorial links

**12c. Keyboard & Power User Features**

- [ ] Add comprehensive keyboard shortcuts
- [ ] Create command palette (Ctrl+K style)
- [ ] Implement quick search across all data
- [ ] Add power user mode with advanced features

**12d. Notification System**

- [ ] Add in-app notification center
- [ ] Implement email notifications for key events
- [ ] Create notification preferences
- [ ] Add notification history

---

## 📅 Sprint 4: Integration & Production Ready (Week 4)

**Focus**: External integrations and deployment preparation

### 13. Outlook Calendar Integration

**13a. Calendar Connection**

- [ ] Implement Outlook API integration
- [ ] Add OAuth authentication for calendar access
- [ ] Create calendar permission management
- [ ] Test with multiple Outlook account types

**13b. Appointment Synchronization**

- [ ] Sync fieldwork entries to calendar
- [ ] Create calendar events for job deadlines
- [ ] Add automatic meeting creation for site visits
- [ ] Implement two-way sync for schedule changes

**13c. Schedule Management**

- [ ] Add conflict detection for double-booked time
- [ ] Create availability checking before scheduling
- [ ] Implement automatic rescheduling suggestions
- [ ] Add calendar view within the application

**13d. Team Coordination**

- [ ] Share fieldwork schedules with team members
- [ ] Add team calendar overlay
- [ ] Create scheduling notifications
- [ ] Implement schedule change alerts

### 14. Mobile Web App Optimization

**14a. Progressive Web App Features**

- [ ] Add service worker for offline capability
- [ ] Implement app manifest for home screen install
- [ ] Create push notification support
- [ ] Add background sync for fieldwork entries

**14b. Field Crew Interface**

- [ ] Create simplified mobile interface for crews
- [ ] Add quick fieldwork entry forms
- [ ] Implement GPS location capture
- [ ] Create offline job viewing capability

**14c. Mobile-Specific Features**

- [ ] Add camera integration for job photos
- [ ] Implement barcode scanning for equipment
- [ ] Create voice note capability
- [ ] Add digital signature capture

**14d. Cross-Device Synchronization**

- [ ] Ensure real-time sync across devices
- [ ] Add conflict resolution for simultaneous edits
- [ ] Create session management across devices
- [ ] Implement automatic logout on multiple devices

### 15. Security & Compliance

**15a. Authentication Enhancements**

- [ ] Add password complexity requirements
- [ ] Implement session timeout controls
- [ ] Create login attempt monitoring
- [ ] Add IP address restrictions if needed

**15b. Data Security**

- [ ] Implement HTTPS enforcement
- [ ] Add data encryption for sensitive fields
- [ ] Create secure file upload handling
- [ ] Add SQL injection prevention review

**15c. Access Control**

- [ ] Refine role-based permissions
- [ ] Add field-level access controls
- [ ] Create audit trail for sensitive operations
- [ ] Implement data access logging

**15d. Privacy & Compliance**

- [ ] Add data retention policy implementation
- [ ] Create user data export functionality
- [ ] Implement data deletion on request
- [ ] Add privacy policy integration

### 16. Production Deployment

**16a. Environment Setup**

- [ ] Create production server configuration
- [ ] Set up SSL certificates
- [ ] Configure production database
- [ ] Implement environment variable management

**16b. Monitoring & Logging**

- [ ] Add application performance monitoring
- [ ] Implement comprehensive logging
- [ ] Create error tracking and alerting
- [ ] Add uptime monitoring

**16c. Backup & Recovery**

- [ ] Set up automated production backups
- [ ] Create disaster recovery procedures
- [ ] Test backup restoration processes
- [ ] Implement database replication if needed

**16d. Documentation & Training**

- [ ] Create user training materials
- [ ] Add administrator documentation
- [ ] Create deployment and maintenance guides
- [ ] Add troubleshooting documentation

---

## 🎯 Success Metrics by Sprint

**Sprint 1**:

- ✅ Real-time search works across all jobs (< 300ms response)
- ✅ Deleted jobs fully manageable with restore functionality
- ✅ Dual input system (address/parcel) working in all modals

**Sprint 2**:

- ✅ Parcel ID integration working for all 5 counties
- ✅ Jobs created via parcel ID automatically geocoded
- ✅ Enhanced job management workflows reduce creation time by 50%

**Sprint 3**:

- ✅ Dashboard provides actionable daily operational insights
- ✅ Basic reports generate automatically and export cleanly
- ✅ System maintains < 500ms response times under normal load

**Sprint 4**:

- ✅ Outlook calendar integration syncs fieldwork automatically
- ✅ Mobile web app works offline for basic job viewing
- ✅ System deployed to production with 99.9% uptime monitoring

## 🔄 Sprint Dependencies & Risk Management

**Critical Path**: Sprint 1 → Sprint 2 → Sprint 4 (Sprint 3 can run parallel to Sprint 2)
**Highest Risk**: Parcel ID API integrations (county systems may be inconsistent)
**Mitigation Strategy**: Start with one county (Orange) in Sprint 1, expand in Sprint 2
**Fallback Plan**: Manual parcel entry if API integration fails for specific counties
