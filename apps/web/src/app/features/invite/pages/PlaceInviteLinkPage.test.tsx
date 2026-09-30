import { render } from '@testing-library/react';

const navigate = jest.fn();
let routeState: unknown = { inviteLink: 'https://dou.link/abc' };
let view: any = null;

jest.mock('@chatic/app-runtime', () => {
    const repositories = {
        place: {
            observeItem: (_id: string, callback: (row: unknown) => void) => {
                callback({ id: 'site-1', name: '레몬', thumbnail: 'https://img/p.png' });
                return () => undefined;
            },
        },
    };
    return { runtime: { data: { useRuntimeRepositories: () => repositories } } };
});
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => navigate }));
jest.mock('react-router-dom', () => ({
    useParams: () => ({ placeId: 'site-1' }),
    useLocation: () => ({ state: routeState }),
}));
jest.mock('../../channels/components/InviteLinkView', () => ({
    InviteLinkView: (p: any) => {
        view = p;
        return null;
    },
}));

import { PlaceInviteLinkPage } from './PlaceInviteLinkPage';

describe('PlaceInviteLinkPage', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        routeState = { inviteLink: 'https://dou.link/abc' };
        view = null;
    });

    it('shows the link under the place, not a room', () => {
        render(<PlaceInviteLinkPage />);

        expect(view).toMatchObject({
            inviteLink: 'https://dou.link/abc',
            name: '레몬',
            avatarSrc: 'https://img/p.png',
        });
    });

    it('closes the whole flow — the invite page and this one — back to home', () => {
        render(<PlaceInviteLinkPage />);
        view.onClose();

        expect(navigate).toHaveBeenCalledWith(-2);
    });

    it('goes home when the link was lost with the route state', () => {
        routeState = null;
        render(<PlaceInviteLinkPage />);

        expect(view).toBeNull();
        expect(navigate).toHaveBeenCalledWith('/', { replace: true });
    });
});
