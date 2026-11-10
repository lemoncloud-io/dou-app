import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    beforeEach(() => toast.mockClear());

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

    // A held cloud still opens: the server decides, and a refusal gets the switch flow's own toast.
    it('starts a switch into a suspended cloud', () => {
        const onSelect = vi.fn();
        selectRailCloud(cloud('b', 'owned', 'suspended'), 'a', onSelect, t);
        expect(onSelect).toHaveBeenCalledWith('b');
        expect(toast).not.toHaveBeenCalled();
    });

    it('does not try to enter an expired cloud, which is released', () => {
        const onSelect = vi.fn();
        selectRailCloud(cloud('b', 'owned', 'expired'), 'a', onSelect, t);
        expect(onSelect).not.toHaveBeenCalled();
        expect(toast).toHaveBeenCalled();
    });
});
