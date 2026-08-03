import '@testing-library/jest-dom';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ChannelSettingsPage } from './ChannelSettingsPage';

const leaveChannel = jest.fn().mockResolvedValue({});
const deleteChannel = jest.fn().mockResolvedValue({});
const updateJoin = jest.fn().mockResolvedValue({});
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

jest.mock('react-router-dom', () => ({ useParams: () => ({ channelId: 'ch1' }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/bridges', () => ({ logger: { error: jest.fn() } }));
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => navigate }));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));
jest.mock('@chatic/web-core', () => ({
    reportError: jest.fn(),
    useSessionIdentity: () => ({ userId: 'me' }),
}));

// Avoid pulling the ui barrel (which imports @chatic/assets, unmapped in jest).
jest.mock('../../../ui/components', () => ({ PageHeader: (p: any) => <div>{p.title}</div> }));

// Shared hooks barrel + cross-feature dialog import both pull @chatic/app-runtime (socket lib
// needs TextEncoder, unavailable in jsdom) — stub them to keep the suite runtime-free.
jest.mock('../../../hooks', () => ({
    useActivePlaceName: () => 'MyPlace',
    useMyProfile: () => myProfileValue,
}));
let placeSettingsProps: any;
let placeCreateProps: any;
jest.mock('../../home/components', () => ({
    PlaceProfileEditDialog: (p: any) => {
        placeSettingsProps = p;
        return <div data-testid="profile-settings" data-open={String(p.open)} />;
    },
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
    DefaultAvatar: () => <div data-testid="default-avatar" />,
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
});

jest.mock('../hooks', () => ({
    useChannel: () => channelValue,
    useChannelMembers: () => membersValue,
    useChannelMutations: () => ({ leaveChannel, deleteChannel, isPending: { delete: false, leave: false } }),
    useChannelProfiles: () => profilesValue,
    useDmPeer: () => dmPeerValue,
    useJoinMutations: () => ({ updateJoin, isPending: { update: false } }),
    useMyJoin: () => myJoinValue,
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

    // ADR-0039: DM 방 이름 변경을 되살렸다. join.nick이 제목 체인의 최상단인데 쓸 경로가
    // 없으면 그 단계가 영구히 죽은 분기가 된다.
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
            // channel.name을 쓰는 그룹 다이얼로그가 아니다.
            expect(screen.getByTestId('update')).toHaveAttribute('data-open', 'false');
        });

        it('폴백 이름을 다이얼로그 플레이스홀더로 넘긴다', () => {
            channelValue = DM_CHANNEL;
            dmPeerValue = { id: 'peer', profileNick: '토끼' };
            render(<ChannelSettingsPage />);

            expect(screen.getByTestId('dm-name')).toHaveAttribute('data-fallback', '토끼');
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

    it('친구 추가 행을 누르면 초대 페이지로 이동한다', () => {
        channelValue = OWNER_CHANNEL;
        render(<ChannelSettingsPage />);

        fireEvent.click(screen.getByText('chat.settings.addFriend'));
        expect(navigate).toHaveBeenCalledWith('/channels/ch1/invite');
    });

    it('알림 토글 초기값: 내 join의 notify가 없으면 on, "none"이면 off로 파생된다', () => {
        channelValue = OWNER_CHANNEL;
        myJoinValue = { userId: 'me' }; // notify 없음 → on
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

    // ADR-0040: profile.nick이 없으면 내 행이 사람 이름 자리에 유도 문구를 놓는다. user 레코드의
    // name(전화번호 가입자는 ***1234, 그 외 raw UUID)으로 폴백하지 않는다.
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
            // '나'는 user 캐시 이름 — 이 자리에 오면 안 된다.
            expect(me).not.toHaveTextContent('나');
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

        // 회귀 가드: isMembersLoading은 user 캐시 첫 emit에 false가 되고 프로필과 무관하다.
        // useChannelProfiles는 channel.sid에 하위 의존이라 '멤버는 도착, 프로필은 미도착' 구간이
        // 마운트마다 열린다. 이 구간을 '프로필 없음'으로 읽으면 프로필이 있는 사용자에게 유도가
        // 뜨고, 그 행을 탭하면 빈 폼 저장이 실제 nick을 덮어쓴다.
        it('프로필 읽기가 끝나기 전에는 멤버가 도착해 있어도 유도하지 않는다', () => {
            channelValue = OWNER_CHANNEL;
            profilesValue = { profileMap: new Map(), hasSnapshot: false };
            render(<ChannelSettingsPage />);

            // 멤버 행은 렌더된다 — 로딩 스피너로 가려진 상태가 아니다.
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
            // 해석된 플레이스 이름과 이탈 가드 카피를 넘긴다.
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

        // 멤버 리스트는 공용 코드다 — stereo로 게이팅하지 않는다.
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

        // 채널 이름 행은 유도 지점이 아니다 — self는 프로필이 없어도 유효한 라벨을 갖는다.
        it('self 방의 이름 행은 프로필이 없어도 유도가 아니라 라벨을 쓴다', () => {
            channelValue = SELF_CHANNEL;
            noProfile();
            myProfileValue = { profile: null };
            render(<ChannelSettingsPage />);

            expect(screen.getByText('channelList.selfChannel')).toBeInTheDocument();
            // 유도는 멤버 행에만 있다.
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
