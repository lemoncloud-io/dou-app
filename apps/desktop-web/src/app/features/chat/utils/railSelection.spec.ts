import { describe, expect, it, vi } from 'vitest';

const toast = vi.hoisted(() => vi.fn());
vi.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast }));

import { selectRailCloud } from './railSelection';
import type { RailCloud } from '../../../shared';

const cloud = (id: string, kind: RailCloud['kind'] = 'owned', status?: string): RailCloud => ({
    id,
    kind,
    status,
    name: id,
});

const t = (key: string) => key;

describe('selectRailCloud', () => {
    it('switches to the cloud the reader is not in', () => {
        const onSelect = vi.fn();
        selectRailCloud(cloud('b'), 'a', onSelect, t);
        expect(onSelect).toHaveBeenCalledWith('b');
    });

    it('leaves the open cloud alone', () => {
        const onSelect = vi.fn();
        selectRailCloud(cloud('a'), 'a', onSelect, t);
        expect(onSelect).not.toHaveBeenCalled();
    });

    it.each(['suspended', 'expired'])('does not try to enter a %s cloud, which only a subscription reopens', status => {
        const onSelect = vi.fn();
        selectRailCloud(cloud('b', 'owned', status), 'a', onSelect, t);
        expect(onSelect).not.toHaveBeenCalled();
        expect(toast).toHaveBeenCalled();
    });
});
