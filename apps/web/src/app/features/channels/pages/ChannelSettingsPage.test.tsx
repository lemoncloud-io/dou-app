import '@testing-library/jest-dom';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { ChannelSettingsPage } from './ChannelSettingsPage';

const leaveChannel = jest.fn().mockResolvedValue({});
const deleteChannel = jest.fn().mockResolvedValue({});
const navigate = jest.fn();
const toast = jest.fn();

// Mutable hook return values, set per test.
let channelValue: any;
let membersValue: any;

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
    ImageAvatar: ({ alt }: any) => <img alt={alt} />,
}));

// Prop-capturing stubs so we can assert wiring without deep dialog rendering.
let profileProps: any;
jest.mock('../components/UpdateChannelDialog', () => ({
    UpdateChannelDialog: (p: any) => (
        <div data-testid="update" data-open={String(p.open)} data-readonly={String(p.readOnly)} />
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
        <button data-testid={`member-${p.member.id}`} onClick={p.onClick}>
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
    channel: { isOwner: true, isSelfChat: true, ownerId: 'me', name: '나와의 채팅', sid: 's1' },
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
    profileProps = undefined;
});

jest.mock('../hooks', () => ({
    useChannel: () => channelValue,
    useChannelMembers: () => membersValue,
    useChannelMutations: () => ({ leaveChannel, deleteChannel, isPending: { delete: false, leave: false } }),
    useChannelProfiles: () => ({ profileMap: new Map() }),
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

    it('self 채팅: 방 이름만 노출하고 설정/멤버/삭제 섹션은 숨긴다', () => {
        channelValue = SELF_CHANNEL;
        render(<ChannelSettingsPage />);

        expect(screen.getByText('나와의 채팅')).toBeInTheDocument();
        expect(screen.queryByText('chat.settings.roomSettingsGroup')).not.toBeInTheDocument();
        expect(screen.queryByText('chat.settings.deleteRoom')).not.toBeInTheDocument();
        expect(screen.queryByText('chat.settings.leaveRoom')).not.toBeInTheDocument();
    });

    it('소유자가 방 이름을 탭하면 편집 가능한 정보 다이얼로그가 열린다', () => {
        channelValue = OWNER_CHANNEL;
        render(<ChannelSettingsPage />);

        fireEvent.click(screen.getByText('방'));
        const dialog = screen.getByTestId('update');
        expect(dialog).toHaveAttribute('data-open', 'true');
        expect(dialog).toHaveAttribute('data-readonly', 'false');
    });

    it('멤버가 방 이름을 탭하면 읽기전용 정보 다이얼로그가 열린다', () => {
        channelValue = MEMBER_CHANNEL;
        render(<ChannelSettingsPage />);

        fireEvent.click(screen.getByText('방'));
        const dialog = screen.getByTestId('update');
        expect(dialog).toHaveAttribute('data-open', 'true');
        expect(dialog).toHaveAttribute('data-readonly', 'true');
    });

    it('친구 추가 행을 누르면 초대 페이지로 이동한다', () => {
        channelValue = OWNER_CHANNEL;
        render(<ChannelSettingsPage />);

        fireEvent.click(screen.getByText('chat.settings.addFriend'));
        expect(navigate).toHaveBeenCalledWith('/channels/ch1/invite');
    });

    it('대화방 알림 토글은 기본 on이며 누르면 off로 바뀐다 (UI-only)', () => {
        channelValue = OWNER_CHANNEL;
        render(<ChannelSettingsPage />);

        const toggle = screen.getByRole('switch');
        expect(toggle).toHaveAttribute('aria-checked', 'true');
        fireEvent.click(toggle);
        expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
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
