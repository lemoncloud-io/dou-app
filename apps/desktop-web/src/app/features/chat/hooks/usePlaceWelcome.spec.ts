import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DomainChannel } from '@chatic/data';

import { useSiteProfilesStore, useWelcomeStore, welcomeKey } from '../../../shared';
import { usePlaceWelcome } from './usePlaceWelcome';

vi.mock('@chatic/app-runtime', () => ({
    runtime: { session: { useSessionIdentity: () => ({ userId: 'me' }) } },
}));

const channel = (over: Partial<DomainChannel>) => ({ id: 'c', name: 'general', stereo: 'public', ...over }) as DomainChannel;
const SELF = channel({ id: 's', stereo: 'self', name: '' });

const render = (placeId: string, channels: DomainChannel[] = [SELF]) =>
    renderHook(() => usePlaceWelcome({ channels, placeId, isLoading: false, isDefaultMode: false }));

beforeEach(() => {
    useWelcomeStore.setState({ dismissed: {}, invited: {} });
    useSiteProfilesStore.setState({ profiles: {} });
});

describe('usePlaceWelcome', () => {
    it('puts the page away for this place only once the reader picks Later', () => {
        const here = render('P1');
        expect(here.result.current.show).toBe(true);

        act(() => here.result.current.later());

        expect(here.result.current.show).toBe(false);
        expect(render('P2').result.current.show).toBe(true);
    });

    it('reads the steps from the place: a channel I own, an invite I sent, my profile', () => {
        useWelcomeStore.getState().markInvited(welcomeKey('me', 'P1'));
        useSiteProfilesStore.setState({ profiles: { me: { nick: 'Tak' } } } as never);

        const { signals } = render('P1', [SELF, channel({ ownerId: 'me' })]).result.current;

        expect(signals).toEqual({ ownsChannel: true, invited: true, hasDm: false, hasProfile: true });
    });

    it('does not count a channel someone else owns, nor my notes-to-self room as a DM', () => {
        const { signals } = render('P1', [SELF, channel({ ownerId: 'ada' })]).result.current;

        expect(signals.ownsChannel).toBe(false);
        expect(signals.hasDm).toBe(false);
    });
});
