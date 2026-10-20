import '@testing-library/jest-dom';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { UpdateChannelDialog } from './UpdateChannelDialog';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/bridges', () => ({ logger: { error: jest.fn() } }));
jest.mock('@chatic/shared', () => ({ prepareImage: jest.fn() }));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));

const updateChannel = jest.fn().mockResolvedValue({});

// Stable channel reference — the real useChannel returns a memoized cache view, so the
// seed effect (`useEffect([channel])`) must not re-run on every render.
let mockChannel: Record<string, unknown> = {};
jest.mock('../hooks', () => ({
    useChannel: () => ({ channel: mockChannel }),
    useChannelMutations: () => ({ updateChannel, isPending: { update: false } }),
}));

beforeEach(() => {
    jest.clearAllMocks();
});

describe('UpdateChannelDialog — owner only', () => {
    it('소유자: 아바타 편집 가능·서브타이틀 없음, 저장 시 updateChannel(name, thumbnail)', async () => {
        mockChannel = { name: '방', thumbnail: '', isOwner: true, $join: undefined };
        render(<UpdateChannelDialog open onOpenChange={() => undefined} channelId="c1" />);

        expect(screen.getByText('updateChannel.heading')).toBeInTheDocument();
        // Owner avatar exposes the photo-select affordance.
        expect(screen.getByLabelText('updateChannel.selectPhoto')).toBeInTheDocument();

        // Field starts empty; the current room name (channel.name) is the placeholder for both roles.
        const input = screen.getByPlaceholderText('방');
        expect(input).toHaveValue('');
        fireEvent.change(input, { target: { value: '새 방 이름' } });
        fireEvent.click(screen.getByText('updateChannel.done'));

        await waitFor(() => expect(updateChannel).toHaveBeenCalledWith({ channelId: 'c1', name: '새 방 이름' }));
    });

    // A group is titled by its shared name for everyone, so a member has no name of their own to
    // save here. The settings row does not open this dialog for one; if it is opened anyway, it shows
    // the room as it is and saves nothing.
    it('saves nothing for a member who reaches it anyway', () => {
        mockChannel = { name: '소유자방', thumbnail: 'data:img', isOwner: false, $join: { nick: '내닉' } };
        render(<UpdateChannelDialog open onOpenChange={() => undefined} channelId="c1" />);

        expect(screen.queryByLabelText('updateChannel.selectPhoto')).not.toBeInTheDocument();

        fireEvent.change(screen.getByPlaceholderText('소유자방'), { target: { value: '나만의 방 이름' } });
        const done = screen.getByText('updateChannel.done').closest('button');
        expect(done).toBeDisabled();
        fireEvent.click(screen.getByText('updateChannel.done'));
        expect(updateChannel).not.toHaveBeenCalled();
    });

    it('변경이 없으면 완료 버튼이 비활성이다', () => {
        mockChannel = { name: '방', thumbnail: '', isOwner: true, $join: undefined };
        render(<UpdateChannelDialog open onOpenChange={() => undefined} channelId="c1" />);

        expect(screen.getByText('updateChannel.done').closest('button')).toBeDisabled();
    });
});
