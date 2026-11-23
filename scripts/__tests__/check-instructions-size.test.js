const fs = require('fs');
const os = require('os');
const path = require('path');

const { bodyLines, measure, check, lowered, run } = require('../check-instructions-size');

const makeRepo = files => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'instructions-size-'));
    for (const [file, text] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        fs.writeFileSync(path.join(root, file), text);
    }
    return root;
};

const lines = n => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join('\n');
const skill = n => `---\nname: x\ndescription: >-\n    long\n---\n${lines(n)}\n`;

describe('check-instructions-size', () => {
    it('counts a skill body without its frontmatter', () => {
        expect(bodyLines(skill(7))).toBe(7);
    });

    it('counts every line of a file with no frontmatter', () => {
        expect(bodyLines(`${lines(4)}\n`)).toBe(4);
    });

    it('measures AGENTS.md, each SKILL.md and the skills total', () => {
        const root = makeRepo({
            'AGENTS.md': `${lines(10)}\n`,
            'docs/config/skills/dou-a/SKILL.md': skill(3),
            'docs/config/skills/dou-b/SKILL.md': skill(5),
            'docs/config/skills/dou-b/references/long.md': lines(500),
        });
        expect(measure(root)).toEqual({
            'AGENTS.md': 10,
            'docs/config/skills/dou-a/SKILL.md': 3,
            'docs/config/skills/dou-b/SKILL.md': 5,
            'skills total': 8,
        });
    });

    it('reports a file over its budget', () => {
        const [problem] = check({ 'AGENTS.md': 61 }, { 'AGENTS.md': 60 });
        expect(problem).toContain('AGENTS.md: 61 lines, budget 60');
    });

    it('reports a new skill with no budget entry and a budget entry whose file is gone', () => {
        const problems = check(
            { 'docs/config/skills/dou-new/SKILL.md': 4 },
            { 'docs/config/skills/dou-old/SKILL.md': 9 }
        );
        expect(problems).toEqual([
            expect.stringContaining('dou-new/SKILL.md: 4 lines and no budget'),
            expect.stringContaining('dou-old/SKILL.md: in the budget but gone'),
        ]);
    });

    it('passes at or under budget', () => {
        expect(check({ 'AGENTS.md': 60 }, { 'AGENTS.md': 60 })).toEqual([]);
    });

    it('only ever lowers a budget on update', () => {
        expect(lowered({ a: 5, b: 20 }, { a: 10, b: 12 })).toEqual({ a: 5, b: 12 });
    });

    it('fails the run when a skill grows past its budget, and passes once it is cut', () => {
        const root = makeRepo({ 'AGENTS.md': `${lines(2)}\n`, 'docs/config/skills/dou-a/SKILL.md': skill(6) });
        const budget = path.join(root, 'budget.json');
        fs.writeFileSync(
            budget,
            JSON.stringify({ 'AGENTS.md': 2, 'docs/config/skills/dou-a/SKILL.md': 5, 'skills total': 6 })
        );
        const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        expect(run([], root, budget)).toBe(1);
        fs.writeFileSync(path.join(root, 'docs/config/skills/dou-a/SKILL.md'), skill(5));
        expect(run([], root, budget)).toBe(0);
        error.mockRestore();
    });

    it('keeps the committed budget in step with the repository', () => {
        const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
        expect(run([])).toBe(0);
        log.mockRestore();
    });
});
