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
