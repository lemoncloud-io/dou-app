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

jest.mock('../hooks', () => ({
    useChannel: () => channelValue,
    useChannelMembers: () => membersValue,
    useChannelMutations: () => ({ leaveChannel, deleteChannel, isPending: { delete: false, leave: false } }),
    useChannelProfiles: () => ({ profileMap: new Map() }),
}));

// Prop-capturing stubs so we can assert wiring without deep dialog rendering.
let profileProps: any;
jest.mock('../components/InviteFriendsDialog', () => ({
    InviteFriendsDialog: (p: any) => <div data-testid="invite" data-open={String(p.open)} />,
}));
jest.mock('../components/UpdateChannelDialog', () => ({
    UpdateChannelDialog: (p: any) => <div data-testid="update" data-open={String(p.open)} />,
}));
jest.mock('../components/ConfirmDialog', () => ({
    ConfirmDialog: (p: any) => (p.open ? <button onClick={p.onConfirm}>{p.confirmLabel}</button> : null),
}));
jest.mock('../components/RoomNotificationDialog', () => ({
    RoomNotificationDialog: (p: any) => <div data-testid="notif" data-open={String(p.open)} />,
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
    channel: { isOwner: true, isSelfChat: false, ownerId: 'owner1', name: '방', memberCount: 3, sid: 's1' },
    isError: false,
};
const MEMBER_CHANNEL = {
    channel: { isOwner: false, isSelfChat: false, ownerId: 'owner1', name: '방', memberCount: 3, sid: 's1' },
    isError: false,
};
const MEMBERS = {
    members: [
        { id: 'owner1', name: '오너' },
        { id: 'me', name: '나' },
        { id: 'u2', name: '유저2' },
    ],
    total: 3,
    isLoading: false,
};

beforeEach(() => {
    jest.clearAllMocks();
    membersValue = MEMBERS;
    profileProps = undefined;
});

describe('ChannelSettingsPage', () => {
    it('소유자에게는 초대·알림·방삭제·편집을 노출하고 방나가기는 숨긴다', () => {
        channelValue = OWNER_CHANNEL;
        render(<ChannelSettingsPage />);

        expect(screen.getByText('chat.settings.inviteFriends')).toBeInTheDocument();
        expect(screen.getByText('chat.settings.notifications')).toBeInTheDocument();
        expect(screen.getByText('chat.settings.deleteRoom')).toBeInTheDocument();
        expect(screen.getByText('chat.settings.edit')).toBeInTheDocument();
        expect(screen.queryByText('chat.settings.leaveRoom')).not.toBeInTheDocument();
    });

    it('일반 멤버에게는 알림·방나가기만 노출하고 초대·삭제·편집은 숨긴다', () => {
        channelValue = MEMBER_CHANNEL;
        render(<ChannelSettingsPage />);

        expect(screen.getByText('chat.settings.notifications')).toBeInTheDocument();
        expect(screen.getByText('chat.settings.leaveRoom')).toBeInTheDocument();
        expect(screen.queryByText('chat.settings.inviteFriends')).not.toBeInTheDocument();
        expect(screen.queryByText('chat.settings.deleteRoom')).not.toBeInTheDocument();
        expect(screen.queryByText('chat.settings.edit')).not.toBeInTheDocument();
    });

    it('알림 액션을 누르면 알림 설정 다이얼로그가 열린다', () => {
        channelValue = OWNER_CHANNEL;
        render(<ChannelSettingsPage />);

        expect(screen.getByTestId('notif')).toHaveAttribute('data-open', 'false');
        fireEvent.click(screen.getByText('chat.settings.notifications'));
        expect(screen.getByTestId('notif')).toHaveAttribute('data-open', 'true');
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
});
