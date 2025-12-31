# Due Date Calendar (Dashboard)

## Goal

Add a monthly calendar grid to the Admin dashboard (below Business Metrics) that
shows the count of jobs with a due date on each day. Users can navigate months.
Clicking a day jumps to the Jobs tab with a due-date filter for that exact date.

## Proposed Behavior

- View: month grid only, with prev/next navigation.
- Data: show all jobs with a due date in the visible month.
- Marker: simple count/badge per day (color intensity maps to count).
- Interaction: click a day to open the Jobs tab filtered to that due date.
- Jobs tab: new due-date filter (ranges) and optional due-date sort.

## Answered Notes

- Jobs tab filter: ranges (not just exact date).
- Sorting: optional (do not force sort when filtering).
- Timezone: follow existing app behavior (see AdminUtils.parseDate appending `Z` on date-only strings).
- Data loading: choose the approach that fits existing performance patterns.

## Open Questions

1. Jobs tab filter ranges: what range types should we support (single day, week, month, custom start/end)?
   keep it simple, next day next week, next month.
2. Filter UI placement: near search bar, or as a filter chip row?
3. Calendar click behavior with ranges: click a day sets single-day range, or sets range for the whole week/month view?
   what? if you click a day in the calendar it shuld show you the jobs table with a filter on that specific day you clicked to see what jobs are due.
4. Timezone handling for due_date: keep date-only strings as UTC (current AdminUtils.parseDate), or treat as local date-only for display/filtering?
   figure it out.
5. Data loading: new lightweight endpoint returning counts per day for a month, or reuse /api/jobs and compute client-side?
   LOOK AT THE FUCKING CODE AND ANALYZE WHAT THE BEST OPTION IS

## Proposed Decisions (Based on Current Codebase)

- Filter UI placement: add a compact due-date filter control next to the existing Jobs search input (keeps filter state visible and consistent with current filtering UX).
- Timezone handling for due_date: treat as local date-only for display/filtering to avoid off-by-one day issues; do not run through AdminUtils.parseDate for due_date.
- Data loading for calendar counts: add a lightweight endpoint that returns per-day counts for the requested month (avoid downloading full job payloads; aligns with the existing `/admin/api/dashboard` pattern of summary data).

## Implementation Plan

1) API: monthly due-date counts
- Add a lightweight endpoint (e.g., `GET /api/jobs/due-dates?month=YYYY-MM`) that returns per-day counts for the requested month.
- Response shape: `{ "month": "YYYY-MM", "counts": { "YYYY-MM-DD": <int>, ... } }`
- Query only active jobs unless you want deleted included.
- Aggregate counts by `due_date` for the month range.

2) Dashboard calendar UI (Admin tab)
- Add a new section under Business Metrics in `templates/admin_spa.html`.
- Render a month grid with weekday headers and 5–6 rows.
- Show a badge with count (if >0) on each day; color intensity based on count buckets.
- Add prev/next month controls and a “Today” shortcut.

3) Dashboard calendar data flow
- Add Alpine state:
  - `calendarMonth` (Date or `YYYY-MM`)
  - `calendarCounts` (map of day → count)
  - `calendarLoading`
- Add methods:
  - `loadCalendarMonth(month)`
  - `prevMonth()` / `nextMonth()` / `goToCurrentMonth()`
  - `getCalendarGrid()` (builds grid with leading/trailing days)
- Load current month on dashboard activation; lazy-load on navigation.

4) Jobs tab: due-date range filter
- Add a compact filter control near the Jobs search input, matching the provided UI concept:
  - Button label: “Due Date: All” with a calendar icon.
  - Popover titled “Filter by Due Date” that includes:
    - A numeric input (e.g., “Next 7”) and a unit dropdown (Days/Weeks/Months).
    - Apply and Clear buttons.
- Add filter state:
  - `dueDateFilter` with `start` and `end` (ISO strings)
- Update `filterJobs()` to apply the due-date range when set.

5) Calendar → Jobs tab integration
- Clicking a day sets:
  - `dueDateFilter.start = YYYY-MM-DD`
  - `dueDateFilter.end = YYYY-MM-DD`
  - Switch to `jobs` tab
  - Trigger `filterJobs()` and optionally scroll to filters

6) Query behavior
- Calendar click uses exact day range.
- Quick ranges map to:
  - Next day: today → today+1
  - Next week: today → today+7
  - Next month: today → today+30 (or end of next calendar month).

7) Timezone handling
- Treat `due_date` as local date-only in UI and filtering.
- Compare ISO `YYYY-MM-DD` strings directly (don’t parse via AdminUtils).

8) Optional sort
- Add a “Sort by Due Date” option in Jobs sort controls if desired.
- Keep it optional; do not force sort when filter is active.

9) Manual validation checklist
- Dashboard loads current month counts quickly.
- Month navigation fetches counts lazily.
- Clicking a date jumps to Jobs tab with correct filter.
- Quick range filters update the jobs list properly.
- Due-date comparisons don’t shift a day.
