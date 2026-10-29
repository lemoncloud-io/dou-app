import { describe, expect, it } from 'vitest';

import type { DomainPlace } from '@chatic/data';

import { orderedRailClouds, orderedRailPlaces } from './railOrder';
import type { RailCloud } from '../../../shared';

const cloud = (id: string, kind: RailCloud['kind'] = 'owned', status?: string): RailCloud => ({
    id,
    kind,
    status,
    name: id,
});

const place = (id: string) => ({ id, cid: 'cloud-1' }) as DomainPlace;

describe('orderedRailClouds', () => {
    it('keeps Home first even when the stored order names another cloud first', () => {
        const ordered = orderedRailClouds([cloud('default', 'home'), cloud('a'), cloud('b')], ['b', 'default', 'a']);
        expect(ordered.map(c => c.id)).toEqual(['default', 'b', 'a']);
    });

    it('puts a cloud the stored order does not name after the ones it does', () => {
        const ordered = orderedRailClouds([cloud('default', 'home'), cloud('a'), cloud('b'), cloud('c')], ['c', 'a']);
        expect(ordered.map(c => c.id)).toEqual(['default', 'c', 'a', 'b']);
    });

    it('reads as the sources ordered them when nothing was stored', () => {
        const ordered = orderedRailClouds([cloud('default', 'home'), cloud('a'), cloud('b')], undefined);
        expect(ordered.map(c => c.id)).toEqual(['default', 'a', 'b']);
    });
});

describe('orderedRailPlaces', () => {
    it('applies the stored order and appends a place it does not name', () => {
        expect(orderedRailPlaces([place('p1'), place('p2'), place('p3')], ['p3', 'p1']).map(p => p.id)).toEqual([
            'p3',
            'p1',
            'p2',
        ]);
    });

    it('is empty for an empty list, which is also the case with no cloud to key the order by', () => {
        expect(orderedRailPlaces([], ['p1'])).toEqual([]);
    });
});
