import '@testing-library/jest-dom';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { UpdateChannelDialog } from './UpdateChannelDialog';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/bridges', () => ({ logger: { error: jest.fn() } }));
jest.mock('@chatic/shared', () => ({ resizeImageToBase64: jest.fn() }));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));

const updateChannel = jest.fn().mockResolvedValue({});
const updateJoin = jest.fn().mockResolvedValue({});

// Stable channel reference — the real useChannel returns a memoized cache view, so the
// seed effect (`useEffect([channel])`) must not re-run on every render.
let mockChannel: Record<string, unknown> = {};
jest.mock('../hooks', () => ({
    useChannel: () => ({ channel: mockChannel }),
    useChannelMutations: () => ({ updateChannel, isPending: { update: false } }),
    useJoinMutations: () => ({ updateJoin, isPending: { update: false } }),
}));

beforeEach(() => {
    jest.clearAllMocks();
});

describe('UpdateChannelDialog — 역할별 2모드', () => {
    it('소유자: 아바타 편집 가능·서브타이틀 없음, 저장 시 updateChannel(name, thumbnail)', async () => {
        mockChannel = { name: '방', thumbnail: '', isOwner: true, $join: undefined };
        render(<UpdateChannelDialog open onOpenChange={() => undefined} channelId="c1" />);

        expect(screen.getByText('updateChannel.heading')).toBeInTheDocument();
        expect(screen.queryByText('updateChannel.invitedSubtitle')).not.toBeInTheDocument();
        // Owner avatar exposes the photo-select affordance.
        expect(screen.getByLabelText('updateChannel.selectPhoto')).toBeInTheDocument();

        // Field starts empty; the current room name (channel.name) is the placeholder for both roles.
        const input = screen.getByPlaceholderText('방');
        expect(input).toHaveValue('');
        fireEvent.change(input, { target: { value: '새 방 이름' } });
        fireEvent.click(screen.getByText('updateChannel.done'));

        await waitFor(() => expect(updateChannel).toHaveBeenCalledWith({ channelId: 'c1', name: '새 방 이름' }));
        expect(updateJoin).not.toHaveBeenCalled();
    });

    it('초대받은자: 서브타이틀·아바타 읽기전용·소유자 방 이름 캡션, 저장 시 updateJoin(nick)', async () => {
        mockChannel = { name: '소유자방', thumbnail: 'data:img', isOwner: false, $join: { nick: '내닉' } };
        render(<UpdateChannelDialog open onOpenChange={() => undefined} channelId="c1" />);

        expect(screen.getByText('updateChannel.invitedSubtitle')).toBeInTheDocument();
        // No photo-select affordance for invited members.
        expect(screen.queryByLabelText('updateChannel.selectPhoto')).not.toBeInTheDocument();
        // Caption shows the owner-set room name.
        expect(screen.getByText('소유자방')).toBeInTheDocument();

        // Placeholder shows the owner room name; field starts empty for both roles.
        const input = screen.getByPlaceholderText('소유자방');
        expect(input).toHaveValue('');
        fireEvent.change(input, { target: { value: '나만의 방 이름' } });
        fireEvent.click(screen.getByText('updateChannel.done'));

        await waitFor(() => expect(updateJoin).toHaveBeenCalledWith({ channelId: 'c1', nick: '나만의 방 이름' }));
        expect(updateChannel).not.toHaveBeenCalled();
    });

    it('변경이 없으면 완료 버튼이 비활성이다', () => {
        mockChannel = { name: '방', thumbnail: '', isOwner: true, $join: undefined };
        render(<UpdateChannelDialog open onOpenChange={() => undefined} channelId="c1" />);

        expect(screen.getByText('updateChannel.done').closest('button')).toBeDisabled();
    });
});
