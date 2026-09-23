import '@testing-library/jest-dom';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ChannelSettingsPage } from './ChannelSettingsPage';

const leaveChannel = jest.fn().mockResolvedValue({});
const deleteChannel = jest.fn().mockResolvedValue({});
const updateJoin = jest.fn().mockResolvedValue({});
const startDmMock = jest.fn().mockResolvedValue({ id: 'dm-1' });
const navigate = jest.fn();
const toast = jest.fn();

// Mutable hook return values, set per test.
let channelValue: any;
let membersValue: any;
let myJoinValue: any;
let dmPeerValue: any;
// Site profiles by userId — what the MEMBER ROW reads (useChannelProfiles). Defaults to "I have a
// profile" so only the nudge tests opt out; an empty map would silently route every my-row assertion
// through the profile-setup branch.
let profilesValue: any;
// What the TITLE CHAIN reads (useMyProfile). Deliberately a different nick from the member row's: the
// two are separate sources by design (they trade immediacy against safety), so a test that conflates
// them would hide a real drift.
let myProfileValue: any;
/** Only a main user may issue an invite (ADR-0034), so this gates the friend sheet's re-invite CTA. */
let mockIsGuest = false;
/** What `useDmInviteState` reports — the friend sheet's "대화방 나감" line and the re-invite prefill. */
let dmInviteStateValue: any;

jest.mock('react-router-dom', () => ({
    useParams: () => ({ channelId: 'ch1' }),
    useLocation: () => ({ state: null }),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
// Every level, not just `error`: the page's divergence check logs `warn`, and a partial logger mock
// turns that into a TypeError inside an effect cleanup.
jest.mock('@chatic/bridges', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => navigate }));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));
// One factory for the whole module: the page reads the session identity here, and the role gate too
// (only a main user gets the re-invite CTA). Importing the real module would load the data layer,
// whose IndexedDB open crashes outside a browser.
jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            useSessionIdentity: () => ({ userId: 'me' }),
            useRuntimeProfile: () => ({ isGuest: mockIsGuest }),
            // Only a cloud-wide room reads this (`profilePlaceOf`); these channels are read in a place.
            useSessionSelection: () => ({ selectedSiteId: 'S:active' }),
        },
    },
}));

// Avoid pulling the ui barrel (which imports @chatic/assets, unmapped in jest).
jest.mock('../../../ui/components', () => ({ PageHeader: (p: any) => <div>{p.title}</div> }));

// Shared hooks barrel + cross-feature dialog import both pull @chatic/app-runtime (socket lib
// needs TextEncoder, unavailable in jsdom) — stub them to keep the suite runtime-free.
jest.mock('../../../hooks', () => ({
    useActivePlaceName: () => 'MyPlace',
    useMyProfile: () => myProfileValue,
    useSetMyPlaceProfile: () => jest.fn(),
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

// web-ui-kit stubs — ListRow exposes onClick as a button so rows are clickable/queryable;
// Switch forwards its controlled toggle so the notification state can be exercised.
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
        <button type="button" role="switch" aria-checked={checked} onClick={() => onCheckedChange?.(!checked)}>
            {label}
        </button>
    ),
    Divider: () => <hr />,
    ChatAvatar: () => <div data-testid="chat-avatar" />,
    DefaultAvatar: ({ variant }: any) => <div data-testid="default-avatar" data-variant={variant} />,
    ImageAvatar: ({ alt }: any) => <img alt={alt} />,
}));

// Prop-capturing stubs so we can assert wiring without deep dialog rendering.
let profileProps: any;
jest.mock('../components/UpdateChannelDialog', () => ({
    UpdateChannelDialog: (p: any) => <div data-testid="update" data-open={String(p.open)} />,
}));
// One component, two mounts (self / dm) — key the testid off the variant so each can be asserted.
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
// 1:1 room. The inviter owns it, which is why the owner/member title branch is wrong for a DM.
const DM_CHANNEL = {
    channel: {
        isOwner: true,
        isSelfChat: false,
        stereo: 'dm',
        ownerId: 'me',
        name: '서버 이름',
        // The relay cloud — `cid` is what the lineage reads (ADR-0111).
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
    membersValue = MEMBERS;
    myJoinValue = { userId: 'me' }; // my join row from the stream; notify undefined → on
    dmPeerValue = null;
    profileProps = undefined;
    placeCreateProps = undefined;
    profilesValue = { profileMap: new Map([['me', { nick: '내멤버프로필' }]]), hasSnapshot: true };
    myProfileValue = { profile: { nick: '내프로필' } };
    mockIsGuest = false;
    dmInviteStateValue = { state: { kind: 'present' }, countdown: null, resolveReinvitePrefill: () => ({}) };
});

jest.mock('../hooks', () => ({
    useChannel: () => channelValue,
    useChannelMembers: () => membersValue,
    useChannelMutations: () => ({ leaveChannel, deleteChannel, isPending: { delete: false, leave: false } }),
    useChannelProfiles: () => profilesValue,
    useDmPeer: () => dmPeerValue,
    useDmInviteState: () => dmInviteStateValue,
    // Opening a 1:1 from a member's profile — its own contract is held by useStartDm's tests.
    useStartDm: () => ({ startDm: startDmMock, isStarting: false, isError: false }),
    useJoinMutations: () => ({ updateJoin, isPending: { update: false } }),
    // The room's single join observation: my row (nick/notification) and the roster row list come from one source.
    useChannelJoins: () => ({
        joins: myJoinValue ? [myJoinValue] : [],
        myJoin: myJoinValue,
        activeMemberIds: myJoinValue?.userId ? [myJoinValue.userId] : [],
        cursorByUser: new Map<string, number>(),
    }),
    // The title chain is what these tests are checking, so run the real hook — only the barrel
    // around it (which drags in the socket runtime) is stubbed.
    useChannelTitle: jest.requireActual('../hooks/useChannelTitle').useChannelTitle,
}));

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

        // Title comes from the self-chat derivation (join nick → my name), not channel.name.
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

    // ADR-0039: brought back DM room renaming. join.nick sits at the top of the title chain, and
    // without a way to write it, that step would be a permanently dead branch.
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
            // Not the group dialog, which uses channel.name.
            expect(screen.getByTestId('update')).toHaveAttribute('data-open', 'false');
        });

        // A cloud 1:1's title skips `join.nick`, so an editor for it would save a name no screen
        // ever shows. The row stays (it is the title) and stops being a button (ADR-0111).
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

        // Offering "reinvite" while the peer is already in the room would, once tapped, issue
        // another live code to someone who's already there. Locked by the same rule the room
        // footer uses (canReinviteDm).
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

        // While one live invite exists, don't create a second even if the peer left.
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

    it('멤버도 방 이름을 탭하면 같은 정보 다이얼로그가 열린다', () => {
        channelValue = MEMBER_CHANNEL;
        render(<ChannelSettingsPage />);

        fireEvent.click(screen.getByText('방'));
        expect(screen.getByTestId('update')).toHaveAttribute('data-open', 'true');
    });

    // The goal itself: no member gets a pending-invite badge. Since the join counter represents
    // both "not yet joined" and "left" as the same 0 and can't tell them apart, rather than
    // guessing, the badge isn't drawn at all.
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

    it('알림 토글 초기값: 내 join의 notify가 없으면 on, "none"이면 off로 파생된다', () => {
        channelValue = OWNER_CHANNEL;
        myJoinValue = { userId: 'me' }; // no notify → on
        const { unmount } = render(<ChannelSettingsPage />);
        expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
        unmount();

        myJoinValue = { userId: 'me', notify: 'none' };
        render(<ChannelSettingsPage />);
        expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    });

    it('알림 토글을 끄면 updateJoin이 notify="none"으로 호출된다', async () => {
        channelValue = OWNER_CHANNEL;
        render(<ChannelSettingsPage />);

        await act(async () => {
            fireEvent.click(screen.getByRole('switch'));
        });

        expect(updateJoin).toHaveBeenCalledWith({ channelId: 'ch1', userId: 'me', notify: 'none' });
        expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    });

    it('updateJoin 실패 시 토글을 원복하고 실패 toast를 띄운다', async () => {
        updateJoin.mockRejectedValueOnce(new Error('boom'));
        channelValue = OWNER_CHANNEL;
        render(<ChannelSettingsPage />);

        await act(async () => {
            fireEvent.click(screen.getByRole('switch'));
        });

        await waitFor(() => expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true'));
        expect(toast).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'chat.settings.notifyFailed', variant: 'destructive' })
        );
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

    // ADR-0040: when profile.nick is missing, my row puts a nudge message where a person's name
    // would go. It does not fall back to the user record's name (***1234 for a phone signup, or
    // a raw UUID otherwise).
    describe('프로필 미설정 유도 (내 행)', () => {
        // Settled reading that genuinely holds no profile for me.
        const noProfile = () => {
            profilesValue = { profileMap: new Map(), hasSnapshot: true };
        };

        it('내 프로필이 없으면 내 행에 유도 문구를 놓고 user.name을 쓰지 않는다', () => {
            channelValue = OWNER_CHANNEL;
            noProfile();
            render(<ChannelSettingsPage />);

            const me = screen.getByTestId('member-me');
            expect(me).toHaveTextContent('chat.settings.profileSetupRequired');
            expect(me).toHaveAttribute('data-needs-profile', 'true');
            // '나' (me) is the user-cache name — it must not show up here.
            expect(me).not.toHaveTextContent('나');
        });

        // The chain this row draws is now `resolveUserName`, not a copy of it. The copy re-read
        // `member.name` with no raw-id guard, so a member whose cached name IS their account id
        // (what the server seeds an unnamed user with) rendered as that id.
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
            profilesValue = { profileMap: new Map([['me', { nick: '   ' }]]), hasSnapshot: true };
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

        // Regression guard: isMembersLoading turns false on the user cache's first emit and knows
        // nothing about profiles. useChannelProfiles depends downstream on channel.sid, so the
        // window where "members have arrived, profile hasn't" opens on every mount. Reading that
        // window as "no profile" would nudge a user who does have one, and tapping that row would
        // let an empty-form save overwrite the real nick.
        it('프로필 읽기가 끝나기 전에는 멤버가 도착해 있어도 유도하지 않는다', () => {
            channelValue = OWNER_CHANNEL;
            profilesValue = { profileMap: new Map(), hasSnapshot: false };
            render(<ChannelSettingsPage />);

            // The member row does render — it's not hidden behind a loading spinner.
            const me = screen.getByTestId('member-me');
            expect(me).toHaveAttribute('data-needs-profile', 'false');
            expect(screen.queryByText('chat.settings.profileSetupRequired')).not.toBeInTheDocument();
        });

        it('프로필 읽기 전에는 내 행 탭이 생성 다이얼로그를 열지 않는다', () => {
            channelValue = OWNER_CHANNEL;
            profilesValue = { profileMap: new Map(), hasSnapshot: false };
            render(<ChannelSettingsPage />);

            fireEvent.click(screen.getByTestId('member-me'));
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
            // Passes the resolved place name and the exit-guard copy.
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

        // The member list is shared code — it isn't gated by stereo.
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

        // The channel name row is not a nudge point — self has a valid label even with no profile.
        it('self 방의 이름 행은 프로필이 없어도 유도가 아니라 라벨을 쓴다', () => {
            channelValue = SELF_CHANNEL;
            noProfile();
            myProfileValue = { profile: null };
            render(<ChannelSettingsPage />);

            expect(screen.getByText('channelList.selfChannel')).toBeInTheDocument();
            // The nudge only lives on the member row.
            expect(screen.getByTestId('member-me')).toHaveTextContent('chat.settings.profileSetupRequired');
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
