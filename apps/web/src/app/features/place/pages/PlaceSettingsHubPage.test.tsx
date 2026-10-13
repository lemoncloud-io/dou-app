import '@testing-library/jest-dom';

import { act, fireEvent, render, screen } from '@testing-library/react';

import type { MySiteView } from '@lemoncloud/chatic-backend-api';

let mockPlace: Partial<MySiteView> | null = null;
let mockPlaceId = 'p1';
let mockIsGuest = false;
const navigate = jest.fn();
const observeItem = jest.fn();
const leavePlace = jest.fn((_id: string) => Promise.resolve({}));
const toast = jest.fn();

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => navigate }));
jest.mock('@chatic/bridges', () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));
jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: () => ({ place: { observeItem, leavePlace } }),
        },
        session: {
            useRuntimeProfile: () => ({ isGuest: mockIsGuest }),
        },
    },
}));
jest.mock('react-router-dom', () => ({ useParams: () => ({ placeId: mockPlaceId }) }));
// The real `ui` barrel pulls `@chatic/assets` through PrivateLayout, which jest cannot parse.
jest.mock('../../../ui', () => ({ PageHeader: ({ title }: { title: string }) => <div>header:{title}</div> }));
jest.mock('../components/ChannelSortSheet', () => ({ ChannelSortSheet: () => <div>sort-sheet</div> }));
// A plain stand-in for the alert dialog: open shows the title and a confirm button.
jest.mock('../../channels/components', () => ({
    ConfirmDialog: ({
        open,
        title,
        confirmLabel,
        onConfirm,
    }: {
        open: boolean;
        title: string;
        confirmLabel: string;
        onConfirm: () => void;
    }) =>
        open ? (
            <div role="dialog">
                <p>{title}</p>
                <button onClick={onConfirm}>{confirmLabel}</button>
            </div>
        ) : null,
}));

import { PlaceSettingsHubPage } from './PlaceSettingsHubPage';

beforeEach(() => {
    jest.clearAllMocks();
    mockPlace = null;
    mockPlaceId = 'p1';
    mockIsGuest = false;
    observeItem.mockImplementation((_id: string, cb: (item: unknown) => void) => {
        cb(mockPlace);
        return jest.fn();
    });
});

const rowButton = (label: string) => screen.getByText(label).closest('button') as HTMLButtonElement;

describe('PlaceSettingsHubPage — 설정 카드', () => {
    it('첫 카드 제목은 "설정"이다', () => {
        render(<PlaceSettingsHubPage />);

        expect(screen.getByText('placeSettings.sectionSettings')).toBeInTheDocument();
    });

    it('"플레이스 정보" 행이 상세 화면으로 이동한다', () => {
        render(<PlaceSettingsHubPage />);

        fireEvent.click(rowButton('placeSettings.placeDetail'));

        expect(navigate).toHaveBeenCalledWith('/place/p1/settings/detail');
    });

    it('"플레이스 정보" 행 부제로 소개 문구를 미리 보여준다', () => {
        mockPlace = { id: 'p1', desc: '개발자들이 모이는 곳' };
        render(<PlaceSettingsHubPage />);

        expect(screen.getByText('개발자들이 모이는 곳')).toBeInTheDocument();
    });

    // An empty string doesn't render a subtitle — `subtitle=""` just adds row height with nothing
    // visible.
    it('소개 문구가 비어 있으면 부제를 그리지 않는다', () => {
        mockPlace = { id: 'p1', desc: '' };
        render(<PlaceSettingsHubPage />);

        expect(rowButton('placeSettings.placeDetail')).toHaveTextContent(/^placeSettings\.placeDetail$/);
    });

    it('"플레이스 프로필" 행이 편집 화면으로 이동한다', () => {
        mockPlace = { id: 'p1', isOwner: true };
        render(<PlaceSettingsHubPage />);

        fireEvent.click(rowButton('placeSettings.placeProfile'));

        expect(navigate).toHaveBeenCalledWith('/place/p1/settings/edit');
    });

    // Read-only, so there's no owner gate — unlike the edit row, a non-owner must be able to tap it
    // too (ADR-0095).
    it('비오너에게도 "플레이스 정보" 행은 활성이고, "플레이스 프로필" 행만 막힌다', () => {
        mockPlace = { id: 'p1', isOwner: false };
        render(<PlaceSettingsHubPage />);

        expect(rowButton('placeSettings.placeDetail')).not.toBeDisabled();
        expect(rowButton('placeSettings.placeProfile')).toBeDisabled();

        fireEvent.click(rowButton('placeSettings.placeDetail'));
        expect(navigate).toHaveBeenCalledWith('/place/p1/settings/detail');
    });
});

describe('PlaceSettingsHubPage — members', () => {
    it('shows a member of the place the Members row, which opens the member screen', () => {
        mockPlace = { id: 'p1', isOwner: false };
        render(<PlaceSettingsHubPage />);

        fireEvent.click(rowButton('placeSettings.members'));

        expect(navigate).toHaveBeenCalledWith('/place/p1/settings/members');
    });

    it("has no Members row on the relay's own place", () => {
        mockPlaceId = '0000';
        mockPlace = { id: '0000' };
        render(<PlaceSettingsHubPage />);

        expect(screen.queryByText('placeSettings.members')).not.toBeInTheDocument();
    });

    it('has no Members row for a guest', () => {
        mockIsGuest = true;
        mockPlace = { id: 'p1', isOwner: false };
        render(<PlaceSettingsHubPage />);

        expect(screen.queryByText('placeSettings.members')).not.toBeInTheDocument();
    });
});

describe('PlaceSettingsHubPage — leaving the place', () => {
    const confirmLeave = async () => {
        fireEvent.click(rowButton('placeSettings.leavePlace'));
        await act(async () => {
            fireEvent.click(screen.getByText('placeLeave.dialog.confirm'));
        });
    };

    it('offers Leave to a member who is not the owner', () => {
        mockPlace = { id: 'p1', isOwner: false };
        render(<PlaceSettingsHubPage />);

        expect(rowButton('placeSettings.leavePlace')).toBeInTheDocument();
    });

    it('offers no Leave to the owner, nor before the place row has arrived', () => {
        mockPlace = { id: 'p1', isOwner: true };
        const { unmount } = render(<PlaceSettingsHubPage />);
        expect(screen.queryByText('placeSettings.leavePlace')).not.toBeInTheDocument();
        unmount();

        mockPlace = null;
        render(<PlaceSettingsHubPage />);
        expect(screen.queryByText('placeSettings.leavePlace')).not.toBeInTheDocument();
    });

    it("offers no Leave on the relay's own place or to a guest", () => {
        mockPlaceId = '0000';
        mockPlace = { id: '0000' };
        const { unmount } = render(<PlaceSettingsHubPage />);
        expect(screen.queryByText('placeSettings.leavePlace')).not.toBeInTheDocument();
        unmount();

        mockPlaceId = 'p1';
        mockIsGuest = true;
        mockPlace = { id: 'p1', isOwner: false };
        render(<PlaceSettingsHubPage />);
        expect(screen.queryByText('placeSettings.leavePlace')).not.toBeInTheDocument();
    });

    it('leaves the place once confirmed, says so and goes home', async () => {
        mockPlace = { id: 'p1', isOwner: false, name: 'Studio' };
        render(<PlaceSettingsHubPage />);

        await confirmLeave();

        expect(leavePlace).toHaveBeenCalledWith('p1');
        expect(toast).toHaveBeenCalledWith({ title: 'placeLeave.done' });
        expect(navigate).toHaveBeenCalledWith('/', { replace: true });
    });

    it('stays on the hub and says why when the leave fails', async () => {
        mockPlace = { id: 'p1', isOwner: false };
        leavePlace.mockRejectedValueOnce(new Error('503 SOCKET NOT CONNECTED'));
        render(<PlaceSettingsHubPage />);

        await confirmLeave();

        expect(toast).toHaveBeenCalledWith({ title: 'placeSettings.networkError', variant: 'destructive' });
        expect(navigate).not.toHaveBeenCalled();
        expect(rowButton('placeSettings.leavePlace')).toBeInTheDocument();
    });
});
