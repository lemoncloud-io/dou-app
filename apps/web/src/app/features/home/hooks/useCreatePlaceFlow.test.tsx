import '@testing-library/jest-dom';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { useCreatePlaceFlow } from './useCreatePlaceFlow';

// The flow's contract is the SEQUENCING between the two dialogs and the create job underneath them,
// so both dialogs are stubbed down to the props the flow drives; their own behavior is covered by
// their component tests.
jest.mock('../components/CreatePlaceDialog', () => ({
    CreatePlaceDialog: ({
        open,
        onSubmit,
    }: {
        open: boolean;
        onSubmit: (input: { name: string; thumbnail?: string }) => void;
    }) => (open ? <button onClick={() => onSubmit({ name: '책모임' })}>create-submit</button> : null),
}));
// Stands in for PlaceProfileForm's submit handling: a rejection stays on screen and shows the
// message the rejection carries (`userMessage`), which is how the flow names the failing step.
jest.mock('../../../ui/components/PlaceProfileCreateDialog', () => {
    const { useState } = require('react');
    return {
        PlaceProfileCreateDialog: ({
            open,
            placeName,
            dismissible,
            onSubmit,
            onDone,
        }: {
            open: boolean;
            placeName: string;
            dismissible?: boolean;
            onSubmit: (value: { nick: string }) => Promise<void>;
            onDone: () => void;
        }) => {
            const [error, setError] = useState('');
            if (!open) return null;
            return (
                <div data-testid="profile-step" data-dismissible={String(dismissible)} data-place-name={placeName}>
                    {error ? <span data-testid="submit-error">{error}</span> : null}
                    <button
                        onClick={() => {
                            setError('');
                            void onSubmit({ nick: '레인' }).then(onDone, (rejected: { userMessage?: string }) =>
                                setError(rejected?.userMessage || 'profile-save-error')
                            );
                        }}
                    >
                        profile-submit
                    </button>
                </div>
            );
        },
    };
});

const createPlaceMock = jest.fn();
const switchSiteMock = jest.fn();
const setMyPlaceProfileMock = jest.fn();

jest.mock('./useCreatePlace', () => ({ useCreatePlace: () => ({ createPlace: createPlaceMock }) }));
jest.mock('../../../runtime/useSiteSwitch', () => ({ useSiteSwitch: () => ({ switchSite: switchSiteMock }) }));
jest.mock('../../../hooks', () => ({ useSetMyPlaceProfile: () => setMyPlaceProfileMock }));
jest.mock('@chatic/bridges', () => ({ logger: { error: jest.fn() } }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

const Host = () => {
    const { openCreatePlace, createPlaceFlow } = useCreatePlaceFlow();
    return (
        <>
            <button onClick={openCreatePlace}>open-flow</button>
            {createPlaceFlow}
        </>
    );
};

const open = () => fireEvent.click(screen.getByRole('button', { name: 'open-flow' }));
const submitCreate = () => fireEvent.click(screen.getByRole('button', { name: 'create-submit' }));
const submitProfile = () => fireEvent.click(screen.getByRole('button', { name: 'profile-submit' }));

beforeEach(() => {
    jest.clearAllMocks();
    createPlaceMock.mockResolvedValue({ id: 'site-1' });
    switchSiteMock.mockResolvedValue(undefined);
    setMyPlaceProfileMock.mockResolvedValue(undefined);
});

describe('useCreatePlaceFlow', () => {
    it('생성 확인 즉시 프로필 스텝이 dismissible=false로, 방금 입력한 이름으로 열린다', () => {
        render(<Host />);
        open();

        submitCreate();

        const step = screen.getByTestId('profile-step');
        expect(step).toHaveAttribute('data-dismissible', 'false');
        expect(step).toHaveAttribute('data-place-name', '책모임');
    });

    it('프로필 저장은 생성+전환이 끝난 뒤에, 생성된 플레이스 id에 고정해서 보낸다', async () => {
        render(<Host />);
        open();
        submitCreate();

        submitProfile();

        await waitFor(() => expect(setMyPlaceProfileMock).toHaveBeenCalledWith({ nick: '레인' }, 'site-1'));
        // Ordering, not just occurrence: the profile write must not race the place it belongs to.
        expect(createPlaceMock.mock.invocationCallOrder[0]).toBeLessThan(
            setMyPlaceProfileMock.mock.invocationCallOrder[0]
        );
        expect(switchSiteMock.mock.invocationCallOrder[0]).toBeLessThan(
            setMyPlaceProfileMock.mock.invocationCallOrder[0]
        );
        await waitFor(() => expect(screen.queryByTestId('profile-step')).not.toBeInTheDocument());
    });

    it('생성이 실패하면 프로필을 쓰지 않고, 스텝을 빠져나갈 수 있게 열어둔다', async () => {
        createPlaceMock.mockRejectedValue(new Error('nope'));
        render(<Host />);
        open();
        submitCreate();

        submitProfile();

        // The place step is what failed, so the message says so instead of blaming the profile.
        await waitFor(() => expect(screen.getByTestId('submit-error')).toHaveTextContent('createPlace.saveError'));
        expect(setMyPlaceProfileMock).not.toHaveBeenCalled();
        expect(screen.getByTestId('profile-step')).toHaveAttribute('data-dismissible', 'true');
    });

    it('전환만 실패했다가 재시도하면 플레이스를 다시 만들지 않는다', async () => {
        switchSiteMock.mockRejectedValueOnce(new Error('switch failed'));
        render(<Host />);
        open();
        submitCreate();

        submitProfile();
        await waitFor(() => expect(screen.getByTestId('submit-error')).toBeInTheDocument());

        submitProfile();

        await waitFor(() => expect(setMyPlaceProfileMock).toHaveBeenCalledWith({ nick: '레인' }, 'site-1'));
        expect(createPlaceMock).toHaveBeenCalledTimes(1);
        expect(switchSiteMock).toHaveBeenCalledTimes(2);
    });

    it('열기 전에는 아무 다이얼로그도 렌더하지 않는다', () => {
        render(<Host />);

        expect(screen.queryByRole('button', { name: 'create-submit' })).not.toBeInTheDocument();
        expect(screen.queryByTestId('profile-step')).not.toBeInTheDocument();
    });
});
