# Epic Map - UAT Test Case Templates and Execution Forms

## Document Information
- **Document Version**: 1.0
- **Created Date**: August 19, 2025
- **Related Document**: UAT Master Plan
- **Purpose**: Standardized templates for UAT test case creation and execution

---

## 1. Test Case Template Structure

### 1.1 Standard Test Case Format

```
TEST CASE ID: [Unique identifier - Format: TS###-TC###]
TEST SUITE: [Test suite category]
TEST TITLE: [Brief descriptive title]
PRIORITY: [Critical/High/Medium/Low]
CREATED BY: [Tester name]
CREATED DATE: [Date]
REVIEWED BY: [Reviewer name]
APPROVED DATE: [Date]

BUSINESS REQUIREMENT:
[Reference to business requirement or user story]

TEST OBJECTIVE:
[What this test is designed to validate]

PRECONDITIONS:
[System state and data required before test execution]

TEST STEPS:
Step 1: [Action to perform]
Step 2: [Action to perform]
Step 3: [Action to perform]
...

EXPECTED RESULTS:
[What should happen when test is executed correctly]

UNEXPECTED BEHAVIOR (Common Issues):
[Known edge cases or potential failure scenarios]

TEST DATA:
[Specific data values needed for test execution]

PASS/FAIL CRITERIA:
[Clear criteria for determining test success]

NOTES:
[Additional information, dependencies, or special considerations]
```

### 1.2 Test Case Execution Record

```
EXECUTION DATE: [Date test was performed]
EXECUTED BY: [Tester name]
ENVIRONMENT: [UAT/Staging/Production-like]
BROWSER/DEVICE: [Chrome/Firefox/iPhone/etc.]

ACTUAL RESULTS:
[What actually happened during test execution]

STATUS: [PASS/FAIL/BLOCKED/SKIP]

DEFECTS FOUND:
[Reference to any defects discovered - Defect ID]

COMMENTS:
[Additional observations or notes]

RETEST REQUIRED: [Yes/No]
RETEST DATE: [If applicable]
RETEST RESULT: [PASS/FAIL]
```

---

## 2. Test Execution Tracking Forms

### 2.1 Test Suite Execution Summary

| Test Suite | Total Cases | Executed | Passed | Failed | Blocked | % Complete | Comments |
|------------|-------------|----------|---------|--------|---------|------------|----------|
| TS001 - Authentication | 15 | 15 | 14 | 1 | 0 | 100% | 1 minor login issue |
| TS002 - Map Interface | 25 | 20 | 18 | 2 | 0 | 80% | In progress |
| TS003 - Job Management | 30 | 0 | 0 | 0 | 0 | 0% | Not started |
| **TOTALS** | **70** | **35** | **32** | **3** | **0** | **50%** | |

### 2.2 Daily Test Execution Log

```
TESTING DATE: [Date]
TESTER: [Name]
ENVIRONMENT: [UAT Environment URL/Version]
TESTING SESSION: [Morning/Afternoon/Evening]

PLANNED TESTS:
- [ ] Test Case ID 1
- [ ] Test Case ID 2
- [ ] Test Case ID 3

COMPLETED TESTS:
✓ Test Case ID 1 - PASSED
✗ Test Case ID 2 - FAILED (Defect #001)
⚠ Test Case ID 3 - BLOCKED (Environment issue)

ISSUES ENCOUNTERED:
1. [Description of issue and impact]
2. [Description of issue and impact]

NEXT STEPS:
- [Action items for next testing session]
```

### 2.3 Cross-Platform Testing Matrix

| Test Case | Windows Chrome | Windows Firefox | Mac Safari | iPhone Safari | Android Chrome | Status |
|-----------|----------------|-----------------|------------|---------------|----------------|---------|
| TC001-Login | PASS | PASS | PASS | PENDING | PENDING | 60% |
| TC002-MapLoad | PASS | FAIL | PASS | PENDING | PENDING | 40% |
| TC003-JobCreate | PENDING | PENDING | PENDING | PENDING | PENDING | 0% |

---

## 3. User-Friendly Test Case Examples

### 3.1 Example Test Case - Simple Login

```
TEST CASE ID: TS001-TC001
TEST SUITE: Authentication & User Management
TEST TITLE: User Login with Valid Credentials
PRIORITY: Critical

BUSINESS REQUIREMENT:
Users must be able to log into the system using their username and password to access Epic Map features.

TEST OBJECTIVE:
Verify that a user can successfully log into the system with correct credentials.

PRECONDITIONS:
- Epic Map application is accessible
- Test user account exists (username: testuser, password: TestPass123)
- User is not already logged in

TEST STEPS:
Step 1: Open web browser and navigate to Epic Map login page
Step 2: Enter "testuser" in the Username field
Step 3: Enter "TestPass123" in the Password field
Step 4: Click the "Login" button

EXPECTED RESULTS:
- User is redirected to the main map interface
- Map loads and displays properly
- User's name appears in the top navigation area
- No error messages are displayed

UNEXPECTED BEHAVIOR (Common Issues):
- Error message appears despite correct credentials
- Page redirects to login again instead of map
- Map fails to load after successful login
- Browser shows security warnings

TEST DATA:
Username: testuser
Password: TestPass123

PASS/FAIL CRITERIA:
PASS: User successfully logs in and reaches the main map interface
FAIL: Login fails, error messages appear, or map doesn't load

NOTES:
This test should work on all supported browsers and devices.
```

### 3.2 Example Test Case - Mobile Map Interaction

```
TEST CASE ID: TS002-TC005
TEST SUITE: Map Interface & Navigation
TEST TITLE: Touch Interaction with Job Markers on Mobile
PRIORITY: High

BUSINESS REQUIREMENT:
Field workers using mobile devices must be able to tap on job markers to view job details.

TEST OBJECTIVE:
Verify that job markers can be tapped on mobile devices to open job detail modals.

PRECONDITIONS:
- User is logged into Epic Map on a mobile device
- Map is displaying with at least 3 visible job markers
- Mobile device has touch screen capability

TEST STEPS:
Step 1: Open Epic Map on mobile device (iPhone or Android)
Step 2: Locate a job marker on the map (colored dot/pin)
Step 3: Tap once on the job marker
Step 4: Observe the response

EXPECTED RESULTS:
- Job detail modal opens immediately after tap
- Modal displays job information (address, status, client)
- Modal is properly sized for mobile screen
- User can scroll through job details if needed
- Modal has visible close button (X)

UNEXPECTED BEHAVIOR (Common Issues):
- Marker doesn't respond to tap
- Wrong job details appear in modal
- Modal opens but is cut off or improperly sized
- Modal opens but cannot be closed
- Multiple taps required to open modal

TEST DATA:
Any existing job marker on the map

PASS/FAIL CRITERIA:
PASS: Single tap opens correct job details in properly formatted modal
FAIL: Tap doesn't work, wrong details appear, or modal has display issues

NOTES:
Test on both iPhone and Android devices if possible.
Finger tap should be sufficient - stylus not required.
```

### 3.3 Example Test Case - Job Creation Workflow

```
TEST CASE ID: TS003-TC002
TEST SUITE: Job Management - Basic Operations
TEST TITLE: Create New Address-Based Job
PRIORITY: Critical

BUSINESS REQUIREMENT:
Users must be able to create new survey jobs by entering an address location.

TEST OBJECTIVE:
Verify that users can successfully create a new job using an address.

PRECONDITIONS:
- User is logged into Epic Map
- User has permission to create jobs
- Map interface is loaded and responsive

TEST STEPS:
Step 1: Click the "+" (plus) button on the map interface
Step 2: Select "Create New Job" from the menu
Step 3: Choose "Address-Based Job" option
Step 4: Enter "123 Main Street, Orlando, FL 32801" in the address field
Step 5: Enter "ABC Company" in the Client field
Step 6: Select "Survey Requested" from the Status dropdown
Step 7: Click "Create Job" button

EXPECTED RESULTS:
- Job creation modal opens after clicking plus button
- Address field accepts the entered address
- System finds and displays the address location on map
- Client field accepts the company name
- Status dropdown shows all available status options
- New job appears on the map as a marker
- Job number is automatically assigned
- Success message confirms job creation

UNEXPECTED BEHAVIOR (Common Issues):
- Plus button doesn't open menu
- Address not found or wrong location shown
- Required fields not clearly marked
- Job creation fails without clear error message
- New job marker doesn't appear on map
- System allows creation with missing required information

TEST DATA:
Address: 123 Main Street, Orlando, FL 32801
Client: ABC Company
Status: Survey Requested

PASS/FAIL CRITERIA:
PASS: Job is created successfully with correct information and appears on map
FAIL: Job creation fails, incorrect information saved, or marker doesn't appear

NOTES:
Verify the job can be found by searching after creation.
Check that job number follows expected format.
```

---

## 4. Specialized Testing Templates

### 4.1 Performance Testing Template

```
TEST CASE ID: TS007-TC001
TEST TITLE: Map Loading Performance
PRIORITY: High

PERFORMANCE REQUIREMENT:
Map should load within 3 seconds on standard internet connection.

TEST STEPS:
Step 1: Clear browser cache
Step 2: Start timer
Step 3: Navigate to Epic Map login page
Step 4: Log in with valid credentials
Step 5: Stop timer when map fully loads with all markers visible

MEASUREMENT CRITERIA:
- Start time: When login button is clicked
- End time: When map displays with all job markers loaded
- Acceptable: Under 3 seconds
- Target: Under 2 seconds

ENVIRONMENT CONDITIONS:
- Standard business internet connection
- Desktop computer or equivalent mobile device
- No other heavy applications running

NOTES:
Perform test 3 times and record average time.
```

### 4.2 Error Handling Testing Template

```
TEST CASE ID: TS007-TC015
TEST TITLE: Invalid Login Credentials Error Handling
PRIORITY: Medium

ERROR SCENARIO:
User enters incorrect username or password.

TEST STEPS:
Step 1: Navigate to login page
Step 2: Enter "wronguser" in username field
Step 3: Enter "wrongpass" in password field
Step 4: Click login button

EXPECTED ERROR BEHAVIOR:
- Clear error message appears: "Invalid username or password"
- User remains on login page
- Username and password fields are cleared
- No system errors or crashes occur
- Message disappears when user starts typing again

UNEXPECTED BEHAVIOR TO AVOID:
- System crashes or shows technical error codes
- Page redirects without explanation
- Error message is confusing or technical
- System locks user account after one attempt
- Browser security warnings appear

PASS/FAIL CRITERIA:
PASS: Clear, user-friendly error message with appropriate system response
FAIL: Confusing errors, system crashes, or inappropriate security responses
```

---

## 5. Test Execution Guidelines

### 5.1 Before Starting Testing

#### Preparation Checklist
- [ ] Test environment is accessible and stable
- [ ] Test data is prepared and validated
- [ ] Testing device/browser is configured properly
- [ ] Test cases are reviewed and understood
- [ ] Defect tracking system is ready
- [ ] Communication channels are established

#### Environment Verification
- [ ] Application loads without errors
- [ ] Test user accounts are active
- [ ] Sample data is present and realistic
- [ ] All required features are deployed
- [ ] Performance is acceptable for testing

### 5.2 During Test Execution

#### Best Practices
1. **Follow test steps exactly** - Don't skip or modify steps unless documented
2. **Record everything** - Document both expected and unexpected results
3. **Take screenshots** - Capture evidence of failures or unusual behavior
4. **Test with fresh perspective** - Consider how a new user would interact
5. **Don't assume knowledge** - Test as if you've never used the system

#### When Tests Fail
1. **Re-read the test case** - Ensure steps were followed correctly
2. **Try again** - Some failures might be environmental
3. **Document the failure** - Record what happened vs. what was expected
4. **Take screenshots** - Visual evidence helps developers understand issues
5. **Create defect report** - Use standard defect template
6. **Mark test as failed** - Don't mark as passed if any issues occurred

### 5.3 After Test Execution

#### Completion Tasks
- [ ] Update test execution records
- [ ] File defect reports for any failures
- [ ] Update test status in tracking system
- [ ] Communicate significant findings to team
- [ ] Plan retesting for resolved defects

---

## 6. Test Data Management

### 6.1 Standard Test Data Sets

#### User Accounts
```
Regular User:
Username: testuser
Password: TestPass123
Role: User

Admin User:
Username: testadmin
Password: AdminPass123
Role: Admin

New User (for creation tests):
Username: newuser
Password: NewPass123
Role: User
```

#### Test Addresses
```
Valid Addresses for Job Creation:
- 123 Main Street, Orlando, FL 32801
- 456 Oak Avenue, Melbourne, FL 32901
- 789 Pine Road, Titusville, FL 32780

Invalid Addresses for Error Testing:
- 999 Nonexistent Street, Nowhere, FL 99999
- Invalid Address Format Test
- (blank address field)
```

#### Sample Job Data
```
Job 1:
Address: 123 Main Street, Orlando, FL 32801
Client: ABC Surveying Company
Status: Survey Requested
Notes: Standard boundary survey needed

Job 2:
Address: 456 Oak Avenue, Melbourne, FL 32901
Client: XYZ Development Corp
Status: In Progress
Notes: Topographic survey for development
```

### 6.2 Test Data Reset Procedures

#### Before Each Test Session
1. Verify test user accounts are active
2. Confirm sample jobs are present
3. Check that no test jobs remain from previous sessions
4. Validate map loads with expected markers

#### After Each Test Session
1. Delete any test jobs created during testing
2. Reset user passwords if changed during testing
3. Clear any test data that might affect future tests
4. Document any permanent data changes needed

---

## 7. Accessibility and Usability Testing

### 7.1 Usability Testing Checklist

#### Navigation and User Experience
- [ ] Can new users find main features without training?
- [ ] Are button labels clear and descriptive?
- [ ] Is the workflow logical and intuitive?
- [ ] Can users complete tasks without getting confused?
- [ ] Are error messages helpful and actionable?

#### Visual Design and Layout
- [ ] Is text readable on all screen sizes?
- [ ] Are clickable elements obviously clickable?
- [ ] Is important information prominently displayed?
- [ ] Do colors and contrast meet accessibility standards?
- [ ] Are loading indicators clear when system is processing?

### 7.2 Mobile-Specific Testing

#### Touch Interface Testing
- [ ] All buttons are easily tappable (minimum 44px)
- [ ] Swipe gestures work smoothly
- [ ] Pinch-to-zoom functions properly on map
- [ ] Long press actions work as expected
- [ ] No accidental activations from palm touches

#### Mobile Layout Testing
- [ ] Content fits screen without horizontal scrolling
- [ ] Text remains readable without zooming
- [ ] Modals display properly on small screens
- [ ] Navigation elements are accessible with thumbs
- [ ] Form inputs don't cause page zoom on iOS

---

## 8. Regression Testing Framework

### 8.1 Smoke Test Suite (Quick Validation)

Critical functions to test after any system changes:
- [ ] User can log in successfully
- [ ] Map loads and displays job markers
- [ ] User can create a new job
- [ ] Job details modal opens and displays correctly
- [ ] Basic search functionality works
- [ ] User can log out successfully

### 8.2 Core Regression Tests

Execute when major features are modified:
- All authentication and user management tests
- All basic job management operations
- All map interface and navigation tests
- All mobile functionality tests

### 8.3 Full Regression Testing

Execute before production releases:
- Complete execution of all test suites
- Cross-platform compatibility verification
- Performance validation
- Error handling verification

---

This template framework provides the foundation for comprehensive, user-friendly UAT testing that can be adapted and expanded as Epic Map evolves. The templates prioritize clarity and completeness while remaining accessible to non-technical users.