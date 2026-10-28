import '@testing-library/jest-dom';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { JoinNickDialog } from './JoinNickDialog';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/bridges', () => ({ logger: { error: jest.fn(), warn: jest.fn() } }));
const mockPrepareImage = jest.fn();
jest.mock('@chatic/shared', () => ({
    AVATAR_IMAGE: {},
    prepareImage: (...args: unknown[]) => mockPrepareImage(...args),
}));
const mockToast = jest.fn();
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            useSessionIdentity: () => ({ userId: 'session-me' }),
        },
    },
}));

const updateJoin = jest.fn().mockResolvedValue({ delivered: Promise.resolve() });
// Stable channel reference so the prefill effect (`useEffect([open, channel])`) runs once.
// Off only to stage a reopen before the channel has emitted.
let mockChannelLoaded = true;
const mockChannel = { $join: { nick: '내 메모', userId: 'me-join' }, thumbnail: '' };
const updateChannel = jest.fn().mockResolvedValue({});
jest.mock('../hooks', () => ({
    useChannel: () => ({ channel: mockChannelLoaded ? mockChannel : undefined }),
    useJoinMutations: () => ({ updateJoin, isPending: { update: false } }),
    useChannelMutations: () => ({ updateChannel, isPending: { update: false } }),
}));
// The dialog surfaces my place-profile nick as the placeholder. Mock the app-level hooks barrel
// so the test doesn't pull in the real app-runtime (socket lib) transitively.
jest.mock('../../../hooks', () => ({ useMyProfile: () => ({ profile: { nick: '플레이스닉' } }) }));

describe('JoinNickDialog', () => {
    beforeEach(() => {
        updateJoin.mockClear();
        updateChannel.mockClear();
        mockToast.mockClear();
        mockPrepareImage.mockReset();
        mockChannelLoaded = true;
    });

    const doneButton = (copy = 'selfChat') => screen.getByText(`${copy}.name.done`).closest('button')!;
    const pickPhoto = (base64: string) => {
        mockPrepareImage.mockResolvedValue({ avatar: base64 });
        const file = new File(['x'], 'photo.png', { type: 'image/png' });
        fireEvent.change(screen.getByTestId('self-chat-photo-input'), { target: { files: [file] } });
    };

    // 'Done' is for a change: with nothing changed it stays off, in both variants.
    describe('the done button', () => {
        it('is disabled while nothing has changed', () => {
            render(<JoinNickDialog open onOpenChange={() => undefined} channelId="c1" />);

            expect(doneButton()).toBeDisabled();
        });

        it('turns on once the name differs and off again when it is put back', () => {
            render(<JoinNickDialog open onOpenChange={() => undefined} channelId="c1" />);

            fireEvent.change(screen.getByRole('textbox'), { target: { value: '새이름' } });
            expect(doneButton()).toBeEnabled();
            fireEvent.change(screen.getByRole('textbox'), { target: { value: ' 내 메모 ' } });
            expect(doneButton()).toBeDisabled();
        });

        it('turns on once a photo is picked', async () => {
            render(<JoinNickDialog open onOpenChange={() => undefined} channelId="c1" />);

            pickPhoto('data:image/png;base64,AAA');

            await waitFor(() => expect(doneButton()).toBeEnabled());
        });

        it('applies to the 1:1 variant too', () => {
            render(<JoinNickDialog open onOpenChange={() => undefined} channelId="c1" variant="dm" />);

            expect(doneButton('dmChat')).toBeDisabled();
            fireEvent.change(screen.getByRole('textbox'), { target: { value: '토끼' } });
            expect(doneButton('dmChat')).toBeEnabled();
        });
    });

    // Reopened before the channel emits, the dialog has nothing to seed from — it must not show the
    // name typed last time, nor count it as a change.
    it('opens fresh after a close, not with what was typed last time', () => {
        const { rerender } = render(<JoinNickDialog open onOpenChange={() => undefined} channelId="c1" />);
        fireEvent.change(screen.getByRole('textbox'), { target: { value: '버린 이름' } });

        rerender(<JoinNickDialog open={false} onOpenChange={() => undefined} channelId="c1" />);
        mockChannelLoaded = false;
        rerender(<JoinNickDialog open onOpenChange={() => undefined} channelId="c1" />);

        expect(screen.getByRole('textbox')).toHaveValue('');
    });

    describe("the self chat's photo", () => {
        it('saves a picked photo on the channel without touching the name', async () => {
            const onOpenChange = jest.fn();
            render(<JoinNickDialog open onOpenChange={onOpenChange} channelId="c1" />);

            pickPhoto('data:image/png;base64,AAA');
            await waitFor(() => expect(doneButton()).toBeEnabled());
            fireEvent.click(doneButton());

            await waitFor(() =>
                expect(updateChannel).toHaveBeenCalledWith({ channelId: 'c1', thumbnail: 'data:image/png;base64,AAA' })
            );
            expect(updateJoin).not.toHaveBeenCalled();
            expect(mockToast).toHaveBeenCalledWith({ title: 'selfChat.name.infoSuccess' });
            expect(onOpenChange).toHaveBeenCalledWith(false);
        });

        it('saves the photo and then the name when both changed', async () => {
            render(<JoinNickDialog open onOpenChange={() => undefined} channelId="c1" />);

            pickPhoto('data:image/png;base64,BBB');
            fireEvent.change(screen.getByRole('textbox'), { target: { value: '새이름' } });
            await waitFor(() => expect(doneButton()).toBeEnabled());
            fireEvent.click(doneButton());

            await waitFor(() =>
                expect(updateJoin).toHaveBeenCalledWith({ channelId: 'c1', userId: 'me-join', nick: '새이름' })
            );
            expect(updateChannel).toHaveBeenCalledWith({ channelId: 'c1', thumbnail: 'data:image/png;base64,BBB' });
            expect(mockToast).toHaveBeenCalledWith({ title: 'selfChat.name.infoSuccess' });
        });

        it('stays open and says so when the photo is refused, and does not write the name', async () => {
            updateChannel.mockRejectedValueOnce(new Error('403'));
            const onOpenChange = jest.fn();
            render(<JoinNickDialog open onOpenChange={onOpenChange} channelId="c1" />);

            pickPhoto('data:image/png;base64,CCC');
            fireEvent.change(screen.getByRole('textbox'), { target: { value: '새이름' } });
            await waitFor(() => expect(doneButton()).toBeEnabled());
            fireEvent.click(doneButton());

            await waitFor(() =>
                expect(mockToast).toHaveBeenCalledWith({ title: 'selfChat.name.infoError', variant: 'destructive' })
            );
            expect(updateJoin).not.toHaveBeenCalled();
            expect(onOpenChange).not.toHaveBeenCalled();
        });

        it('shows no photo picker in the 1:1 variant', () => {
            render(<JoinNickDialog open onOpenChange={() => undefined} channelId="c1" variant="dm" />);

            expect(screen.queryByTestId('self-chat-photo-input')).not.toBeInTheDocument();
        });
    });

    it('closes at once and says so later if the server refuses the name', async () => {
        updateJoin.mockImplementationOnce(async () => ({ delivered: Promise.reject(new Error('403 FORBIDDEN')) }));
        const onOpenChange = jest.fn();
        render(<JoinNickDialog open onOpenChange={onOpenChange} channelId="c1" />);

        fireEvent.change(screen.getByRole('textbox'), { target: { value: '새이름' } });
        fireEvent.click(screen.getByText('selfChat.name.done'));

        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
        await waitFor(() =>
            expect(mockToast).toHaveBeenCalledWith({ title: 'selfChat.name.error', variant: 'destructive' })
        );
    });

    it('현재 nick을 프리필하고 라벨/헬퍼/완료 버튼을 노출한다', () => {
        render(<JoinNickDialog open onOpenChange={() => undefined} channelId="c1" />);

        expect(screen.getByText('selfChat.name.title')).toBeInTheDocument();
        expect(screen.getByText('selfChat.name.label')).toBeInTheDocument();
        expect(screen.getByText('selfChat.name.helper')).toBeInTheDocument();
        expect(screen.getByText('selfChat.name.done')).toBeInTheDocument();
        expect(screen.getByRole('textbox')).toHaveValue('내 메모');
    });

    it('플레이스홀더로 내 플레이스 프로필 nick을 노출한다', () => {
        render(<JoinNickDialog open onOpenChange={() => undefined} channelId="c1" />);

        expect(screen.getByRole('textbox')).toHaveAttribute('placeholder', '플레이스닉');
    });

    it('저장 시 join.userId와 트림된 nick으로 updateJoin을 호출하고 닫는다', async () => {
        const onOpenChange = jest.fn();
        render(<JoinNickDialog open onOpenChange={onOpenChange} channelId="c1" />);

        fireEvent.change(screen.getByRole('textbox'), { target: { value: '  새이름  ' } });
        fireEvent.click(screen.getByText('selfChat.name.done'));

        await waitFor(() =>
            expect(updateJoin).toHaveBeenCalledWith({ channelId: 'c1', userId: 'me-join', nick: '새이름' })
        );
        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    });

    it('빈 값으로 저장하면 nick을 빈 문자열로 보낸다 (커스텀 이름 제거)', async () => {
        render(<JoinNickDialog open onOpenChange={() => undefined} channelId="c1" />);

        fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } });
        fireEvent.click(screen.getByText('selfChat.name.done'));

        await waitFor(() => expect(updateJoin).toHaveBeenCalledWith({ channelId: 'c1', userId: 'me-join', nick: '' }));
    });

    // ADR-0039: the DM variant is the same write with different copy, plus a caller-supplied
    // placeholder (the name the room falls back to) instead of my own profile nick.
    describe('dm 변형', () => {
        it('dmChat 카피를 쓴다', () => {
            render(<JoinNickDialog open onOpenChange={() => undefined} channelId="c1" variant="dm" />);

            expect(screen.getByText('dmChat.name.title')).toBeInTheDocument();
            expect(screen.getByText('dmChat.name.label')).toBeInTheDocument();
            expect(screen.getByText('dmChat.name.done')).toBeInTheDocument();
            expect(screen.queryByText('selfChat.name.title')).not.toBeInTheDocument();
        });

        it('플레이스홀더로 넘겨받은 폴백 이름을 쓴다 (내 프로필 닉이 아니다)', () => {
            render(
                <JoinNickDialog open onOpenChange={() => undefined} channelId="c1" variant="dm" fallbackName="토끼" />
            );

            expect(screen.getByRole('textbox')).toHaveAttribute('placeholder', '토끼');
        });

        it('self와 같은 join.update를 호출한다', async () => {
            render(<JoinNickDialog open onOpenChange={() => undefined} channelId="c1" variant="dm" />);

            fireEvent.change(screen.getByRole('textbox'), { target: { value: '토끼친구' } });
            fireEvent.click(screen.getByText('dmChat.name.done'));

            await waitFor(() =>
                expect(updateJoin).toHaveBeenCalledWith({ channelId: 'c1', userId: 'me-join', nick: '토끼친구' })
            );
        });
    });
});
