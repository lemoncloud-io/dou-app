const fs = require('fs');
const os = require('os');
const path = require('path');
const ts = require('typescript');

const { coveredFiles, projectDirOf } = require('../ratchet/test-typecheck');

const write = (dir, file, content) => {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), typeof content === 'string' ? content : JSON.stringify(content));
};

describe('test typecheck coverage', () => {
    let dir;

    beforeEach(() => {
        dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tt-')));
        write(dir, 'src/a.ts', 'export const a = 1;');
        write(dir, 'src/a.test.ts', 'export const t = 1;');
        write(dir, 'tsconfig.app.json', {
            compilerOptions: { composite: true, outDir: 'dist', tsBuildInfoFile: 'dist/app.tsbuildinfo' },
            include: ['src/**/*.ts'],
            exclude: ['src/**/*.test.ts'],
        });
    });

    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    const covered = () =>
        [...coveredFiles(ts, path.join(dir, 'tsconfig.json'))].map(file => path.relative(dir, file)).sort();

    it('covers a test file that a referenced spec project with its own build info includes', () => {
        write(dir, 'tsconfig.spec.json', {
            extends: './tsconfig.app.json',
            compilerOptions: { outDir: 'out-spec', tsBuildInfoFile: 'out-spec/spec.tsbuildinfo' },
            include: ['src/**/*.ts'],
            exclude: [],
        });
        write(dir, 'tsconfig.json', {
            files: [],
            references: [{ path: './tsconfig.app.json' }, { path: './tsconfig.spec.json' }],
        });
        expect(covered()).toEqual(['src/a.test.ts', 'src/a.ts']);
    });

    it('does not cover a spec project that shares the app build info, because tsc -b skips it', () => {
        write(dir, 'tsconfig.spec.json', { extends: './tsconfig.app.json', include: ['src/**/*.ts'], exclude: [] });
        write(dir, 'tsconfig.json', {
            files: [],
            references: [{ path: './tsconfig.app.json' }, { path: './tsconfig.spec.json' }],
        });
        expect(covered()).toEqual(['src/a.ts']);
    });

    it('does not cover a spec project nothing references', () => {
        write(dir, 'tsconfig.spec.json', {
            extends: './tsconfig.app.json',
            compilerOptions: { tsBuildInfoFile: 'out-spec/spec.tsbuildinfo' },
            include: ['src/**/*.ts'],
            exclude: [],
        });
        write(dir, 'tsconfig.json', { files: [], references: [{ path: './tsconfig.app.json' }] });
        expect(covered()).toEqual(['src/a.ts']);
    });
});

describe('apps/web spec project', () => {
    it('references every project the app references, so its test files see built libs', () => {
        const read = file =>
            ts
                .readConfigFile(path.join(__dirname, '../../apps/web', file), ts.sys.readFile)
                .config.references.map(reference => reference.path);
        expect(read('tsconfig.spec.json')).toEqual(expect.arrayContaining(read('tsconfig.app.json')));
    });
});

describe('the project a test file belongs to', () => {
    let dir;

    beforeEach(() => {
        dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tp-')));
        write(dir, 'libs/runtime/package.json', { name: '@chatic/runtime' });
        write(dir, 'libs/runtime/react/project.json', { name: '@chatic/runtime-react' });
    });

    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    it('is the nearest folder with a project file, so a project nested in another counts on its own', () => {
        expect(projectDirOf('libs/runtime/react/src/hooks/useX.test.ts', dir)).toBe('libs/runtime/react');
        expect(projectDirOf('libs/runtime/src/a.test.ts', dir)).toBe('libs/runtime');
    });

    it('falls back to the first two segments when no project file is found', () => {
        expect(projectDirOf('apps/web/src/a.test.ts', dir)).toBe('apps/web');
    });
});
