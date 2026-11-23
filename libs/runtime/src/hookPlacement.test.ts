import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

const SRC = join(__dirname);

const sourceFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap(entry => {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) return sourceFiles(path);
        if (!/\.tsx?$/.test(entry) || /\.(test|spec)\.tsx?$/.test(entry)) return [];
        return [path];
    });

describe('runtime — 훅 배치', () => {
    it('use* 파일은 전부 hooks/ 안에 있다', () => {
        const misplaced = sourceFiles(SRC)
            .map(file => relative(SRC, file))
            .filter(file => /(^|[\\/])use[A-Z]/.test(file))
            .filter(file => !file.split(sep).slice(0, -1).includes('hooks'))
            .sort();

        expect(misplaced).toEqual([]);
    });

    it('export된 훅은 선언 위치까지 hooks/ 안이다', () => {
        const declaredOutside = sourceFiles(SRC)
            .filter(file => !relative(SRC, file).split(sep).slice(0, -1).includes('hooks'))
            .flatMap(file =>
                readFileSync(file, 'utf8')
                    .split('\n')
                    .filter(line => /^export (const|function) use[A-Z]/.test(line))
                    .map(line => `${relative(SRC, file)}: ${line.trim().slice(0, 60)}`)
            )
            .sort();

        expect(declaredOutside).toEqual([]);
    });

    it('훅을 가진 모듈은 모두 hooks/ 폴더로 그것을 표현한다', () => {
        const hookFolders = sourceFiles(SRC)
            .map(file => relative(SRC, file))
            .filter(file => file.split(sep).includes('hooks'))
            .map(file => file.split(sep).slice(0, file.split(sep).indexOf('hooks')).join('/') || '<root>')
            .filter((value, index, all) => all.indexOf(value) === index)
            .sort();

        expect(hookFolders).toEqual(['connection', 'data', 'push', 'session', 'socket/sync']);
    });
});
