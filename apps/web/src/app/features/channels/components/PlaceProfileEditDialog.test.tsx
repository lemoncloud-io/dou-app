import '@testing-library/jest-dom';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { PlaceProfileEditDialog } from './PlaceProfileEditDialog';

const setMyProfileMock = jest.fn();
let mockProfile: { nick?: string; thumbnail?: string } | null = null;

jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: () => ({ profile: { setMyProfile: setMyProfileMock } }),
        },
    },
}));
jest.mock('@chatic/bridges', () => ({ logger: { error: jest.fn() } }));
jest.mock('@chatic/shared', () => ({ prepareImage: jest.fn() }));
jest.mock('../../../hooks', () => ({
    useMyProfile: () => ({ profile: mockProfile }),
    useSetMyPlaceProfile: () => setMyProfileMock,
}));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, o?: { place?: string }) => (o?.place ? `${k}|${o.place}` : k) }),
}));

const noop = () => undefined;
const done = () => screen.getByRole('button', { name: 'placeProfileEdit.done' });

beforeEach(() => {
    jest.clearAllMocks();
    mockProfile = { nick: 'old-nick', thumbnail: 'data:img' };
});

describe('PlaceProfileEditDialog', () => {
    it('현재 프로필로 이름을 프리필하고, 변경 전에는 완료가 비활성이다', () => {
        render(<PlaceProfileEditDialog open placeName="북클럽" onClose={noop} />);
        expect(screen.getByRole('textbox')).toHaveValue('old-nick');
        expect(done()).toBeDisabled();
    });

    it('이름을 바꾸면 setMyProfile을 기존 thumbnail과 함께 호출하고, 저장 후 onClose된다', async () => {
        jest.useFakeTimers();
        setMyProfileMock.mockResolvedValue({});
        const onClose = jest.fn();
        render(<PlaceProfileEditDialog open placeName="북클럽" onClose={onClose} />);

        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'new-nick' } });
        await act(async () => {
            fireEvent.click(done());
        });

        expect(setMyProfileMock).toHaveBeenCalledWith({ nick: 'new-nick', thumbnail: 'data:img' });

        act(() => jest.advanceTimersByTime(1300));
        expect(onClose).toHaveBeenCalledTimes(1);
        jest.useRealTimers();
    });

    it('프로필이 없으면 빈 값으로 시작한다', () => {
        mockProfile = null;
        // Blank is only right once the server has said there is no profile.
        render(<PlaceProfileEditDialog open placeName="북클럽" onClose={noop} profileAbsent />);
        expect(screen.getByRole('textbox')).toHaveValue('');
        expect(done()).toBeDisabled();
    });

    it('제목에 placeName을 보간한다', () => {
        render(<PlaceProfileEditDialog open placeName="북클럽" onClose={noop} />);
        // Level-1 heading is the visible title (DialogTitle adds an sr-only h2 with the same text).
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('placeProfileEdit.title|북클럽');
    });

    // Reproduced in the browser: opened before my profile reached the device, the form latched an
    // empty name and kept it after the profile arrived.
    it('shows a loading screen, not a blank form, while my profile has not arrived', () => {
        mockProfile = null;
        render(<PlaceProfileEditDialog open placeName="북클럽" onClose={noop} />);

        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
        expect(screen.getByRole('status', { name: 'placeProfileEdit.loading' })).toBeInTheDocument();
    });

    it('opens seeded with my profile once it arrives', () => {
        mockProfile = null;
        const { rerender } = render(<PlaceProfileEditDialog open placeName="북클럽" onClose={noop} />);

        mockProfile = { nick: 'old-nick', thumbnail: 'data:img' };
        rerender(<PlaceProfileEditDialog open placeName="북클럽" onClose={noop} />);

        expect(screen.getByRole('textbox')).toHaveValue('old-nick');
    });

    it('can be closed from the loading screen', () => {
        mockProfile = null;
        const onClose = jest.fn();
        render(<PlaceProfileEditDialog open placeName="북클럽" onClose={onClose} />);

        fireEvent.click(screen.getByRole('button', { name: 'placeProfileEdit.close' }));

        expect(onClose).toHaveBeenCalled();
    });
});
