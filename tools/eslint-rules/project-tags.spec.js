'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { RuleTester } = require('eslint');

const rule = require('./project-tags');

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'project-tags-'));
const write = (file, value) => {
    fs.mkdirSync(path.dirname(path.join(workspace, file)), { recursive: true });
    fs.writeFileSync(path.join(workspace, file), JSON.stringify(value));
};

write('nx.json', {});
write('package.json', { name: 'root' });
write('libs/tagged/project.json', { tags: ['layer:foundation', 'platform:any'] });
write('libs/split/project.json', { tags: ['layer:ui'] });
write('libs/split/package.json', { name: 'split', nx: { tags: ['platform:web'] } });
write('libs/no-platform/package.json', { name: 'no-platform', nx: { tags: ['layer:core-lib'] } });
write('libs/bare/project.json', { tags: [] });
write('libs/repeat/project.json', { tags: [] });

const options = [{ axes: ['layer', 'platform'] }];
const at = file => path.join(workspace, file);
const missing = (root, axis) => ({ messageId: 'missing', data: { root: at(root), axis } });

afterAll(() => fs.rmSync(workspace, { recursive: true, force: true }));

new RuleTester({ languageOptions: { ecmaVersion: 2022, sourceType: 'module' } }).run('project-tags', rule, {
    valid: [
        { code: 'export {};', filename: at('libs/tagged/src/index.ts'), options },
        { code: 'export {};', filename: at('libs/split/src/deep/file.ts'), options },
        { code: 'export {};', filename: at('eslint.config.mjs'), options },
        { code: 'export {};', filename: at('libs/bare/src/index.ts'), options: [{}] },
    ],
    invalid: [
        {
            code: 'export {};',
            filename: at('libs/no-platform/src/index.ts'),
            options,
            errors: [missing('libs/no-platform', 'platform')],
        },
        {
            code: 'export {};',
            filename: at('libs/bare/src/index.ts'),
            options,
            errors: [missing('libs/bare', 'layer'), missing('libs/bare', 'platform')],
        },
    ],
});

describe('project-tags once per project', () => {
    const { Linter } = require('eslint');
    const linter = new Linter({ cwd: workspace });
    const config = {
        files: ['**/*.js'],
        plugins: { local: { rules: { 'project-tags': rule } } },
        rules: { 'local/project-tags': ['error', ...options], 'prefer-const': 'error' },
    };
    const lint = file => linter.verify('export {};', config, at(file));

    it('reports a project on its first file only', () => {
        expect(lint('libs/repeat/src/a.js')).toHaveLength(2);
        expect(lint('libs/repeat/src/b.js')).toEqual([]);
    });

    it('reports again when that first file is linted again', () => {
        expect(lint('libs/repeat/src/a.js')).toHaveLength(2);
    });

    it('keeps the report through a fix pass', () => {
        write('libs/fixed/project.json', { tags: [] });
        const result = linter.verifyAndFix(
            'let unchanged = 1;\nexport { unchanged };',
            config,
            at('libs/fixed/src/a.js')
        );
        expect(result.fixed).toBe(true);
        expect(result.messages.map(message => message.ruleId)).toEqual(['local/project-tags', 'local/project-tags']);
    });
});
