import '@testing-library/jest-dom';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { PlaceChannelManagePage } from './PlaceChannelManagePage';

const deleteChannel = jest.fn().mockResolvedValue({});
const leaveChannel = jest.fn().mockResolvedValue({});
const readInCloud = jest.fn().mockResolvedValue(undefined);
const toggle = jest.fn();
const toast = jest.fn();

// Mutable per-test values.
let placeValue: any;
let channelsValue: any[];
let unreadByChannel: Record<string, number>;
let pinnedIds: string[];
let selectedCloudId = 'cloud-1';
let sentInvitesValue: any[] = [];
let lastChatsValue = new Map<string, any>();

const navigate = jest.fn();

jest.mock('react-router-dom', () => ({ useParams: () => ({ placeId: 'place-1' }) }));
jest.mock('@chatic/shared', () => ({
    ...jest.requireActual('@chatic/shared'),
    useNavigateWithTransition: () => navigate,
    // Pinned channels moved to @chatic/shared — stub the hook (needs the config store).
    usePinnedChannels: () => ({ pinnedIds, toggle, reorder: jest.fn() }),
}));
jest.mock('../../invite/hooks/useInviteListRows', () => ({
    useInviteListRows: () => ({ invites: sentInvitesValue, isLoading: false }),
}));
jest.mock('../../invite/components/InviteChannelRow', () => ({
    InviteChannelRow: ({ invite, onClick }: any) => <div onClick={onClick}>{invite.name}</div>,
}));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        // Surface interpolated counts so the button/dialog labels stay assertable.
        t: (key: string, options?: any) =>
            options && typeof options.count === 'number' ? `${key}:${options.count}` : key,
        i18n: { language: 'ko' },
    }),
}));
jest.mock('@chatic/bridges', () => ({ logger: { error: jest.fn() } }));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));

// app-runtime pulls the socket lib (needs TextEncoder, unavailable in jsdom) — stub the repos.
jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: () => ({
                place: {
                    observeItem: (_id: string, cb: (value: any) => void) => {
                        cb(placeValue);
                        return () => undefined;
                    },
                },
            }),
            // The room cloud's join repository; `readInCloud(cid, input)` stands for its outbox receipt.
            getCloudRepositories: (cid: string) => ({
                join: { readChat: (input: unknown) => Promise.resolve({ delivered: readInCloud(cid, input) }) },
            }),
        },
        session: {
            useSessionIdentity: () => ({ userId: 'me' }),
            useSessionSelection: () => ({ selectedCloudId }),
        },
    },
}));

// Avoid the ui barrel (it imports @chatic/assets, unmapped in jest).
jest.mock('../../../ui', () => ({
    PageHeader: (p: any) => (
        <div>
            {p.title}
            {p.rightAction}
        </div>
    ),
}));

jest.mock('../../channels/hooks', () => ({
    useChannelMutations: () => ({ deleteChannel, leaveChannel }),
    // DM rows are named from one page-level profile subscription (useDmPeers.test.ts covers it);
    // this list has no DM rows, so an empty map is the whole contract here.
    useDmPeers: () => new Map(),
}));
jest.mock('../../channels/components', () => ({
    ConfirmDialog: (p: any) =>
        p.open ? (
            <div>
                <p>{p.title}</p>
                <button onClick={p.onConfirm}>{p.confirmLabel}</button>
            </div>
        ) : null,
}));

jest.mock('../../../hooks', () => ({
    useMyProfile: () => ({ profile: { nick: '내프로필' } }),
    useHomeChannels: () => ({ channels: channelsValue, isLoading: false }),
    // This screen reads join/unread from the observation the whole app shares, and registers only its
    // own cursor sync.
    useActiveCloudData: () => ({
        channels: channelsValue,
        isLoaded: true,
        myJoins: new Map(),
        unreads: { byChannel: unreadByChannel, byPlace: {}, total: 0 },
    }),
    useJoinSyncRegistration: jest.fn(),
    useMyJoins: () => new Map(),
    useChannelUnreads: () => ({ byChannel: unreadByChannel }),
    useLastChats: () => lastChatsValue,
    useChannelSort: () => ({ channelSort: {}, setChannelSort: jest.fn() }),
}));

// Kit stubs — the row exposes its selection and pin as separate buttons.
jest.mock('@chatic/web-ui-kit', () => ({
    Badge: ({ children }: any) => <span>{children}</span>,
    Button: ({ children, onClick, disabled }: any) => (
        <button type="button" onClick={onClick} disabled={disabled}>
            {children}
        </button>
    ),
    DefaultAvatar: ({ variant }: any) => <div data-testid="default-avatar" data-variant={variant} />,
    ImageAvatar: ({ alt }: any) => <img alt={alt} />,
    ManageChannelItem: ({ title, subtitle, selectable, checked, onToggle, pinned, onTogglePin, selectLabel }: any) => (
        <div>
            {subtitle && <p data-testid={`subtitle:${selectLabel}`}>{subtitle}</p>}
            {selectable ? (
                <button
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    aria-label={selectLabel}
                    onClick={() => onToggle?.(!checked)}
                >
                    {title}
                </button>
            ) : (
                <div data-testid="not-selectable">{title}</div>
            )}
            <button type="button" aria-label={`pin:${selectLabel}`} onClick={() => onTogglePin?.(!pinned)} />
        </div>
    ),
}));

const channel = (id: string, overrides: Partial<any> = {}) => ({
    id,
    name: id,
    sid: 'place-1',
    ownerId: 'me',
    chatNo: 10,
    metaNo: 0,
    ...overrides,
});

beforeEach(() => {
    jest.clearAllMocks();
    readInCloud.mockReset().mockResolvedValue(undefined);
    placeValue = { id: 'place-1', isOwner: true };
    channelsValue = [channel('ch-1'), channel('ch-2'), channel('self', { stereo: 'self' })];
    unreadByChannel = { 'ch-1': 2 };
    pinnedIds = [];
    selectedCloudId = 'cloud-1';
    sentInvitesValue = [];
    lastChatsValue = new Map();
});

describe('PlaceChannelManagePage', () => {
    it('self 채팅방은 선택할 수 없다', () => {
        render(<PlaceChannelManagePage />);
        expect(screen.getAllByRole('checkbox')).toHaveLength(2);
        expect(screen.getByTestId('not-selectable')).toBeInTheDocument();
    });

    it('오너면 선택한 방을 삭제한다', async () => {
        render(<PlaceChannelManagePage />);

        fireEvent.click(screen.getByRole('checkbox', { name: 'ch-1' }));
        fireEvent.click(screen.getByText('channelManage.deleteRooms'));
        // Confirm dialog is titled with the selected count.
        expect(screen.getByText('channelManage.deleteDialog.title:1')).toBeInTheDocument();

        fireEvent.click(screen.getByText('channelManage.deleteDialog.confirm'));

        await waitFor(() => expect(deleteChannel).toHaveBeenCalledWith({ channelId: 'ch-1' }));
        expect(leaveChannel).not.toHaveBeenCalled();
        await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: 'channelManage.deleteDone:1' }));
    });

    // "Member" is now decided per channel rather than per place — a group I did not create is
    // one I leave, whoever owns the place around it.
    it('leaves a group room I do not own', async () => {
        channelsValue = [channel('ch-1', { ownerId: 'someone-else' }), channel('ch-2', { ownerId: 'someone-else' })];
        render(<PlaceChannelManagePage />);

        fireEvent.click(screen.getByRole('checkbox', { name: 'ch-1' }));
        fireEvent.click(screen.getByRole('checkbox', { name: 'ch-2' }));
        fireEvent.click(screen.getByText('channelManage.leaveRooms'));
        fireEvent.click(screen.getByText('channelManage.leaveDialog.confirm'));

        await waitFor(() => expect(leaveChannel).toHaveBeenCalledTimes(2));
        expect(deleteChannel).not.toHaveBeenCalled();
        await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: 'channelManage.leaveDone:2' }));
    });

    it('일부만 실패하면 성공/실패 토스트를 모두 낸다', async () => {
        deleteChannel.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('boom'));
        render(<PlaceChannelManagePage />);

        fireEvent.click(screen.getByRole('checkbox', { name: 'ch-1' }));
        fireEvent.click(screen.getByRole('checkbox', { name: 'ch-2' }));
        fireEvent.click(screen.getByText('channelManage.deleteRooms'));
        fireEvent.click(screen.getByText('channelManage.deleteDialog.confirm'));

        await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: 'channelManage.deleteDone:1' }));
        expect(toast).toHaveBeenCalledWith({ title: 'channelManage.deleteFailed:1', variant: 'destructive' });
    });

    // The room's text flattened as the home list flattens it, not the composer's raw markup.
    it('previews the last message with its markup flattened', () => {
        lastChatsValue = new Map([
            ['ch-1', { content: '배포는 `yarn deploy` 로, [가이드](https://example.com/a) 참고' }],
        ]);
        render(<PlaceChannelManagePage />);

        expect(screen.getByTestId('subtitle:ch-1')).toHaveTextContent('배포는 yarn deploy 로, 가이드 참고');
    });

    it('shows no preview line for a room with no last message', () => {
        render(<PlaceChannelManagePage />);
        expect(screen.queryByTestId('subtitle:ch-1')).not.toBeInTheDocument();
    });

    // The label splits into delete/leave with the selection (removalActionFor), so accept either.
    it('disables the remove button when nothing is selected', () => {
        render(<PlaceChannelManagePage />);
        expect(screen.getByRole('button', { name: /channelManage\.(delete|leave)Rooms/ })).toBeDisabled();
    });

    // A 1:1 is left, never deleted, on every screen. That holds even when ownerId is me because
    // I sent the invite — that id is a by-product of creating the room, not a permission over it.
    it('leaves a 1:1 instead of deleting it, even when I am the owner', async () => {
        channelsValue = [channel('dm-1', { stereo: 'dm', ownerId: 'me', memberIds: ['me', 'peer'] })];
        render(<PlaceChannelManagePage />);

        fireEvent.click(screen.getByRole('checkbox', { name: 'dm-1' }));
        fireEvent.click(screen.getByText('channelManage.leaveRooms'));
        fireEvent.click(screen.getByText('channelManage.leaveDialog.confirm'));

        await waitFor(() => expect(leaveChannel).toHaveBeenCalledWith({ channelId: 'dm-1' }));
        expect(deleteChannel).not.toHaveBeenCalled();
    });

    it('reads every unread room with no selection, and only the selection with one', async () => {
        unreadByChannel = { 'ch-1': 2, 'ch-2': 5 };
        render(<PlaceChannelManagePage />);

        // No selection → the label is "read all" and every unread room is marked.
        fireEvent.click(screen.getByText('channelManage.readAll'));
        await waitFor(() => expect(readInCloud).toHaveBeenCalledTimes(2));

        readInCloud.mockClear();
        fireEvent.click(screen.getByRole('checkbox', { name: 'ch-2' }));
        fireEvent.click(screen.getByText('channelManage.readSelected:1'));
        await waitFor(() =>
            expect(readInCloud).toHaveBeenCalledWith(selectedCloudId, { channelId: 'ch-2', chatNo: 10 })
        );
        expect(readInCloud).toHaveBeenCalledTimes(1);
    });

    it('does not mark anything when no room is unread', async () => {
        unreadByChannel = {};
        render(<PlaceChannelManagePage />);
        fireEvent.click(screen.getByText('channelManage.readAll'));
        await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: 'channelManage.nothingToRead' }));
        expect(readInCloud).not.toHaveBeenCalled();
    });

    it('says done at once, without waiting for reads still queued for the socket', () => {
        unreadByChannel = { 'ch-1': 2 };
        readInCloud.mockReturnValue(new Promise(() => undefined));
        render(<PlaceChannelManagePage />);

        fireEvent.click(screen.getByText('channelManage.readAll'));

        expect(toast).toHaveBeenCalledWith({ title: 'channelManage.readDone' });
    });

    it('reports only the reads the server refused', async () => {
        unreadByChannel = { 'ch-1': 2, 'ch-2': 5 };
        readInCloud.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('403 FORBIDDEN'));
        render(<PlaceChannelManagePage />);

        fireEvent.click(screen.getByText('channelManage.readAll'));

        await waitFor(() =>
            expect(toast).toHaveBeenCalledWith({ title: 'channelManage.readFailed:1', variant: 'destructive' })
        );
    });

    it('핀 토글은 현재 스코프의 id로 기록하고 토스트를 낸다', () => {
        render(<PlaceChannelManagePage />);
        fireEvent.click(screen.getByRole('button', { name: 'pin:ch-1' }));
        expect(toggle).toHaveBeenCalledWith('ch-1');
        expect(toast).toHaveBeenCalledWith({ title: 'channelManage.pinned' });
    });

    it('이미 고정된 채널을 누르면 해제 토스트를 낸다', () => {
        pinnedIds = ['ch-1'];
        render(<PlaceChannelManagePage />);
        fireEvent.click(screen.getByRole('button', { name: 'pin:ch-1' }));
        expect(toggle).toHaveBeenCalledWith('ch-1');
        expect(toast).toHaveBeenCalledWith({ title: 'channelManage.unpinned' });
    });

    it('선택 해제는 전체 선택을 비운다', () => {
        render(<PlaceChannelManagePage />);
        fireEvent.click(screen.getByRole('checkbox', { name: 'ch-1' }));
        expect(screen.getByRole('checkbox', { name: 'ch-1' })).toHaveAttribute('aria-checked', 'true');

        fireEvent.click(screen.getByText('channelManage.clearSelection'));
        expect(screen.getByRole('checkbox', { name: 'ch-1' })).toHaveAttribute('aria-checked', 'false');
    });
});

describe('PlaceChannelManagePage — 초대 행 (ADR-0089 Track B)', () => {
    it('커스텀 클라우드에서는 sentInvites가 있어도 초대 행을 보여주지 않는다', () => {
        selectedCloudId = 'cloud-1';
        sentInvitesValue = [{ id: 'invite-1', state: 'pending', name: '홍길동' }];
        render(<PlaceChannelManagePage />);

        expect(screen.queryByText('홍길동')).not.toBeInTheDocument();
    });

    it('default 클라우드에서는 sentInvites를 채널 위에 행으로 보여준다', () => {
        selectedCloudId = 'default';
        sentInvitesValue = [{ id: 'invite-1', state: 'pending', name: '홍길동' }];
        render(<PlaceChannelManagePage />);

        expect(screen.getByText('홍길동')).toBeInTheDocument();
    });

    it('초대 행을 탭하면 대기 화면으로 이동한다', () => {
        selectedCloudId = 'default';
        sentInvitesValue = [{ id: 'invite-1', state: 'pending', name: '홍길동' }];
        render(<PlaceChannelManagePage />);

        fireEvent.click(screen.getByText('홍길동'));
        expect(navigate).toHaveBeenCalledWith('/invite/invite-1/waiting');
    });

    it('default 클라우드에서 초대만 있고 채널이 없으면 채널 없음 문구를 보여주지 않는다', () => {
        selectedCloudId = 'default';
        channelsValue = [];
        sentInvitesValue = [{ id: 'invite-1', state: 'pending', name: '홍길동' }];
        render(<PlaceChannelManagePage />);

        expect(screen.queryByText('channelList.empty')).not.toBeInTheDocument();
    });
});
