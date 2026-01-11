const test = require('node:test');
const assert = require('node:assert/strict');

const { selectJobMatches } = require('../../static/js/search-utils.js');

test('exact job number match ignores filtered jobs', () => {
    const allJobs = [
        { job_number: 'A-100' },
        { job_number: 'B-200' }
    ];
    const filteredJobs = [{ job_number: 'B-200' }];

    const result = selectJobMatches('A-100', allJobs, filteredJobs);
    assert.equal(result.exactMatch, true);
    assert.deepEqual(result.matches, [{ job_number: 'A-100' }]);
});

test('partial job number match respects filtered jobs', () => {
    const allJobs = [
        { job_number: 'A-100' },
        { job_number: 'A-200' }
    ];
    const filteredJobs = [{ job_number: 'A-200' }];

    const result = selectJobMatches('A-', allJobs, filteredJobs);
    assert.equal(result.exactMatch, false);
    assert.deepEqual(result.matches, [{ job_number: 'A-200' }]);
});

test('partial match returns empty when filters exclude jobs', () => {
    const allJobs = [{ job_number: 'A-100' }];
    const filteredJobs = [];

    const result = selectJobMatches('A', allJobs, filteredJobs);
    assert.equal(result.exactMatch, false);
    assert.deepEqual(result.matches, []);
});
