import { describe, expect, it, vi } from 'vitest';

import { registerChannels } from './registerChannels';

describe('registerChannels', () => {
    it('모든 채널 id를 register로 구독한다', () => {
        const register = vi.fn().mockReturnValue(() => {
            /* empty */
        });

        registerChannels(['a', 'b', 'c'], register);

        expect(register).toHaveBeenCalledTimes(3);
        expect(register).toHaveBeenCalledWith('a');
        expect(register).toHaveBeenCalledWith('b');
        expect(register).toHaveBeenCalledWith('c');
    });

    it('반환된 disposer는 각 채널의 disposer를 모두 호출한다', () => {
        const disposeA = vi.fn();
        const disposeB = vi.fn();
        const register = vi.fn().mockReturnValueOnce(disposeA).mockReturnValueOnce(disposeB);

        const disposeAll = registerChannels(['a', 'b'], register);
        disposeAll();

        expect(disposeA).toHaveBeenCalledTimes(1);
        expect(disposeB).toHaveBeenCalledTimes(1);
    });

    it('빈 목록은 아무것도 구독하지 않고 no-op disposer를 반환한다', () => {
        const register = vi.fn();

        const disposeAll = registerChannels([], register);

        expect(register).not.toHaveBeenCalled();
        expect(() => disposeAll()).not.toThrow();
    });
});
