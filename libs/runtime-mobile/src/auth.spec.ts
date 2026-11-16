import { MemoryStore } from '@chatic/storage';

import { HOME_SEARCH_KEY, nativeAuthPorts } from './auth';

describe('nativeAuthPorts', () => {
    it('has no address when the last lifetime left nothing', () => {
        expect(nativeAuthPorts(new MemoryStore(), jest.fn()).currentSearch()).toBe('');
    });

    it("saves the end of a session's parameters, then hands over to the app's way home", () => {
        const plain = new MemoryStore();
        const leaveToHome = jest.fn();
        const params = new URLSearchParams({ logout: '1' });

        nativeAuthPorts(plain, leaveToHome).leaveToHome(params);

        expect(plain.get(HOME_SEARCH_KEY)).toBe('logout=1');
        expect(leaveToHome).toHaveBeenCalledWith(params);
    });

    it('reads them back as the address of the next lifetime, for its whole length', () => {
        const plain = new MemoryStore();
        nativeAuthPorts(plain, jest.fn()).leaveToHome(new URLSearchParams({ logout: '1', provider: 'apple' }));

        const next = nativeAuthPorts(plain, jest.fn());

        expect(next.currentSearch()).toBe('?logout=1&provider=apple');
        expect(next.currentSearch()).toBe('?logout=1&provider=apple');
    });

    it('takes them once: the lifetime after that one opens with no address again', () => {
        const plain = new MemoryStore();
        nativeAuthPorts(plain, jest.fn()).leaveToHome(new URLSearchParams({ logout: '1' }));
        nativeAuthPorts(plain, jest.fn());

        expect(plain.get(HOME_SEARCH_KEY)).toBeNull();
        expect(nativeAuthPorts(plain, jest.fn()).currentSearch()).toBe('');
    });
});
