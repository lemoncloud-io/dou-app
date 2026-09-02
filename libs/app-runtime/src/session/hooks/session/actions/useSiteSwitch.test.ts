import { renderHook } from '@testing-library/react';
import { useMutation } from '@tanstack/react-query';

import { useSiteSwitch } from './useSiteSwitch';

jest.mock('@tanstack/react-query', () => ({ useMutation: jest.fn() }));
jest.mock('../../../../socket/auth', () => ({ switchSite: jest.fn() }));
jest.mock('../../mutationKeys', () => ({ SWITCH_SITE_MUTATION_KEY: ['session', 'switch-site'] }));

describe('useSiteSwitch — memo 안정성 (#10)', () => {
    it('mutation 객체가 매 렌더 새 참조여도 switchSite 콜백 참조는 유지된다', () => {
        const mutateAsync = jest.fn().mockResolvedValue(undefined);
        // react-query hands back a FRESH mutation object every render; only mutateAsync is stable.
        (useMutation as jest.Mock).mockImplementation(() => ({ mutateAsync, isPending: false }));

        const { result, rerender } = renderHook(() => useSiteSwitch());
        const first = result.current.switchSite;
        rerender();
        const second = result.current.switchSite;

        expect(second).toBe(first);
    });

    it('switchSite(siteId)는 mutateAsync에 siteId를 전달한다', async () => {
        const mutateAsync = jest.fn().mockResolvedValue(undefined);
        (useMutation as jest.Mock).mockReturnValue({ mutateAsync, isPending: false });

        const { result } = renderHook(() => useSiteSwitch());
        await result.current.switchSite('site-9');

        expect(mutateAsync).toHaveBeenCalledWith('site-9');
    });
});
