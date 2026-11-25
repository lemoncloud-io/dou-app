import '@testing-library/jest-dom';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ChannelSettingsPage } from './ChannelSettingsPage';

const leaveChannel = jest.fn().mockResolvedValue({});
const deleteChannel = jest.fn().mockResolvedValue({});
const updateJoin = jest.fn().mockResolvedValue({ delivered: Promise.resolve() });
const navigate = jest.fn();
const toast = jest.fn();

let channelValue: any;
let membersValue: any;
let myJoinValue: any;
let dmPeerValue: any;
let mockInputLock = { isAvailable: false, isLocked: false };
const mockSetInputLocked = jest.fn();
let profilesValue: any;
let myProfileValue: any;
let absentValue: { absent: boolean | undefined; markPresent: jest.Mock };
const markPresent = jest.fn();
let selectedSiteIdValue = 's1';
let mockIsGuest = false;
let dmInviteStateValue: any;
let joinsValue: any[] | undefined;
let uidInCloudValue = 'me';
let placeValue: any;
const removePlaceMember = jest.fn().mockResolvedValue({ leftChannelIds: ['ch1'] });
const placeRepository = {
    observeItem: (_id: string, cb: (place: any) => void) => {
        cb(placeValue);
        return () => undefined;
    },
    removeMember: (...args: unknown[]) => removePlaceMember(...args),
};

const mockUseStartDm = () => ({ startDm: jest.fn(), isStarting: false, isAvailable: false });

jest.mock('../components/RoomFilesEntry', () => ({
    RoomFilesEntry: ({ channelId }: { channelId: string }) => <div data-testid="room-files-entry">{channelId}</div>,
}));
jest.mock('react-router-dom', () => ({
    useParams: () => ({ channelId: 'ch1' }),
    useLocation: () => ({ state: null }),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/bridges', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('@chatic/shared', () => ({
    ...jest.requireActual('@chatic/shared'),
    useNavigateWithTransition: () => navigate,
}));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));
jest.mock('@chatic/runtime-react', () =>
    require('@chatic/runtime-react/testing').fakeRuntimeModule({
        session: {
            useSessionIdentity: () => ({ userId: 'me' }),
            useRuntimeProfile: () => ({ isGuest: mockIsGuest }),
            useSessionSelection: () => ({ selectedCloudId: 'cloud-a', selectedSiteId: selectedSiteIdValue }),
            useUidInCloud: () => uidInCloudValue,
        },
        data: { useRuntimeRepositories: () => ({ place: placeRepository }) },
    })
);

jest.mock('../../../ui/components', () => ({ PageHeader: (p: any) => <div>{p.title}</div> }));

jest.mock('../../../hooks', () => ({
    useActivePlaceName: () => 'MyPlace',
    useMyProfile: () => myProfileValue,
    useSetMyPlaceProfile: () => jest.fn(),
    usePlaceProfileAbsent: () => absentValue,
}));
let placeSettingsProps: any;
let placeCreateProps: any;
jest.mock('../components/PlaceProfileEditDialog', () => ({
    PlaceProfileEditDialog: (p: any) => {
        placeSettingsProps = p;
        return <div data-testid="profile-settings" data-open={String(p.open)} />;
    },
}));
jest.mock('../../../ui/components/PlaceProfileCreateDialog', () => ({
    PlaceProfileCreateDialog: (p: any) => {
        placeCreateProps = p;
        return <div data-testid="profile-create" data-open={String(p.open)} />;
    },
}));

jest.mock('@chatic/web-ui-kit', () => ({
    ListRow: ({ title, leading, trailing, onClick, destructive }: any) => {
        const body = (
            <>
                {leading}
                {title}
                {trailing}
            </>
        );
        return onClick ? (
            <button type="button" data-destructive={destructive ? 'true' : 'false'} onClick={onClick}>
                {body}
            </button>
        ) : (
            <div data-destructive={destructive ? 'true' : 'false'}>{body}</div>
        );
    },
    GroupLabel: ({ label }: any) => <p>{label}</p>,
    Switch: ({ checked, onCheckedChange, label }: any) => (
        <input type="checkbox" aria-label={label} checked={checked} onChange={e => onCheckedChange(e.target.checked)} />
    ),
    IconChevronRight: () => <span data-testid="chevron" />,
    BottomSheet: ({ open, title, children }: any) =>
        open ? (
            <div role="dialog" aria-label={title}>
                {children}
            </div>
        ) : null,
    SheetOption: ({ label, selected, onSelect }: any) => (
        <button type="button" role="radio" aria-checked={!!selected} onClick={onSelect}>
            {label}
        </button>
    ),
    Divider: () => <hr />,
    ChatAvatar: () => <div data-testid="chat-avatar" />,
    DefaultAvatar: ({ variant }: any) => <div data-testid="default-avatar" data-variant={variant} />,
    ImageAvatar: ({ alt }: any) => <img alt={alt} />,
}));

jest.mock('../components/ChannelWebhooksSection', () => ({
    ChannelWebhooksSection: (p: any) => <div data-testid="webhooks" data-channel={p.channelId} />,
}));

let profileProps: any;
jest.mock('../components/UpdateChannelDialog', () => ({
    UpdateChannelDialog: (p: any) => <div data-testid="update" data-open={String(p.open)} />,
}));
jest.mock('../components/JoinNickDialog', () => ({
    JoinNickDialog: (p: any) => (
        <div
            data-testid={p.variant === 'dm' ? 'dm-name' : 'self-name'}
            data-open={String(p.open)}
            data-fallback={p.fallbackName ?? ''}
            data-left={String(p.peerHasLeft ?? false)}
            data-reinvite={p.onReinvite ? 'on' : 'off'}
        />
    ),
}));
jest.mock('../components/ConfirmDialog', () => ({
    ConfirmDialog: (p: any) => (p.open ? <button onClick={p.onConfirm}>{p.confirmLabel}</button> : null),
}));
jest.mock('../components/MemberProfileDialog', () => ({
    MemberProfileDialog: (p: any) => {
        profileProps = p;
        return <div data-testid="profile" data-open={String(p.open)} data-cankick={String(p.canKick)} />;
    },
}));
jest.mock('../components/MemberListItem', () => ({
    MemberListItem: (p: any) => (
        <button
            data-testid={`member-${p.member.id}`}
            data-needs-profile={String(!!p.needsProfileSetup)}
            data-pending-invite={String(!!p.isPendingInvite)}
            data-owner={String(!!p.isOwner)}
            data-me={String(!!p.isMe)}
            onClick={p.onClick}
        >
            {p.member.name}
        </button>
    ),
}));

const OWNER_CHANNEL = {
    channel: { isOwner: true, isSelfChat: false, ownerId: 'owner1', name: '방', sid: 's1' },
    isError: false,
};
const MEMBER_CHANNEL = {
    channel: { isOwner: false, isSelfChat: false, ownerId: 'owner1', name: '방', sid: 's1' },
    isError: false,
};
const SELF_CHANNEL = {
    channel: {
        isOwner: true,
        isSelfChat: true,
        stereo: 'self',
        ownerId: 'me',
        name: '나와의 채팅',
        sid: 's1',
    },
    isError: false,
};
const DM_CHANNEL = {
    channel: {
        isOwner: true,
        isSelfChat: false,
        stereo: 'dm',
        ownerId: 'me',
        name: '서버 이름',
        cid: 'default',
        sid: 's1',
    },
    isError: false,
};
const MEMBERS = {
    members: [
        { id: 'owner1', name: '오너', $join: { joined: 1 } },
        { id: 'me', name: '나', $join: { joined: 1 } },
        { id: 'u2', name: '유저2', $join: { joined: 1 } },
    ],
    isLoading: false,
};

beforeEach(() => {
    jest.clearAllMocks();
    mockInputLock = { isAvailable: false, isLocked: false };
    membersValue = MEMBERS;
    myJoinValue = { userId: 'me' };
    dmPeerValue = null;
    profileProps = undefined;
    placeCreateProps = undefined;
    profilesValue = { profileMap: new Map([['me', { nick: '내멤버프로필' }]]) };
    absentValue = { absent: false, markPresent };
    selectedSiteIdValue = 's1';
    myProfileValue = { profile: { nick: '내프로필' } };
    mockIsGuest = false;
    dmInviteStateValue = { state: { kind: 'present' }, countdown: null, resolveReinvitePrefill: () => ({}) };
    joinsValue = undefined;
    uidInCloudValue = 'me';
    placeValue = { id: 's1', name: '플레이스', isOwner: false, ownerId: 'owner1' };
});

jest.mock('../hooks', () => ({
    useStartDm: () => mockUseStartDm(),
    useChannel: () => channelValue,
    useChannelMembers: () => membersValue,
    useChannelMutations: () => ({ leaveChannel, deleteChannel, isPending: { delete: false, leave: false } }),
    useChannelProfiles: () => profilesValue,
    useDmPeer: () => dmPeerValue,
    useDmInviteState: () => dmInviteStateValue,
    useJoinMutations: () => ({ updateJoin, isPending: { update: false } }),
    useChannelJoins: () => ({
        joins: joinsValue ?? (myJoinValue ? [myJoinValue] : []),
        myJoin: myJoinValue,
        activeMemberIds: myJoinValue?.userId ? [myJoinValue.userId] : [],
        cursorByUser: new Map<string, number>(),
    }),
    useChannelTitle: jest.requireActual('../hooks/useChannelTitle').useChannelTitle,
    useChatInputLock: () => ({ ...mockInputLock, setLocked: mockSetInputLocked }),
}));

describe('ChannelSettingsPage — the input lock row', () => {
    it('is not offered while the Lab switch is off', () => {
        channelValue = MEMBER_CHANNEL;
        render(<ChannelSettingsPage />);

        expect(screen.queryByRole('checkbox', { name: 'chat.inputLock.settingsRow' })).not.toBeInTheDocument();
    });

    it("shows the room's lock once the Lab switch is on, and locks it from the switch", () => {
        channelValue = MEMBER_CHANNEL;
        mockInputLock = { isAvailable: true, isLocked: false };
        render(<ChannelSettingsPage />);

        const row = screen.getByRole('checkbox', { name: 'chat.inputLock.settingsRow' });
        expect(row).not.toBeChecked();

        fireEvent.click(row);
        expect(mockSetInputLocked).toHaveBeenCalledWith(true);
        expect(toast).toHaveBeenCalledWith({ title: 'chat.inputLock.locked' });
    });

    it('unlocks a locked room from the same switch', () => {
        channelValue = MEMBER_CHANNEL;
        mockInputLock = { isAvailable: true, isLocked: true };
        render(<ChannelSettingsPage />);

        fireEvent.click(screen.getByRole('checkbox', { name: 'chat.inputLock.settingsRow' }));
        expect(mockSetInputLocked).toHaveBeenCalledWith(false);
        expect(toast).toHaveBeenCalledWith({ title: 'chat.inputLock.unlocked' });
    });

    it('is not offered in a self chat', () => {
        channelValue = SELF_CHANNEL;
        mockInputLock = { isAvailable: true, isLocked: false };
        render(<ChannelSettingsPage />);

        expect(screen.queryByRole('checkbox', { name: 'chat.inputLock.settingsRow' })).not.toBeInTheDocument();
    });
});

describe('ChannelSettingsPage', () => {
    it('소유자 뷰: 친구 추가 행과 방 삭제를 노출하고 방 나가기는 숨긴다', () => {
        channelValue = OWNER_CHANNEL;
        render(<ChannelSettingsPage />);

        expect(screen.getByText('chat.settings.roomSettingsGroup')).toBeInTheDocument();
        expect(screen.getByText('chat.settings.roomMembers')).toBeInTheDocument();
        expect(screen.getByText('chat.settings.addFriend')).toBeInTheDocument();
        expect(screen.getByText('chat.settings.deleteRoom')).toBeInTheDocument();
        expect(screen.queryByText('chat.settings.leaveRoom')).not.toBeInTheDocument();
    });

    it('멤버 뷰: 친구 추가는 숨기고 방 나가기를 노출한다', () => {
        channelValue = MEMBER_CHANNEL;
        render(<ChannelSettingsPage />);

        expect(screen.queryByText('chat.settings.addFriend')).not.toBeInTheDocument();
        expect(screen.getByText('chat.settings.leaveRoom')).toBeInTheDocument();
        expect(screen.queryByText('chat.settings.deleteRoom')).not.toBeInTheDocument();
    });

    it('self 채팅: 이름(파생) 행과 "방 친구"만 노출하고 대화방 설정/삭제/나가기/친구추가는 숨긴다', () => {
        channelValue = SELF_CHANNEL;
        render(<ChannelSettingsPage />);

        expect(screen.getByText('내프로필')).toBeInTheDocument();
        expect(screen.getByText('chat.settings.roomMembers')).toBeInTheDocument();
        expect(screen.getByTestId('member-me')).toBeInTheDocument();
        expect(screen.queryByText('chat.settings.roomSettingsGroup')).not.toBeInTheDocument();
        expect(screen.queryByText('chat.settings.addFriend')).not.toBeInTheDocument();
        expect(screen.queryByText('chat.settings.deleteRoom')).not.toBeInTheDocument();
        expect(screen.queryByText('chat.settings.leaveRoom')).not.toBeInTheDocument();
    });

    it('self 채팅: 이름 행을 탭하면 JoinNickDialog(self)가 열린다', () => {
        channelValue = SELF_CHANNEL;
        render(<ChannelSettingsPage />);

        expect(screen.getByTestId('self-name')).toHaveAttribute('data-open', 'false');
        fireEvent.click(screen.getByText('내프로필'));
        expect(screen.getByTestId('self-name')).toHaveAttribute('data-open', 'true');
    });

    describe('1:1(DM) 방', () => {
        it('제목이 상대 프로필 닉이고 channel.name이 아니다', () => {
            channelValue = DM_CHANNEL;
            dmPeerValue = { id: 'peer', profileNick: '토끼' };
            render(<ChannelSettingsPage />);

            expect(screen.getByText('토끼')).toBeInTheDocument();
            expect(screen.queryByText('서버 이름')).not.toBeInTheDocument();
        });

        it('내 join.nick이 있으면 그것을 쓴다', () => {
            channelValue = DM_CHANNEL;
            dmPeerValue = { id: 'peer', profileNick: '토끼' };
            myJoinValue = { userId: 'me', nick: '토끼친구' };
            render(<ChannelSettingsPage />);

            expect(screen.getByText('토끼친구')).toBeInTheDocument();
        });

        it('이름 행을 탭하면 JoinNickDialog(dm)가 열린다', () => {
            channelValue = DM_CHANNEL;
            dmPeerValue = { id: 'peer', profileNick: '토끼' };
            render(<ChannelSettingsPage />);

            expect(screen.getByTestId('dm-name')).toHaveAttribute('data-open', 'false');
            fireEvent.click(screen.getByText('토끼'));
            expect(screen.getByTestId('dm-name')).toHaveAttribute('data-open', 'true');
            expect(screen.getByTestId('update')).toHaveAttribute('data-open', 'false');
        });

        it('클라우드 1:1은 이름 행이 버튼이 아니다 — 저장해도 보이지 않을 값이라', () => {
            channelValue = { ...DM_CHANNEL, channel: { ...DM_CHANNEL.channel, cid: '1000001' } };
            dmPeerValue = { id: 'peer', profileNick: '치이카와' };
            render(<ChannelSettingsPage />);

            const title = screen.getByText('치이카와');
            expect(title.closest('button')).toBeNull();

            fireEvent.click(title);
            expect(screen.getByTestId('dm-name')).toHaveAttribute('data-open', 'false');
        });

        it('폴백 이름을 다이얼로그 플레이스홀더로 넘긴다', () => {
            channelValue = DM_CHANNEL;
            dmPeerValue = { id: 'peer', profileNick: '토끼' };
            render(<ChannelSettingsPage />);

            expect(screen.getByTestId('dm-name')).toHaveAttribute('data-fallback', '토끼');
        });

        it('상대가 참여 중이면 친구 정보 시트에 재초대를 내밀지 않는다', () => {
            channelValue = DM_CHANNEL;
            dmPeerValue = { id: 'peer', profileNick: '토끼' };
            render(<ChannelSettingsPage />);

            expect(screen.getByTestId('dm-name')).toHaveAttribute('data-left', 'false');
            expect(screen.getByTestId('dm-name')).toHaveAttribute('data-reinvite', 'off');
        });

        it('상대가 나갔으면 "대화방 나감"과 재초대를 넘긴다', () => {
            channelValue = DM_CHANNEL;
            dmPeerValue = { id: 'peer', profileNick: '토끼' };
            dmInviteStateValue = {
                state: { kind: 'absent' },
                countdown: null,
                resolveReinvitePrefill: () => ({}),
            };
            render(<ChannelSettingsPage />);

            expect(screen.getByTestId('dm-name')).toHaveAttribute('data-left', 'true');
            expect(screen.getByTestId('dm-name')).toHaveAttribute('data-reinvite', 'on');
        });

        it('초대가 진행 중이면 나갔어도 재초대를 내밀지 않는다', () => {
            channelValue = DM_CHANNEL;
            dmPeerValue = { id: 'peer', profileNick: '토끼' };
            dmInviteStateValue = {
                state: { kind: 'pending', expiredAt: 1 },
                countdown: null,
                resolveReinvitePrefill: () => ({}),
            };
            render(<ChannelSettingsPage />);

            expect(screen.getByTestId('dm-name')).toHaveAttribute('data-left', 'true');
            expect(screen.getByTestId('dm-name')).toHaveAttribute('data-reinvite', 'off');
        });

        it('게스트는 재초대를 받지 못한다 — 발급은 메인유저만 한다', () => {
            channelValue = DM_CHANNEL;
            dmPeerValue = { id: 'peer', profileNick: '토끼' };
            dmInviteStateValue = {
                state: { kind: 'absent' },
                countdown: null,
                resolveReinvitePrefill: () => ({}),
            };
            mockIsGuest = true;
            render(<ChannelSettingsPage />);

            expect(screen.getByTestId('dm-name')).toHaveAttribute('data-reinvite', 'off');
        });

        it('"친구 추가" 행은 여전히 숨는다 (ADR-0032 유지)', () => {
            channelValue = DM_CHANNEL;
            dmPeerValue = { id: 'peer', profileNick: '토끼' };
            render(<ChannelSettingsPage />);

            expect(screen.queryByText('chat.settings.addFriend')).not.toBeInTheDocument();
        });
    });

    it('방 이름을 탭하면 정보 다이얼로그가 열린다 (모드 분기는 다이얼로그 내부에서 파생)', () => {
        channelValue = OWNER_CHANNEL;
        render(<ChannelSettingsPage />);

        fireEvent.click(screen.getByText('방'));
        expect(screen.getByTestId('update')).toHaveAttribute('data-open', 'true');
    });

    it("makes a group member's room-name row not a button", () => {
        channelValue = MEMBER_CHANNEL;
        render(<ChannelSettingsPage />);

        const title = screen.getByText('방');
        expect(title.closest('button')).toBeNull();

        fireEvent.click(title);
        expect(screen.getByTestId('update')).toHaveAttribute('data-open', 'false');
    });

    it('어떤 멤버에게도 초대 대기 배지를 달지 않는다', () => {
        channelValue = OWNER_CHANNEL;
        membersValue = {
            members: [
                { id: 'owner1', name: '오너', $join: { joined: 1 } },
                { id: 'gone', name: '나간사람', $join: { joined: 0, joinedNo: 7 } },
                { id: 'invited', name: '초대대기', $join: { joined: 0 } },
            ],
            isLoading: false,
        };

        render(<ChannelSettingsPage />);

        for (const id of ['owner1', 'gone', 'invited']) {
            expect(screen.getByTestId(`member-${id}`)).toHaveAttribute('data-pending-invite', 'false');
        }
    });

    it('친구 추가 행을 누르면 초대 페이지로 이동한다', () => {
        channelValue = OWNER_CHANNEL;
        render(<ChannelSettingsPage />);

        fireEvent.click(screen.getByText('chat.settings.addFriend'));
        expect(navigate).toHaveBeenCalledWith('/channels/ch1/invite', { state: { roomDistance: 2 } });
    });

    describe('room notification level', () => {
        const notifyRow = () => screen.getByText('chat.settings.roomNotification').closest('button') as HTMLElement;
        const openSheet = () => fireEvent.click(notifyRow());
        const optionLabels = () => screen.getAllByRole('radio').map(option => option.textContent);
        const pick = async (level: string) => {
            await act(async () => {
                fireEvent.click(screen.getByRole('radio', { name: `chat.settings.notifyMode.${level}` }));
            });
        };

        it.each([
            [undefined, 'all'],
            ['', 'all'],
            ['all', 'all'],
            ['mention', 'mention'],
            ['none', 'none'],
        ])('shows a stored notify of %p as the %s label in a group', (notify, level) => {
            channelValue = OWNER_CHANNEL;
            myJoinValue = { userId: 'me', notify };
            render(<ChannelSettingsPage />);

            expect(notifyRow()).toHaveTextContent(`chat.settings.notifyMode.${level}`);
            expect(notifyRow()).toContainElement(screen.getByTestId('chevron'));
        });

        it('opens a sheet with all three levels in a group, the current one checked', () => {
            channelValue = OWNER_CHANNEL;
            myJoinValue = { userId: 'me', notify: 'mention' };
            render(<ChannelSettingsPage />);

            expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
            openSheet();

            expect(screen.getByRole('radiogroup', { name: 'chat.settings.roomNotification' })).toBeInTheDocument();
            expect(optionLabels()).toEqual([
                'chat.settings.notifyMode.all',
                'chat.settings.notifyMode.mention',
                'chat.settings.notifyMode.none',
            ]);
            expect(screen.getByRole('radio', { name: 'chat.settings.notifyMode.mention' })).toHaveAttribute(
                'aria-checked',
                'true'
            );
        });

        it('shows a 1:1 stored as mention as All messages and offers only two levels', () => {
            channelValue = DM_CHANNEL;
            dmPeerValue = { id: 'peer', profileNick: '토끼' };
            myJoinValue = { userId: 'me', notify: 'mention' };
            render(<ChannelSettingsPage />);

            expect(notifyRow()).toHaveTextContent('chat.settings.notifyMode.all');
            openSheet();

            expect(optionLabels()).toEqual(['chat.settings.notifyMode.all', 'chat.settings.notifyMode.none']);
            expect(screen.getByRole('radio', { name: 'chat.settings.notifyMode.all' })).toHaveAttribute(
                'aria-checked',
                'true'
            );
            expect(updateJoin).not.toHaveBeenCalled();
        });

        it('corrects a 1:1 stored as mention once the channel arrives after the join row', () => {
            channelValue = { channel: undefined, isError: false };
            myJoinValue = { userId: 'me', notify: 'mention' };
            const { rerender } = render(<ChannelSettingsPage />);
            expect(notifyRow()).toHaveTextContent('chat.settings.notifyMode.mention');

            channelValue = DM_CHANNEL;
            dmPeerValue = { id: 'peer', profileNick: '토끼' };
            rerender(<ChannelSettingsPage />);

            expect(notifyRow()).toHaveTextContent('chat.settings.notifyMode.all');
        });

        it.each(['mention', 'none'])('writes exactly the picked level (%s) and closes the sheet', async level => {
            channelValue = OWNER_CHANNEL;
            render(<ChannelSettingsPage />);

            openSheet();
            await pick(level);

            expect(updateJoin).toHaveBeenCalledTimes(1);
            expect(updateJoin).toHaveBeenCalledWith({ channelId: 'ch1', userId: 'me', notify: level });
            expect(notifyRow()).toHaveTextContent(`chat.settings.notifyMode.${level}`);
            expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
        });

        it('writes nothing when the level already shown is picked again', async () => {
            channelValue = OWNER_CHANNEL;
            myJoinValue = { userId: 'me', notify: 'mention' };
            render(<ChannelSettingsPage />);

            openSheet();
            await pick('mention');

            expect(updateJoin).not.toHaveBeenCalled();
            expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
        });

        it('writes nothing when a 1:1 stored as mention re-picks All messages', async () => {
            channelValue = DM_CHANNEL;
            dmPeerValue = { id: 'peer', profileNick: '토끼' };
            myJoinValue = { userId: 'me', notify: 'mention' };
            render(<ChannelSettingsPage />);

            openSheet();
            await pick('all');

            expect(updateJoin).not.toHaveBeenCalled();
        });

        it('keeps the picked level while it waits, and says why if the server later refuses it', async () => {
            updateJoin.mockImplementationOnce(async () => ({ delivered: Promise.reject(new Error('403 FORBIDDEN')) }));
            channelValue = OWNER_CHANNEL;
            render(<ChannelSettingsPage />);

            openSheet();
            await pick('none');

            expect(notifyRow()).toHaveTextContent('chat.settings.notifyMode.none');
            await waitFor(() =>
                expect(toast).toHaveBeenCalledWith(
                    expect.objectContaining({ title: 'chat.settings.notifyFailed', variant: 'destructive' })
                )
            );
        });

        it('reverts the shown level and toasts when the local write fails', async () => {
            updateJoin.mockRejectedValueOnce(new Error('boom'));
            channelValue = OWNER_CHANNEL;
            render(<ChannelSettingsPage />);

            openSheet();
            await pick('none');

            await waitFor(() => expect(notifyRow()).toHaveTextContent('chat.settings.notifyMode.all'));
            expect(toast).toHaveBeenCalledWith(
                expect.objectContaining({ title: 'chat.settings.notifyFailed', variant: 'destructive' })
            );
        });

        it('draws no notification row in a self chat', () => {
            channelValue = SELF_CHANNEL;
            render(<ChannelSettingsPage />);

            expect(screen.queryByText('chat.settings.roomNotification')).not.toBeInTheDocument();
        });
    });

    it('멤버 항목을 탭하면 프로필이 열리고, 소유자가 일반 멤버를 볼 때 canKick=true', () => {
        channelValue = OWNER_CHANNEL;
        render(<ChannelSettingsPage />);

        fireEvent.click(screen.getByTestId('member-u2'));
        expect(screen.getByTestId('profile')).toHaveAttribute('data-open', 'true');
        expect(profileProps.member.id).toBe('u2');
        expect(profileProps.canKick).toBe(true);
    });

    it('소유자 본인·방장 대상에는 canKick=false', () => {
        channelValue = OWNER_CHANNEL;
        render(<ChannelSettingsPage />);

        fireEvent.click(screen.getByTestId('member-me'));
        expect(profileProps.canKick).toBe(false);

        fireEvent.click(screen.getByTestId('member-owner1'));
        expect(profileProps.canKick).toBe(false);
    });

    describe('room owner badge', () => {
        it('badges the member whose join role is owner, not the creator', () => {
            channelValue = OWNER_CHANNEL;
            joinsValue = [
                { userId: 'owner1', stereo: 'member' },
                { userId: 'me', stereo: 'member' },
                { userId: 'u2', stereo: 'owner' },
            ];
            render(<ChannelSettingsPage />);

            expect(screen.getByTestId('member-u2')).toHaveAttribute('data-owner', 'true');
            expect(screen.getByTestId('member-owner1')).toHaveAttribute('data-owner', 'false');
        });

        it('puts no owner badge on anyone in a 1:1, the inviter included', () => {
            channelValue = DM_CHANNEL;
            membersValue = {
                members: [
                    { id: 'me', name: '나', $join: { joined: 1 } },
                    { id: 'peer', name: '상대', $join: { joined: 1 } },
                ],
                isLoading: false,
            };
            joinsValue = [
                { userId: 'me', stereo: 'owner' },
                { userId: 'peer', stereo: 'member' },
            ];
            render(<ChannelSettingsPage />);

            expect(screen.getByTestId('member-me')).toHaveAttribute('data-owner', 'false');
            expect(screen.getByTestId('member-peer')).toHaveAttribute('data-owner', 'false');

            fireEvent.click(screen.getByTestId('member-peer'));
            expect(profileProps.memberIsOwner).toBe(false);
        });

        it('knows my row by my id in the room cloud, not only the session id', () => {
            channelValue = OWNER_CHANNEL;
            uidInCloudValue = 'me-in-cloud';
            membersValue = {
                members: [
                    { id: 'owner1', name: '오너', $join: { joined: 1 } },
                    { id: 'me-in-cloud', name: '나', $join: { joined: 1 } },
                ],
                isLoading: false,
            };
            render(<ChannelSettingsPage />);

            expect(screen.getByTestId('member-me-in-cloud')).toHaveAttribute('data-me', 'true');
            fireEvent.click(screen.getByTestId('member-me-in-cloud'));
            expect(profileProps.isSelf).toBe(true);
        });
    });

    it('내 항목을 탭하면 isSelf=true이고, 프로필 설정 진입 시 PlaceProfileEditDialog가 열린다', () => {
        channelValue = OWNER_CHANNEL;
        render(<ChannelSettingsPage />);

        fireEvent.click(screen.getByTestId('member-me'));
        expect(profileProps.isSelf).toBe(true);
        expect(screen.getByTestId('profile-settings')).toHaveAttribute('data-open', 'false');

        act(() => profileProps.onOpenProfileSettings());
        expect(screen.getByTestId('profile-settings')).toHaveAttribute('data-open', 'true');
        expect(placeSettingsProps.placeName).toBe('MyPlace');
    });

    describe('프로필 미설정 유도 (내 행)', () => {
        const noProfile = () => {
            profilesValue = { profileMap: new Map() };
            absentValue = { absent: true, markPresent };
        };

        it('내 프로필이 없으면 내 행에 유도 문구를 놓고 user.name을 쓰지 않는다', () => {
            channelValue = OWNER_CHANNEL;
            noProfile();
            render(<ChannelSettingsPage />);

            const me = screen.getByTestId('member-me');
            expect(me).toHaveTextContent('chat.settings.profileSetupRequired');
            expect(me).toHaveAttribute('data-needs-profile', 'true');
            expect(me).not.toHaveTextContent('나');
        });

        it('유저 레코드 name이 자기 id면 id가 아니라 라벨로 떨어진다', () => {
            channelValue = OWNER_CHANNEL;
            membersValue = {
                members: [
                    { id: 'owner1', name: '오너', $join: { joined: 1 } },
                    { id: 'me', name: '나', $join: { joined: 1 } },
                    { id: 'u2', name: 'u2', $join: { joined: 1 } },
                ],
                isLoading: false,
            };
            render(<ChannelSettingsPage />);

            const other = screen.getByTestId('member-u2');
            expect(other).toHaveTextContent('chat.unknownUser');
            expect(other).not.toHaveTextContent('u2');
        });

        it('공백만 있는 nick도 미설정으로 본다', () => {
            channelValue = OWNER_CHANNEL;
            profilesValue = { profileMap: new Map([['me', { nick: '   ' }]]) };
            absentValue = { absent: true, markPresent };
            render(<ChannelSettingsPage />);

            expect(screen.getByTestId('member-me')).toHaveAttribute('data-needs-profile', 'true');
        });

        it('프로필이 있으면 유도하지 않고 nick을 쓴다', () => {
            channelValue = OWNER_CHANNEL;
            render(<ChannelSettingsPage />);

            const me = screen.getByTestId('member-me');
            expect(me).toHaveTextContent('내멤버프로필');
            expect(me).toHaveAttribute('data-needs-profile', 'false');
        });

        it('남의 행에는 프로필이 없어도 유도하지 않는다 (내가 해결할 수 없다)', () => {
            channelValue = OWNER_CHANNEL;
            noProfile();
            render(<ChannelSettingsPage />);

            const other = screen.getByTestId('member-u2');
            expect(other).toHaveAttribute('data-needs-profile', 'false');
            expect(other).toHaveTextContent('유저2');
        });

        it('프로필 읽기가 끝나기 전에는 멤버가 도착해 있어도 유도하지 않는다', () => {
            channelValue = OWNER_CHANNEL;
            profilesValue = { profileMap: new Map() };
            absentValue = { absent: undefined, markPresent };
            render(<ChannelSettingsPage />);

            const me = screen.getByTestId('member-me');
            expect(me).toHaveAttribute('data-needs-profile', 'false');
            expect(screen.queryByText('chat.settings.profileSetupRequired')).not.toBeInTheDocument();
        });

        it('프로필 읽기 전에는 내 행 탭이 생성 다이얼로그를 열지 않는다', () => {
            channelValue = OWNER_CHANNEL;
            profilesValue = { profileMap: new Map() };
            absentValue = { absent: undefined, markPresent };
            render(<ChannelSettingsPage />);

            fireEvent.click(screen.getByTestId('member-me'));
            expect(screen.getByTestId('profile-create')).toHaveAttribute('data-open', 'false');
        });

        it('does not prompt when the cache lacks my row but the server says I have a profile', () => {
            channelValue = OWNER_CHANNEL;
            profilesValue = { profileMap: new Map() };
            absentValue = { absent: false, markPresent };
            render(<ChannelSettingsPage />);

            const me = screen.getByTestId('member-me');
            expect(me).toHaveAttribute('data-needs-profile', 'false');
            expect(screen.queryByText('chat.settings.profileSetupRequired')).not.toBeInTheDocument();

            fireEvent.click(me);
            expect(screen.getByTestId('profile-create')).toHaveAttribute('data-open', 'false');
        });

        it('does not prompt in a room outside the active place, where a save could not land', () => {
            channelValue = OWNER_CHANNEL;
            noProfile();
            selectedSiteIdValue = 'another-place';
            render(<ChannelSettingsPage />);

            expect(screen.getByTestId('member-me')).toHaveAttribute('data-needs-profile', 'false');
        });

        it('hands the server verdict to the edit dialog so it does not open blank before my profile arrives', () => {
            channelValue = OWNER_CHANNEL;
            absentValue = { absent: undefined, markPresent };
            render(<ChannelSettingsPage />);

            expect(placeSettingsProps.profileAbsent).toBeUndefined();
        });

        it('passes a settled "no profile" verdict through to the edit dialog', () => {
            channelValue = OWNER_CHANNEL;
            noProfile();
            render(<ChannelSettingsPage />);

            expect(placeSettingsProps.profileAbsent).toBe(true);
        });

        it('records the profile as present once it is created from the prompt', () => {
            channelValue = OWNER_CHANNEL;
            noProfile();
            render(<ChannelSettingsPage />);

            fireEvent.click(screen.getByTestId('member-me'));
            act(() => placeCreateProps.onDone());

            expect(markPresent).toHaveBeenCalled();
            expect(screen.getByTestId('profile-create')).toHaveAttribute('data-open', 'false');
        });

        it('멤버 로딩 중에는 목록 자체가 없다', () => {
            channelValue = OWNER_CHANNEL;
            noProfile();
            membersValue = { members: [], isLoading: true };
            render(<ChannelSettingsPage />);

            expect(screen.queryByText('chat.settings.profileSetupRequired')).not.toBeInTheDocument();
            expect(screen.queryByTestId('member-me')).not.toBeInTheDocument();
        });

        it('미설정 상태의 내 행을 탭하면 생성 다이얼로그가 바로 열린다 (멤버 프로필을 거치지 않음)', () => {
            channelValue = OWNER_CHANNEL;
            noProfile();
            render(<ChannelSettingsPage />);

            expect(screen.getByTestId('profile-create')).toHaveAttribute('data-open', 'false');
            fireEvent.click(screen.getByTestId('member-me'));

            expect(screen.getByTestId('profile-create')).toHaveAttribute('data-open', 'true');
            expect(screen.getByTestId('profile')).toHaveAttribute('data-open', 'false');
            expect(placeCreateProps.placeName).toBe('MyPlace');
            expect(placeCreateProps.exit.description).toBe('placeProfileCreate.exitDescription');
        });

        it('설정된 상태의 내 행을 탭하면 기존 멤버 프로필이 열린다', () => {
            channelValue = OWNER_CHANNEL;
            render(<ChannelSettingsPage />);

            fireEvent.click(screen.getByTestId('member-me'));
            expect(screen.getByTestId('profile')).toHaveAttribute('data-open', 'true');
            expect(screen.getByTestId('profile-create')).toHaveAttribute('data-open', 'false');
        });

        it.each([
            ['self', () => SELF_CHANNEL, null],
            ['dm', () => DM_CHANNEL, { id: 'peer', profileNick: '토끼' }],
            ['group', () => OWNER_CHANNEL, null],
        ])('%s 방에서도 내 행이 동일하게 유도한다', (_label, getChannel, peer) => {
            channelValue = getChannel();
            dmPeerValue = peer;
            noProfile();
            render(<ChannelSettingsPage />);

            expect(screen.getByTestId('member-me')).toHaveAttribute('data-needs-profile', 'true');
        });

        it('self 방의 이름 행은 프로필이 없어도 유도가 아니라 라벨을 쓴다', () => {
            channelValue = SELF_CHANNEL;
            noProfile();
            myProfileValue = { profile: null };
            render(<ChannelSettingsPage />);

            expect(screen.getByText('channelList.selfChannel')).toBeInTheDocument();
            expect(screen.getByTestId('member-me')).toHaveTextContent('chat.settings.profileSetupRequired');
        });
    });

    describe('remove scopes', () => {
        it('offers the room scope alone to a room owner who does not own the place', () => {
            channelValue = OWNER_CHANNEL;
            render(<ChannelSettingsPage />);

            fireEvent.click(screen.getByTestId('member-u2'));
            expect(profileProps.canKick).toBe(true);
            expect(profileProps.canRemoveFromPlace).toBe(false);
            expect(profileProps.roomName).toBe('방');
        });

        it('offers the place scope to the place owner, even as a plain member of the room', () => {
            channelValue = MEMBER_CHANNEL;
            placeValue = { id: 's1', name: '플레이스', isOwner: true, ownerId: 'me' };
            render(<ChannelSettingsPage />);

            fireEvent.click(screen.getByTestId('member-u2'));
            expect(profileProps.canKick).toBe(false);
            expect(profileProps.canRemoveFromPlace).toBe(true);
            expect(profileProps.placeName).toBe('플레이스');
        });

        it('withholds the place scope when the member owns the place', () => {
            channelValue = OWNER_CHANNEL;
            placeValue = { id: 's1', name: '플레이스', isOwner: true, ownerId: 'u2' };
            render(<ChannelSettingsPage />);

            fireEvent.click(screen.getByTestId('member-u2'));
            expect(profileProps.canKick).toBe(true);
            expect(profileProps.canRemoveFromPlace).toBe(false);
        });

        it('offers neither scope on me or on the room owner', () => {
            channelValue = OWNER_CHANNEL;
            placeValue = { id: 's1', name: '플레이스', isOwner: true, ownerId: 'me' };
            render(<ChannelSettingsPage />);

            fireEvent.click(screen.getByTestId('member-owner1'));
            expect(profileProps.canKick).toBe(false);
            expect(profileProps.canRemoveFromPlace).toBe(false);
        });

        it('offers no removal in a 1:1, even to the place owner', () => {
            channelValue = DM_CHANNEL;
            placeValue = { id: 's1', name: '플레이스', isOwner: true, ownerId: 'me' };
            membersValue = {
                members: [
                    { id: 'me', name: '나', $join: { joined: 1 } },
                    { id: 'peer', name: '상대', $join: { joined: 1 } },
                ],
                isLoading: false,
            };
            render(<ChannelSettingsPage />);

            fireEvent.click(screen.getByTestId('member-peer'));
            expect(profileProps.canKick).toBe(false);
            expect(profileProps.canRemoveFromPlace).toBe(false);
        });

        it("removes from the room's place with place.leave for that member", async () => {
            channelValue = OWNER_CHANNEL;
            placeValue = { id: 's1', name: '플레이스', isOwner: true, ownerId: 'me' };
            render(<ChannelSettingsPage />);

            fireEvent.click(screen.getByTestId('member-u2'));
            await act(async () => {
                await profileProps.onRemoveFromPlace();
            });

            expect(removePlaceMember).toHaveBeenCalledWith('s1', 'u2');
            expect(leaveChannel).not.toHaveBeenCalled();
            expect(toast).toHaveBeenCalledWith({ title: 'chat.settings.kicked' });
        });

        it('says so when the place removal fails', async () => {
            channelValue = OWNER_CHANNEL;
            placeValue = { id: 's1', name: '플레이스', isOwner: true, ownerId: 'me' };
            removePlaceMember.mockRejectedValueOnce(new Error('403'));
            render(<ChannelSettingsPage />);

            fireEvent.click(screen.getByTestId('member-u2'));
            await act(async () => {
                await profileProps.onRemoveFromPlace();
            });

            expect(toast).toHaveBeenCalledWith({ title: 'chat.settings.kickFailed', variant: 'destructive' });
        });
    });

    it('프로필의 onKick은 leaveChannel을 대상 userId와 함께 호출한다', async () => {
        channelValue = OWNER_CHANNEL;
        render(<ChannelSettingsPage />);

        fireEvent.click(screen.getByTestId('member-u2'));
        await act(async () => {
            await profileProps.onKick();
        });

        expect(leaveChannel).toHaveBeenCalledWith({ channelId: 'ch1', userId: 'u2' });
        expect(toast).toHaveBeenCalledWith({ title: 'chat.settings.kicked' });
    });

    it('방 삭제 확인 시 deleteChannel 호출 후 루트로 이동한다', async () => {
        channelValue = OWNER_CHANNEL;
        render(<ChannelSettingsPage />);

        fireEvent.click(screen.getByText('chat.settings.deleteRoom'));
        await act(async () => {
            fireEvent.click(screen.getByText('chat.settings.deleteDialog.confirm'));
        });

        expect(deleteChannel).toHaveBeenCalledWith({ channelId: 'ch1' });
        expect(navigate).toHaveBeenCalledWith('/', { replace: true });
    });
});

describe('ChannelSettingsPage — webhooks', () => {
    it('shows the webhook section to the owner of a group room', () => {
        channelValue = OWNER_CHANNEL;
        render(<ChannelSettingsPage />);

        expect(screen.getByTestId('webhooks')).toBeInTheDocument();
    });

    it('hides it from a member, from a 1:1 and from a self chat', () => {
        for (const value of [MEMBER_CHANNEL, DM_CHANNEL, SELF_CHANNEL]) {
            channelValue = value;
            const { unmount } = render(<ChannelSettingsPage />);
            expect(screen.queryByTestId('webhooks')).not.toBeInTheDocument();
            unmount();
        }
    });
});
