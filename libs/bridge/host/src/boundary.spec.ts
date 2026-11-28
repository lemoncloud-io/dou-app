import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const sourceFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) return sourceFiles(full);
        return /\.ts$/.test(entry.name) ? [full] : [];
    });

describe('@chatic/bridge-host', () => {
    it('never imports the web side', () => {
        const offenders = sourceFiles(__dirname).filter(file =>
            /from\s+'@chatic\/(bridge-client|bridges)'/.test(readFileSync(file, 'utf8'))
        );

        expect(offenders).toEqual([]);
    });
});
