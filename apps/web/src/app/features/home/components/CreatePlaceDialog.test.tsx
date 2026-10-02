import '@testing-library/jest-dom';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { CreatePlaceDialog } from './CreatePlaceDialog';

const createPlaceMock = jest.fn();
const switchSiteMock = jest.fn();
const setMyPlaceProfileMock = jest.fn();
// What the profile-step stub last received, so a test can drive it.
let profileStep: {
    placeName: string;
    dismissible?: boolean;
    onSubmit: (value: { nick: string }) => Promise<void>;
    onDone: () => void;
    onExit: () => void;
} | null = null;

jest.mock('../../../hooks', () => ({
    useCreatePlace: () => ({ createPlace: createPlaceMock }),
    useSetMyPlaceProfile: () => setMyPlaceProfileMock,
}));
jest.mock('../../../ui/components/PlaceProfileCreateDialog', () => ({
    PlaceProfileCreateDialog: (props: NonNullable<typeof profileStep>) => {
        profileStep = props;
        return <div>profile-step</div>;
    },
}));
jest.mock('../../../runtime/useSiteSwitch', () => ({ useSiteSwitch: () => ({ switchSite: switchSiteMock }) }));
jest.mock('@chatic/shared', () => ({ prepareImage: jest.fn() }));
jest.mock('@chatic/bridges', () => ({ logger: { error: jest.fn() } }));
jest.mock('react-i18next', () => ({
    // Echo the key so assertions can target keys directly.
    useTranslation: () => ({ t: (k: string) => k }),
}));

const done = () => screen.getByRole('button', { name: 'createPlace.done' });
const close = () => screen.getByRole('button', { name: 'createPlace.close' });
const type = (value: string) => fireEvent.change(screen.getByRole('textbox'), { target: { value } });
const nameField = () => screen.getByRole('textbox');
// The decorative header is not unmounted while typing, only collapsed behind `aria-hidden` — which
// is exactly what `*ByRole` ignores, so its absence here is the compact layout being in effect.
// `level: 1` picks the visible heading over the dialog's own sr-only <h2> of the same name.
const header = () => screen.queryByRole('heading', { name: 'createPlace.title', level: 1 });

beforeEach(() => {
    jest.clearAllMocks();
    profileStep = null;
});

/** Fills in a name and confirms, returning once the profile step is up. */
const createAndEnter = async (onOpenChange = jest.fn()) => {
    createPlaceMock.mockResolvedValue({ id: 'site-1' });
    switchSiteMock.mockResolvedValue(undefined);
    render(<CreatePlaceDialog open onOpenChange={onOpenChange} />);
    type('  책모임  ');
    fireEvent.click(done());
    await waitFor(() => expect(screen.getByText('profile-step')).toBeInTheDocument());
    return onOpenChange;
};

describe('CreatePlaceDialog', () => {
    it('완료 버튼은 유효한 이름 전에는 비활성, 입력하면 활성화된다', () => {
        render(<CreatePlaceDialog open onOpenChange={jest.fn()} />);

        expect(done()).toBeDisabled();
        type('책모임');
        expect(done()).toBeEnabled();
    });

    it('20자를 넘으면 초과 카운터를 노출하고 완료가 비활성된다', () => {
        render(<CreatePlaceDialog open onOpenChange={jest.fn()} />);

        type('a'.repeat(21));

        expect(screen.getByText('21/20')).toBeInTheDocument();
        expect(done()).toBeDisabled();
    });

    it('creates the place, switches into it, then asks for my profile there instead of closing', async () => {
        const onOpenChange = await createAndEnter();

        expect(createPlaceMock).toHaveBeenCalledWith({ name: '책모임', thumbnail: undefined });
        expect(switchSiteMock).toHaveBeenCalledWith('site-1');
        expect(profileStep?.placeName).toBe('책모임');
        expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('saves the profile through the active-place write and closes the flow when done', async () => {
        setMyPlaceProfileMock.mockResolvedValue(undefined);
        const onOpenChange = await createAndEnter();

        await act(async () => {
            await profileStep?.onSubmit({ nick: 'Raine' });
        });
        act(() => profileStep?.onDone());

        expect(setMyPlaceProfileMock).toHaveBeenCalledWith({ nick: 'Raine' });
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('offers no way out of the profile step until a save has failed', async () => {
        setMyPlaceProfileMock.mockRejectedValue(new Error('save failed'));
        const onOpenChange = await createAndEnter();
        expect(profileStep?.dismissible).toBe(false);

        await act(async () => {
            await expect(profileStep?.onSubmit({ nick: 'Raine' })).rejects.toThrow('save failed');
        });

        expect(profileStep?.dismissible).toBe(true);
        act(() => profileStep?.onExit());
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('retries only the switch after it failed, so a second tap makes no second place', async () => {
        createPlaceMock.mockResolvedValue({ id: 'site-1' });
        switchSiteMock.mockRejectedValueOnce(new Error('403')).mockResolvedValueOnce(undefined);
        render(<CreatePlaceDialog open onOpenChange={jest.fn()} />);
        type('책모임');

        fireEvent.click(done());
        await waitFor(() => expect(screen.getByText('createPlace.saveError')).toBeInTheDocument());
        expect(screen.queryByText('profile-step')).not.toBeInTheDocument();

        fireEvent.click(done());
        await waitFor(() => expect(screen.getByText('profile-step')).toBeInTheDocument());

        expect(createPlaceMock).toHaveBeenCalledTimes(1);
        expect(switchSiteMock).toHaveBeenNthCalledWith(2, 'site-1');
    });

    it('names the place that was created in the profile step, even if the field was edited before the retry', async () => {
        createPlaceMock.mockResolvedValue({ id: 'site-1', name: '책모임' });
        switchSiteMock.mockRejectedValueOnce(new Error('403')).mockResolvedValueOnce(undefined);
        render(<CreatePlaceDialog open onOpenChange={jest.fn()} />);
        type('책모임');
        fireEvent.click(done());
        await waitFor(() => expect(screen.getByText('createPlace.saveError')).toBeInTheDocument());

        type('다른이름');
        fireEvent.click(done());
        await waitFor(() => expect(screen.getByText('profile-step')).toBeInTheDocument());

        expect(profileStep?.placeName).toBe('책모임');
    });

    it('createPlace가 실패하면 에러를 노출하고 전환/닫기를 하지 않는다', async () => {
        createPlaceMock.mockRejectedValue(new Error('nope'));
        const onOpenChange = jest.fn();
        render(<CreatePlaceDialog open onOpenChange={onOpenChange} />);

        type('책모임');
        fireEvent.click(done());

        await waitFor(() => expect(screen.getByText('createPlace.saveError')).toBeInTheDocument());
        expect(switchSiteMock).not.toHaveBeenCalled();
        expect(onOpenChange).not.toHaveBeenCalled();
        expect(done()).toBeEnabled();
    });

    it('입력이 없으면 닫기 시 바로 닫는다', () => {
        const onOpenChange = jest.fn();
        render(<CreatePlaceDialog open onOpenChange={onOpenChange} />);

        fireEvent.click(close());

        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('입력이 있으면 닫기 시 이탈 확인 모달을 띄우고, 나가기를 누르면 닫는다', async () => {
        const onOpenChange = jest.fn();
        render(<CreatePlaceDialog open onOpenChange={onOpenChange} />);

        type('x');
        fireEvent.click(close());

        const leave = await screen.findByRole('button', { name: 'createPlace.exitLeave' });
        expect(onOpenChange).not.toHaveBeenCalled();

        fireEvent.click(leave);
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('이름 입력칸에 포커스하면 헤더를 접고, 포커스가 빠지면 되돌린다', () => {
        render(<CreatePlaceDialog open onOpenChange={jest.fn()} />);

        expect(header()).toBeInTheDocument();
        expect(screen.getByText('createPlace.photoOptional')).toBeVisible();

        fireEvent.focus(nameField());
        expect(header()).not.toBeInTheDocument();

        fireEvent.blur(nameField());
        expect(header()).toBeInTheDocument();
    });

    it('키보드의 완료 키(Enter)로도 플레이스를 만든다 — 이름이 없으면 아무 일도 없다', async () => {
        createPlaceMock.mockResolvedValue({ id: 'pl-1' });
        render(<CreatePlaceDialog open onOpenChange={jest.fn()} />);

        fireEvent.keyDown(nameField(), { key: 'Enter' });
        expect(createPlaceMock).not.toHaveBeenCalled();

        type('책모임');
        fireEvent.keyDown(nameField(), { key: 'Enter' });

        await waitFor(() => expect(createPlaceMock).toHaveBeenCalledTimes(1));
        expect(switchSiteMock).toHaveBeenCalledWith('pl-1');
    });
});
