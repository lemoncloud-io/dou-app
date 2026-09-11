import { describe, expect, it } from 'vitest';

import { sidebarMoveChord } from './keyboard';

describe('sidebarMoveChord', () => {
    it('recognizes Alt+Shift+ArrowUp/Down as the move chord with its direction', () => {
        expect(sidebarMoveChord({ altKey: true, shiftKey: true, key: 'ArrowDown' })).toBe(1);
        expect(sidebarMoveChord({ altKey: true, shiftKey: true, key: 'ArrowUp' })).toBe(-1);
    });

    it('is null for every other modifier combination — plain arrows must navigate', () => {
        expect(sidebarMoveChord({ altKey: false, shiftKey: false, key: 'ArrowDown' })).toBeNull();
        expect(sidebarMoveChord({ altKey: false, shiftKey: true, key: 'ArrowUp' })).toBeNull();
        expect(sidebarMoveChord({ altKey: true, shiftKey: false, key: 'ArrowUp' })).toBeNull();
        expect(sidebarMoveChord({ altKey: true, shiftKey: true, key: 'Enter' })).toBeNull();
    });
});
