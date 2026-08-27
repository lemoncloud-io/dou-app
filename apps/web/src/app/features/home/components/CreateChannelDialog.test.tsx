import '@testing-library/jest-dom';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { CreateChannelDialog } from './CreateChannelDialog';

const createChannelMock = jest.fn();
const navigateMock = jest.fn();

jest.mock('../../channels/hooks', () => ({ useCreateChannel: () => ({ createChannel: createChannelMock }) }));
jest.mock('@chatic/shared', () => ({
    resizeImageToBase64: jest.fn(),
    useNavigateWithTransition: () => navigateMock,
}));
jest.mock('@chatic/bridges', () => ({ logger: { error: jest.fn() } }));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k }),
}));

const done = () => screen.getByRole('button', { name: 'createChannel.done' });
const close = () => screen.getByRole('button', { name: 'createChannel.close' });
const type = (value: string) => fireEvent.change(screen.getByRole('textbox'), { target: { value } });
const nameField = () => screen.getByRole('textbox');
// The decorative header is not unmounted while typing, only collapsed behind `aria-hidden` — which
// is exactly what `*ByRole` ignores, so its absence here is the compact layout being in effect.
// `level: 1` picks the visible heading over the dialog's own sr-only <h2> of the same name.
const header = () => screen.queryByRole('heading', { name: 'createChannel.title', level: 1 });

beforeEach(() => jest.clearAllMocks());

describe('CreateChannelDialog', () => {
    it('완료 버튼은 유효한 이름 전에는 비활성, 입력하면 활성화된다', () => {
        render(<CreateChannelDialog open onOpenChange={jest.fn()} />);

        expect(done()).toBeDisabled();
        type('여름 여행');
        expect(done()).toBeEnabled();
    });

    it('20자를 넘으면 초과 카운터를 노출하고 완료가 비활성된다', () => {
        render(<CreateChannelDialog open onOpenChange={jest.fn()} />);

        type('a'.repeat(21));

        expect(screen.getByText('21/20')).toBeInTheDocument();
        expect(done()).toBeDisabled();
    });

    it('완료 시 private 방을 만들고 그 방으로 이동한 뒤 닫는다', async () => {
        createChannelMock.mockResolvedValue({ id: 'ch-1' });
        const onOpenChange = jest.fn();
        render(<CreateChannelDialog open onOpenChange={onOpenChange} />);

        type('  여름 여행  ');
        fireEvent.click(done());

        await waitFor(() =>
            expect(createChannelMock).toHaveBeenCalledWith({
                stereo: 'private',
                name: '여름 여행',
                thumbnail: undefined,
            })
        );
        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
        expect(navigateMock).toHaveBeenCalledWith('/channels/ch-1/room');
    });

    it('createChannel이 실패하면 에러를 노출하고 이동/닫기를 하지 않는다', async () => {
        createChannelMock.mockRejectedValue(new Error('nope'));
        const onOpenChange = jest.fn();
        render(<CreateChannelDialog open onOpenChange={onOpenChange} />);

        type('여름 여행');
        fireEvent.click(done());

        await waitFor(() => expect(screen.getByText('createChannel.saveError')).toBeInTheDocument());
        expect(navigateMock).not.toHaveBeenCalled();
        expect(onOpenChange).not.toHaveBeenCalled();
        expect(done()).toBeEnabled();
    });

    it('이름 입력칸에 포커스하면 헤더를 접고, 포커스가 빠지면 되돌린다', () => {
        render(<CreateChannelDialog open onOpenChange={jest.fn()} />);

        expect(header()).toBeInTheDocument();
        expect(screen.getByText('createChannel.photoOptional')).toBeVisible();

        fireEvent.focus(nameField());
        expect(header()).not.toBeInTheDocument();

        fireEvent.blur(nameField());
        expect(header()).toBeInTheDocument();
    });

    it('키보드의 완료 키(Enter)로도 방을 만든다 — 이름이 없으면 아무 일도 없다', async () => {
        createChannelMock.mockResolvedValue({ id: 'ch-1' });
        render(<CreateChannelDialog open onOpenChange={jest.fn()} />);

        fireEvent.keyDown(nameField(), { key: 'Enter' });
        expect(createChannelMock).not.toHaveBeenCalled();

        type('여름 여행');
        fireEvent.keyDown(nameField(), { key: 'Enter' });

        await waitFor(() => expect(createChannelMock).toHaveBeenCalledTimes(1));
        expect(navigateMock).toHaveBeenCalledWith('/channels/ch-1/room');
    });

    it('입력이 있으면 닫기 시 이탈 확인 모달을 띄우고, 나가기를 누르면 닫는다', async () => {
        const onOpenChange = jest.fn();
        render(<CreateChannelDialog open onOpenChange={onOpenChange} />);

        type('x');
        fireEvent.click(close());

        const leave = await screen.findByRole('button', { name: 'createChannel.exitLeave' });
        expect(onOpenChange).not.toHaveBeenCalled();

        fireEvent.click(leave);
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });
});
