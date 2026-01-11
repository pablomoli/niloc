/* global window, module */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.SearchUtils = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    function normalizeJobNumber(value) {
        return String(value || '').trim().toLowerCase();
    }

    function getJobNumber(job) {
        if (!job) return '';
        return job.display_job_number || job.job_number || job.original_job_number || '';
    }

    function selectJobMatches(searchTerm, allJobs, filteredJobs) {
        const term = normalizeJobNumber(searchTerm);
        if (!term) {
            return { matches: [], exactMatch: false };
        }

        const safeAllJobs = Array.isArray(allJobs) ? allJobs : [];
        const exactMatches = safeAllJobs.filter(job => normalizeJobNumber(getJobNumber(job)) === term);
        if (exactMatches.length > 0) {
            return { matches: exactMatches, exactMatch: true };
        }

        const sourceJobs = Array.isArray(filteredJobs) ? filteredJobs : safeAllJobs;
        const matches = sourceJobs.filter(job => normalizeJobNumber(getJobNumber(job)).includes(term));
        return { matches, exactMatch: false };
    }

    return {
        normalizeJobNumber,
        getJobNumber,
        selectJobMatches
    };
}));
