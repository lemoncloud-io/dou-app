import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { POINTER_LINES, firstLine, shapeOf } from '@chatic/chatic-apps-sdk/internal';

const PACKAGE = join(__dirname, '..');
const read = (file: string) => readFileSync(join(PACKAGE, file), 'utf8');

describe('the Korean README', () => {
    it('exists beside the English one', () => {
        expect(existsSync(join(PACKAGE, 'README.ko.md'))).toBe(true);
    });

    it('has the same headings and code blocks', () => {
        expect(shapeOf(read('README.ko.md'))).toEqual(shapeOf(read('README.md')));
    });

    it('and the English one point at each other on their first line', () => {
        expect(firstLine(read('README.md'))).toMatch(POINTER_LINES.english);
        expect(firstLine(read('README.ko.md'))).toMatch(POINTER_LINES.korean);
    });
});
