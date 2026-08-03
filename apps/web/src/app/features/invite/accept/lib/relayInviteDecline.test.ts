import { isInviteDeclined, recordDeclinedInvite } from './relayInviteDecline';
import { usePreferenceStore } from '../../../../stores/usePreferenceStore';

// The ids live in usePreferenceStore now; the ring cap and dedupe are ITS behaviour and are covered
// in usePreferenceStore.test.ts. Importing the real store here would drag the native bridge (and its
// `import.meta` config) into this suite, so stub the store down to the two members this module uses.
jest.mock('../../../../stores/usePreferenceStore', () => {
    const { create } = jest.requireActual('zustand');
    return {
        usePreferenceStore: create((set: never, get: never) => ({
            declinedInviteIds: [] as string[],
            markInviteDeclined: (inviteId: string) => {
                const current = (get as unknown as () => { declinedInviteIds: string[] })().declinedInviteIds;
                (set as unknown as (partial: object) => void)({
                    declinedInviteIds: [...current.filter(id => id !== inviteId), inviteId],
                });
            },
        })),
    };
});

beforeEach(() => usePreferenceStore.setState({ declinedInviteIds: [] } as never));

describe('relayInviteDecline', () => {
    it('기록한 초대만 거절로 본다', () => {
        recordDeclinedInvite('invite-1');

        expect(isInviteDeclined('invite-1')).toBe(true);
        expect(isInviteDeclined('invite-2')).toBe(false);
    });

    it('id가 없으면 아무것도 기록하지 않는다 — 키로 삼을 것이 없다', () => {
        recordDeclinedInvite(undefined);

        expect(usePreferenceStore.getState().declinedInviteIds).toEqual([]);
        expect(isInviteDeclined(undefined)).toBe(false);
    });

    it('스토어에 위임한다 — 이 모듈은 저장 방식을 알지 않는다', () => {
        recordDeclinedInvite('invite-1');

        expect(usePreferenceStore.getState().declinedInviteIds).toEqual(['invite-1']);
    });
});
