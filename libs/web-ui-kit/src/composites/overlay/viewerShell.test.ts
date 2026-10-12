import { EDGE_RESISTANCE, pagerDragOffset, pagerReleaseStep } from './viewerShell';

describe('pagerDragOffset', () => {
    it('follows the finger while there is a page to go to', () => {
        expect(pagerDragOffset(-40, true, true)).toBe(-40);
        expect(pagerDragOffset(40, true, false)).toBe(40);
    });

    it('gives only a fraction past either end', () => {
        expect(pagerDragOffset(-100, true, false)).toBe(-100 * EDGE_RESISTANCE);
        expect(pagerDragOffset(100, false, true)).toBe(100 * EDGE_RESISTANCE);
    });
});

describe('pagerReleaseStep', () => {
    // A 400px pager: a fifth of it is 80px, more than the 48px floor.
    const width = 400;

    it('turns to the next page on a long drag to the left, and back on one to the right', () => {
        expect(pagerReleaseStep(-90, 1000, width)).toBe(1);
        expect(pagerReleaseStep(90, 1000, width)).toBe(-1);
    });

    it('stays on a slow drag short of a fifth of the width', () => {
        expect(pagerReleaseStep(-70, 1000, width)).toBe(0);
    });

    it('turns on a quick flick with less travel', () => {
        expect(pagerReleaseStep(-30, 200, width)).toBe(1);
        expect(pagerReleaseStep(-20, 200, width)).toBe(0);
    });

    it('needs at least the 48px floor on a narrow pager', () => {
        expect(pagerReleaseStep(-40, 1000, 100)).toBe(0);
        expect(pagerReleaseStep(-48, 1000, 100)).toBe(1);
    });

    it('does not turn on no movement', () => {
        expect(pagerReleaseStep(0, 0, width)).toBe(0);
    });
});
