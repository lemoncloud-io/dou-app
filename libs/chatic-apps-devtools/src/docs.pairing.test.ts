import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { POINTER_LINES, shapeOf } from '@chatic/chatic-apps-sdk/internal';

/**
 * This package's README ships in English and in Korean, as the SDK's author documents do, and is held
 * to the same check the SDK's are: the same headings and code blocks, each pointing at the other on
 * its first line. The English file is the canonical one.
 */

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
        expect(read('README.md').split('\n')[0]).toMatch(POINTER_LINES.english);
        expect(read('README.ko.md').split('\n')[0]).toMatch(POINTER_LINES.korean);
    });
});
