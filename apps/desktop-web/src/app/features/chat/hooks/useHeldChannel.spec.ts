import { describe, expect, it } from 'vitest';

import { renderHook } from '@testing-library/react';

import type { DomainChannel } from '@chatic/data';

import { useHeldChannel } from './useHeldChannel';

const channel = (id: string): DomainChannel => ({ id }) as DomainChannel;

type Props = { resolved: DomainChannel | undefined; wantedId: string | null; loading: boolean };

const renderHeld = (initialProps: Props) =>
    renderHook(({ resolved, wantedId, loading }: Props) => useHeldChannel(resolved, wantedId, loading), {
        initialProps,
    });

describe('useHeldChannel', () => {
    it('hands back the resolved channel as is', () => {
        const ch1 = channel('ch-1');
        const { result } = renderHeld({ resolved: ch1, wantedId: 'ch-1', loading: false });

        expect(result.current).toBe(ch1);
    });

    it('keeps the last resolved channel while the list is replaced under the same selection', () => {
        const ch1 = channel('ch-1');
        const { result, rerender } = renderHeld({ resolved: ch1, wantedId: 'ch-1', loading: false });

        rerender({ resolved: undefined, wantedId: 'ch-1', loading: true });
        expect(result.current).toBe(ch1);

        const back = channel('ch-1');
        rerender({ resolved: back, wantedId: 'ch-1', loading: false });
        expect(result.current).toBe(back);
    });

    it('lets go once the list has loaded without the channel', () => {
        const { result, rerender } = renderHeld({ resolved: channel('ch-1'), wantedId: 'ch-1', loading: false });

        rerender({ resolved: undefined, wantedId: 'ch-1', loading: true });
        rerender({ resolved: undefined, wantedId: 'ch-1', loading: false });

        expect(result.current).toBeUndefined();
    });

    it('does not bring back a channel the loaded list already lacked', () => {
        const { result, rerender } = renderHeld({ resolved: channel('ch-1'), wantedId: 'ch-1', loading: false });

        rerender({ resolved: undefined, wantedId: 'ch-1', loading: true });
        rerender({ resolved: undefined, wantedId: 'ch-1', loading: false });
        // The next load (another place switch) must not hand the gone channel's old object back.
        rerender({ resolved: undefined, wantedId: 'ch-1', loading: true });

        expect(result.current).toBeUndefined();
    });

    it('never lends one channel to another selection', () => {
        const { result, rerender } = renderHeld({ resolved: channel('ch-1'), wantedId: 'ch-1', loading: false });

        rerender({ resolved: undefined, wantedId: 'ch-2', loading: true });

        expect(result.current).toBeUndefined();
    });

    it('has nothing to hold on a cold start', () => {
        const { result } = renderHeld({ resolved: undefined, wantedId: 'ch-1', loading: true });

        expect(result.current).toBeUndefined();
    });
});
