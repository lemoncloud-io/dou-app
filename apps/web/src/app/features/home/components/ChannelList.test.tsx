import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import { ChannelList } from './ChannelList';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'ko' } }) }));
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => jest.fn() }));
jest.mock('@chatic/app-runtime', () => ({ useChannelSync: () => undefined }));
// My user id drives the owner-vs-member title branch; 'me' owns channels tagged ownerId: 'me'.
jest.mock('@chatic/web-core', () => ({ useSessionIdentity: () => ({ userId: 'me' }) }));
jest.mock('../../../stores/usePreferenceStore', () => ({ usePreferenceStore: () => false }));
// The rows' preview source — the list-level combined lookup (ADR-0057). Null by default (rows
// under test have no messages); the preview cases below seed it for EVERY row. Preview picking
// itself is covered by chatPreview.test.ts (libs/data) and useLastChats.test.ts.
let mockLastChat: any = null;
jest.mock('../../../hooks/useLastChats', () => ({
    useLastChats: () => ({ get: () => mockLastChat ?? undefined }),
}));

// My profile nick is the self-chat title fallback and my photo is the self-chat row avatar
// (both resolved once by ChannelList). resolveSelfChatTitle / resolveChannelAvatar are the real
// pure fns (unit-tested separately).
jest.mock('../../../hooks', () => ({
    useMyProfile: () => ({ profile: { nick: 'MY_NICK', thumbnail: 'my-photo.png' } }),
}));

// The list-level DM peer lookup (one profile subscription for every DM row) is covered by
// useDmPeers.test.ts; here we inject its result so rows can be driven without the runtime.
const mockDmPeers = new Map<string, { id: string; profileNick?: string; thumbnail?: string }>();
jest.mock('../../channels/hooks', () => ({ useDmPeers: () => mockDmPeers }));

jest.mock('@chatic/ui-kit/components/ui/dropdown-menu', () => ({
    DropdownMenu: ({ children }: any) => <div>{children}</div>,
    DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
    DropdownMenuItem: ({ children }: any) => <div>{children}</div>,
    DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@chatic/web-ui-kit', () => ({
    Badge: ({ children }: any) => <span>{children}</span>,
    CollapsibleSection: ({ children }: any) => <section>{children}</section>,
    DefaultAvatar: ({ variant }: any) => <div data-testid="default-avatar" data-variant={variant} />,
    IconBolt: () => <i />,
    IconPlus: () => <i />,
    ImageAvatar: ({ src }: any) => <img alt="" src={src} data-testid="image-avatar" />,
    ListRow: ({ leading, title, subtitle, trailing, onClick }: any) => (
        <div onClick={onClick}>
            <div data-testid="row-leading">{leading}</div>
            <div data-testid="row-title">{title}</div>
            <div>{subtitle}</div>
            <div data-testid="row-trailing">{trailing}</div>
        </div>
    ),
    PlanBadge: () => <span>PRO</span>,
    StatusBadge: ({ label }: any) => <span data-testid="status-badge">{label}</span>,
    UnreadBadge: () => <span data-testid="unread" />,
}));

const makeChannel = (over: any) => ({ id: 'c1', name: '', stereo: 'group', memberNo: 3, ...over });

describe('ChannelList self-chat row', () => {
    it('stereo=self 행은 커스텀 nick($join.nick)을 제목으로, MY 배지를 노출한다', () => {
        render(
            <ChannelList
                channels={[
                    makeChannel({ id: 'self1', stereo: 'self', memberNo: 1, name: '', $join: { nick: '내 메모장' } }),
                ]}
                unreadByChannel={{}}
                isLoading={false}
            />
        );

        expect(screen.getByText('내 메모장')).toBeInTheDocument();
        expect(screen.getByText('MY')).toBeInTheDocument();
    });

    it('self 행은 구독 join 목록의 nick을 임베드 $join.nick보다 우선한다', () => {
        render(
            <ChannelList
                channels={[
                    makeChannel({ id: 'self1', stereo: 'self', memberNo: 1, name: '', $join: { nick: '옛닉' } }),
                ]}
                unreadByChannel={{}}
                joinByChannel={new Map([['self1', { nick: '새닉' } as any]])}
                isLoading={false}
            />
        );

        expect(screen.getByText('새닉')).toBeInTheDocument();
        expect(screen.queryByText('옛닉')).not.toBeInTheDocument();
    });

    it('nick이 없는 self 행은 내 프로필 nick으로 폴백한다 (user.name UUID가 아니라)', () => {
        render(
            <ChannelList
                channels={[makeChannel({ id: 'self2', stereo: 'self', memberNo: 1, name: '' })]}
                unreadByChannel={{}}
                isLoading={false}
            />
        );

        expect(screen.getByText('MY_NICK')).toBeInTheDocument();
    });

    it('서버 기본 nick(UUID)은 무시하고 내 프로필 nick으로 폴백한다', () => {
        // Unnamed self-chat: the server seeds join.nick to the raw userId (a UUID). Caught by the
        // UUID-shape guard regardless of the session uid.
        const uuidNick = '6f9a03e5-5e28-424e-bc1f-1ebdb34631eb';
        render(
            <ChannelList
                channels={[
                    makeChannel({ id: 'self3', stereo: 'self', memberNo: 1, name: '', $join: { nick: uuidNick } }),
                ]}
                unreadByChannel={{}}
                isLoading={false}
            />
        );

        expect(screen.getByText('MY_NICK')).toBeInTheDocument();
        expect(screen.queryByText(uuidNick)).not.toBeInTheDocument();
    });

    it('nick이 내 세션 userId와 같으면 무시하고 프로필 nick으로 폴백한다', () => {
        render(
            <ChannelList
                channels={[
                    // useSessionIdentity mock returns userId: 'me'; a nick equal to it is the default, not a name.
                    makeChannel({ id: 'self4', stereo: 'self', memberNo: 1, name: '', $join: { nick: 'me' } }),
                ]}
                unreadByChannel={{}}
                isLoading={false}
            />
        );

        expect(screen.getByText('MY_NICK')).toBeInTheDocument();
    });

    it('채널 목록을 join updatedAt 최신순으로 정렬한다', () => {
        render(
            <ChannelList
                channels={[
                    makeChannel({ id: 'a', stereo: 'group', memberNo: 1, name: 'A방' }),
                    makeChannel({ id: 'b', stereo: 'group', memberNo: 1, name: 'B방' }),
                ]}
                unreadByChannel={{}}
                joinByChannel={
                    new Map([
                        ['a', { updatedAt: 100 } as any],
                        ['b', { updatedAt: 200 } as any],
                    ])
                }
                isLoading={false}
            />
        );

        const titles = screen.getAllByTestId('row-title').map(el => el.textContent);
        expect(titles).toEqual(['B방', 'A방']); // b(updatedAt 200) before a(100)
    });

    it('그룹 행은 channel.name을 제목으로 쓰고 MY 배지가 없다', () => {
        render(
            <ChannelList
                channels={[makeChannel({ id: 'g1', stereo: 'group', memberNo: 3, name: '스터디방', ownerId: 'other' })]}
                unreadByChannel={{}}
                isLoading={false}
            />
        );

        expect(screen.getByText('스터디방')).toBeInTheDocument();
        expect(screen.queryByText('MY')).not.toBeInTheDocument();
    });

    it('내가 소유한 채널은 channel.name을 쓰고 내 join.nick은 무시한다', () => {
        render(
            <ChannelList
                channels={[
                    makeChannel({
                        id: 'g1',
                        stereo: 'group',
                        name: '공지방',
                        ownerId: 'me',
                        $join: { nick: '내별명' },
                    }),
                ]}
                unreadByChannel={{}}
                isLoading={false}
            />
        );

        expect(screen.getByText('공지방')).toBeInTheDocument();
        expect(screen.queryByText('내별명')).not.toBeInTheDocument();
    });

    it('멤버인 채널은 join.nick을 제목으로 쓴다', () => {
        render(
            <ChannelList
                channels={[makeChannel({ id: 'g1', stereo: 'group', name: '공지방', ownerId: 'other' })]}
                unreadByChannel={{}}
                joinByChannel={new Map([['g1', { nick: '내별명' } as any]])}
                isLoading={false}
            />
        );

        expect(screen.getByText('내별명')).toBeInTheDocument();
        expect(screen.queryByText('공지방')).not.toBeInTheDocument();
    });

    it('멤버인데 join.nick이 없으면 channel.name으로 폴백한다', () => {
        render(
            <ChannelList
                channels={[makeChannel({ id: 'g1', stereo: 'group', name: '공지방', ownerId: 'other' })]}
                unreadByChannel={{}}
                isLoading={false}
            />
        );

        expect(screen.getByText('공지방')).toBeInTheDocument();
    });
});

// ADR-0039: DM 행은 채널이 아니라 사람을 보여준다. 이름·아바타·인원수 셋 다 그 결과다.
describe('ChannelList — 1:1(DM) 행', () => {
    const dmChannel = (over: any = {}) =>
        makeChannel({ id: 'dm1', stereo: 'dm', memberNo: 2, name: '', ownerId: 'me', ...over });

    beforeEach(() => mockDmPeers.clear());

    it('상대 프로필 닉을 제목으로 쓴다', () => {
        mockDmPeers.set('dm1', { id: 'peer', profileNick: '토끼' });

        render(<ChannelList channels={[dmChannel()]} unreadByChannel={{}} isLoading={false} />);

        expect(screen.getByText('토끼')).toBeInTheDocument();
    });

    it('내가 오너여도 channel.name이 아니라 상대 닉을 쓴다', () => {
        mockDmPeers.set('dm1', { id: 'peer', profileNick: '토끼' });

        render(<ChannelList channels={[dmChannel({ name: '서버 이름' })]} unreadByChannel={{}} isLoading={false} />);

        expect(screen.getByText('토끼')).toBeInTheDocument();
        expect(screen.queryByText('서버 이름')).not.toBeInTheDocument();
    });

    it('내 join.nick이 있으면 상대 닉을 이긴다', () => {
        mockDmPeers.set('dm1', { id: 'peer', profileNick: '토끼' });

        render(
            <ChannelList
                channels={[dmChannel()]}
                unreadByChannel={{}}
                joinByChannel={new Map([['dm1', { nick: '토끼친구' } as any]])}
                isLoading={false}
            />
        );

        expect(screen.getByText('토끼친구')).toBeInTheDocument();
    });

    it('상대 프로필이 없으면 DM 전용 라벨로 떨어진다', () => {
        mockDmPeers.set('dm1', { id: 'peer' });

        render(<ChannelList channels={[dmChannel()]} unreadByChannel={{}} isLoading={false} />);

        expect(screen.getByText('chat.dm.unnamedPeer')).toBeInTheDocument();
    });

    it('아바타로 상대 thumbnail을 쓴다 (채널 thumbnail은 무시)', () => {
        mockDmPeers.set('dm1', { id: 'peer', profileNick: '토끼', thumbnail: 'peer.png' });

        render(
            <ChannelList channels={[dmChannel({ thumbnail: 'channel.png' })]} unreadByChannel={{}} isLoading={false} />
        );

        expect(screen.getByTestId('image-avatar')).toHaveAttribute('src', 'peer.png');
    });

    it('상대 thumbnail이 없으면 기본 아바타를 쓴다', () => {
        mockDmPeers.set('dm1', { id: 'peer', profileNick: '토끼' });

        render(<ChannelList channels={[dmChannel()]} unreadByChannel={{}} isLoading={false} />);

        expect(screen.getByTestId('default-avatar')).toBeInTheDocument();
    });

    it('인원수 pill을 숨긴다 (그룹 행에는 남아 있다)', () => {
        mockDmPeers.set('dm1', { id: 'peer', profileNick: '토끼' });

        render(
            <ChannelList
                channels={[dmChannel(), makeChannel({ id: 'g1', stereo: 'group', name: '공지방', memberNo: 5 })]}
                unreadByChannel={{}}
                isLoading={false}
            />
        );

        expect(screen.queryByText('2')).not.toBeInTheDocument();
        expect(screen.getByText('5')).toBeInTheDocument();
    });
});

describe('ChannelList — 초대 행 (ADR-0033 Track B)', () => {
    it('sentInvites의 각 항목을 채널 위에 행으로 보여준다', () => {
        render(
            <ChannelList
                channels={[makeChannel({ id: 'g1', stereo: 'group', name: '공지방', ownerId: 'other' })]}
                unreadByChannel={{}}
                isLoading={false}
                sentInvites={[{ id: 'invite-1', state: 'pending', name: '홍길동' } as any]}
            />
        );

        expect(screen.getByText('홍길동')).toBeInTheDocument();
        expect(screen.getByTestId('status-badge')).toHaveTextContent('contactInvite.badge.pending');
    });

    it('초대 행을 탭하면 onSelectInvite에 invite id를 넘긴다', () => {
        const onSelectInvite = jest.fn();
        render(
            <ChannelList
                channels={[]}
                unreadByChannel={{}}
                isLoading={false}
                sentInvites={[{ id: 'invite-1', state: 'pending', name: '홍길동' } as any]}
                onSelectInvite={onSelectInvite}
            />
        );

        fireEvent.click(screen.getByText('홍길동'));
        expect(onSelectInvite).toHaveBeenCalledWith('invite-1');
    });

    it('채널은 없고 초대만 있으면 채널 없음 문구를 보여주지 않는다', () => {
        render(
            <ChannelList
                channels={[]}
                unreadByChannel={{}}
                isLoading={false}
                sentInvites={[{ id: 'invite-1', state: 'pending', name: '홍길동' } as any]}
            />
        );

        expect(screen.queryByText('channelList.empty')).not.toBeInTheDocument();
    });

    it('채널도 초대도 없으면 기존처럼 채널 없음 문구를 보여준다', () => {
        render(<ChannelList channels={[]} unreadByChannel={{}} isLoading={false} />);

        expect(screen.getByText('channelList.empty')).toBeInTheDocument();
    });
});

describe('ChannelList 아바타', () => {
    it('self 행은 내 플레이스 프로필 사진을 쓴다', () => {
        render(
            <ChannelList
                channels={[makeChannel({ id: 'self1', stereo: 'self', memberNo: 1, name: '' })]}
                unreadByChannel={{}}
                isLoading={false}
            />
        );

        expect(screen.getByTestId('image-avatar')).toHaveAttribute('src', 'my-photo.png');
    });

    it('self 행은 channel.thumbnail이 있어도 내 프로필 사진을 쓴다', () => {
        render(
            <ChannelList
                channels={[makeChannel({ id: 'self1', stereo: 'self', memberNo: 1, name: '', thumbnail: 'room.png' })]}
                unreadByChannel={{}}
                isLoading={false}
            />
        );

        expect(screen.getByTestId('image-avatar')).toHaveAttribute('src', 'my-photo.png');
    });

    it('그룹 행은 내 프로필 사진이 아니라 channel.thumbnail을 쓴다', () => {
        render(
            <ChannelList
                channels={[makeChannel({ id: 'g1', stereo: 'group', name: '스터디방', thumbnail: 'room.png' })]}
                unreadByChannel={{}}
                isLoading={false}
            />
        );

        expect(screen.getByTestId('image-avatar')).toHaveAttribute('src', 'room.png');
    });

    it('사진 없는 그룹 행은 2인 글리프를 쓴다 (1인 기본값이 아니라 — Figma 3164-12515)', () => {
        render(
            <ChannelList
                channels={[makeChannel({ id: 'g1', stereo: 'group', name: '스터디방' })]}
                unreadByChannel={{}}
                isLoading={false}
            />
        );

        expect(screen.getByTestId('default-avatar')).toHaveAttribute('data-variant', 'group');
    });

    it('사진 없는 dm 행은 1인 글리프를 쓴다', () => {
        render(
            <ChannelList
                channels={[makeChannel({ id: 'd1', stereo: 'dm', memberNo: 2, name: '' })]}
                unreadByChannel={{}}
                isLoading={false}
            />
        );

        expect(screen.getByTestId('default-avatar')).toHaveAttribute('data-variant', 'user');
    });
});

describe('ChannelList 고정 · 알림꺼짐 표기', () => {
    const renderRow = (props: Partial<Parameters<typeof ChannelList>[0]> = {}) =>
        render(
            <ChannelList
                channels={[makeChannel({ id: 'c1', stereo: 'group', name: '스터디방', ownerId: 'me' })]}
                unreadByChannel={{}}
                isLoading={false}
                {...(props as any)}
            />
        );

    it('고정된 채널은 핀 아이콘을 노출한다', () => {
        renderRow({ pinnedChannelIds: new Set(['c1']) });

        expect(screen.getByLabelText('channelList.pinned')).toBeInTheDocument();
    });

    it('고정되지 않은 채널에는 핀 아이콘이 없다', () => {
        renderRow({ pinnedChannelIds: new Set(['other']) });

        expect(screen.queryByLabelText('channelList.pinned')).not.toBeInTheDocument();
    });

    it("내 join의 notify가 'none'이면 알림꺼짐 아이콘을 노출한다", () => {
        renderRow({ joinByChannel: new Map([['c1', { notify: 'none' } as any]]) });

        expect(screen.getByLabelText('channelList.muted')).toBeInTheDocument();
    });

    it("notify가 'all'이면 알림꺼짐 아이콘이 없다", () => {
        renderRow({ joinByChannel: new Map([['c1', { notify: 'all' } as any]]) });

        expect(screen.queryByLabelText('channelList.muted')).not.toBeInTheDocument();
    });

    it('join 정보가 없으면 알림꺼짐으로 보지 않는다 (기본값은 알림 켜짐)', () => {
        renderRow();

        expect(screen.queryByLabelText('channelList.muted')).not.toBeInTheDocument();
    });

    it('고정 + 알림꺼짐이 동시에 켜져 있으면 두 아이콘 모두 노출한다', () => {
        renderRow({
            pinnedChannelIds: new Set(['c1']),
            joinByChannel: new Map([['c1', { notify: 'none' } as any]]),
        });

        expect(screen.getByLabelText('channelList.pinned')).toBeInTheDocument();
        expect(screen.getByLabelText('channelList.muted')).toBeInTheDocument();
    });

    it('두 상태 아이콘은 제목 옆에 나란히 온다 (시각 옆이 아니라)', () => {
        renderRow({
            pinnedChannelIds: new Set(['c1']),
            joinByChannel: new Map([['c1', { notify: 'none' } as any]]),
        });

        const title = screen.getByTestId('row-title');
        expect(title).toContainElement(screen.getByLabelText('channelList.pinned'));
        expect(title).toContainElement(screen.getByLabelText('channelList.muted'));
        expect(screen.getByTestId('row-trailing')).not.toContainElement(screen.getByLabelText('channelList.pinned'));
    });
});

// ADR-0047 결정 6 — 다른 클라이언트(데스크톱)가 지운 메시지는 hidden 행으로 들어온다.
// 방과 홈이 같은 문구를 쓰지 않으면 한쪽만 원문을 계속 보여주게 된다.
describe('ChannelList — 마지막 메시지 미리보기', () => {
    const renderRow = () =>
        render(
            <ChannelList
                channels={[makeChannel({ name: '개발방', ownerId: 'me' })]}
                unreadByChannel={{}}
                sid="s1"
                isLoading={false}
            />
        );

    afterEach(() => {
        mockLastChat = null;
    });

    it('평범한 마지막 메시지는 본문을 그대로 미리보기로 쓴다', () => {
        mockLastChat = { content: '안녕하세요', createdAt: 1 };
        renderRow();
        expect(screen.getByText('안녕하세요')).toBeInTheDocument();
    });

    // ADR-0055 — 한 줄 행에는 코드블럭을 그릴 자리가 없다. 렌더가 아니라 평문화다.
    it('인라인 백틱은 벗겨서 보여준다', () => {
        mockLastChat = { content: '배포는 `yarn deploy` 로', createdAt: 1 };
        renderRow();
        expect(screen.getByText('배포는 yarn deploy 로')).toBeInTheDocument();
    });

    it('펜스 블록은 첫 줄만 보여준다', () => {
        mockLastChat = { content: '```ts\nconst x = 1;\nconst y = 2;\n```', createdAt: 1 };
        renderRow();
        expect(screen.getByText('const x = 1;')).toBeInTheDocument();
    });

    it('마지막 메시지가 tombstone이면 삭제 문구를 쓰고 원문을 노출하지 않는다', () => {
        mockLastChat = { content: '지워진 원문', createdAt: 1, hidden: true };
        renderRow();

        expect(screen.getByText('chat.room.deletedMessage')).toBeInTheDocument();
        expect(screen.queryByText('지워진 원문')).not.toBeInTheDocument();
    });

    // preview와 time이 둘 다 같은 lastChat에서 나오므로 "옛 본문 + 새 시각"이 생길 수 없다.
    it('tombstone이어도 그 행의 시각은 그대로 살아 있다', () => {
        mockLastChat = { content: '지워진 원문', createdAt: 1750000000000, hidden: true };
        renderRow();

        // 시각은 로케일 포맷이라 문자열을 고정하지 않고 숫자가 찍혔는지로 본다.
        expect(screen.getByTestId('row-trailing').textContent).toMatch(/\d/);
    });
});
