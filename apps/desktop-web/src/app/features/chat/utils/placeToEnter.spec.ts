import { describe, expect, it } from 'vitest';

import { placeToEnter } from './placeToEnter';

const places = [{ id: 'first' }, { id: 'second' }, { id: 'third' }];

describe('placeToEnter', () => {
    it('moves nowhere while the selected place is still in the list', () => {
        expect(placeToEnter(places, 'second', 'third')).toBeUndefined();
    });

    it('goes back to the place last open in this cloud when the selected one is gone', () => {
        expect(placeToEnter(places, 'deleted', 'third')).toBe('third');
    });

    it('takes the first place when the remembered one is the place that was deleted', () => {
        expect(placeToEnter(places, 'deleted', 'deleted')).toBe('first');
    });

    it('takes the first place when nothing is remembered or selected', () => {
        expect(placeToEnter(places, null, undefined)).toBe('first');
    });

    it('moves nowhere when the last place is gone', () => {
        expect(placeToEnter([], 'deleted', 'deleted')).toBeUndefined();
    });
});
