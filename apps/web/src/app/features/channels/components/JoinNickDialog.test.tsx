import '@testing-library/jest-dom';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { JoinNickDialog } from './JoinNickDialog';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/bridges', () => ({ logger: { error: jest.fn() } }));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('@chatic/web-core', () => ({ useSessionIdentity: () => ({ userId: 'session-me' }) }));

const updateJoin = jest.fn().mockResolvedValue({});
// Stable channel reference so the prefill effect (`useEffect([open, channel])`) runs once.
const mockChannel = { $join: { nick: '내 메모', userId: 'me-join' } };
jest.mock('../hooks', () => ({
    useChannel: () => ({ channel: mockChannel }),
    useJoinMutations: () => ({ updateJoin, isPending: { update: false } }),
}));
// The dialog surfaces my place-profile nick as the placeholder. Mock the app-level hooks barrel
// so the test doesn't pull in the real app-runtime (socket lib) transitively.
jest.mock('../../../hooks', () => ({ useMyProfile: () => ({ profile: { nick: '플레이스닉' } }) }));

describe('JoinNickDialog', () => {
    beforeEach(() => updateJoin.mockClear());

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
