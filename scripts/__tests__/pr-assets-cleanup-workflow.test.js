'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const WORKFLOW = path.join(__dirname, '../../.github/workflows/pr-assets-cleanup.yml');

const workflow = () => yaml.load(fs.readFileSync(WORKFLOW, 'utf8'));

const lookup = (context, reference) =>
    reference
        .split('.')
        .reduce((value, key) => (value === undefined || value === null ? undefined : value[key]), context);

const evaluate = (expression, context) => {
    const body = String(expression)
        .replace(/^\s*\$\{\{/, '')
        .replace(/\}\}\s*$/, '');
    if (!/^[\s\w.!&|()=']+$/.test(body)) throw new Error(`unsupported expression: ${body}`);
    const references = [];
    const source = body.replace(/\bgithub(?:\.\w+)+/g, reference => {
        references.push(lookup(context, reference));
        return `refs[${references.length - 1}]`;
    });
    return Boolean(new Function('refs', `return (${source.replace(/==/g, '===')});`)(references));
};

const closed = merged => ({
    github: { event_name: 'pull_request_target', event: { action: 'closed', pull_request: { number: 7, merged } } },
});

describe('pr-assets-cleanup workflow', () => {
    it('runs on a closed pull request only', () => {
        expect(workflow().on).toEqual({ pull_request_target: { types: ['closed'] } });
    });

    it('deletes the branch of a pull request closed without merging', () => {
        expect(evaluate(workflow().jobs.cleanup.if, closed(false))).toBe(true);
    });

    it('keeps the branch of a merged pull request, whose body and comments still link its images', () => {
        expect(evaluate(workflow().jobs.cleanup.if, closed(true))).toBe(false);
    });

    it('every job is gated, so no step can delete a merged pull request branch', () => {
        for (const job of Object.values(workflow().jobs)) {
            expect(evaluate(job.if ?? 'true', closed(true))).toBe(false);
        }
    });
});
