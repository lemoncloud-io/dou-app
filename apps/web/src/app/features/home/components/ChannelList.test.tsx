import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import { ChannelList } from './ChannelList';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'ko' } }) }));
// Partial mock: the rest is left real. The `@chatic/app-runtime` barrel reaches all the way to
// `createQueryKeys` at import time, so swapping out the whole module would make that disappear.
jest.mock('@chatic/shared', () => ({
    ...jest.requireActual('@chatic/shared'),
    useNavigateWithTransition: () => jest.fn(),
}));
// `channel.get` is rejected with 403 for someone else's self-chat — we need to see which id it registers under.
const mockUseChannelSync = jest.fn();
jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        sync: {
            useChannelSync: (...args: unknown[]) => mockUseChannelSync(...args),
        },
        session: {
            useSessionIdentity: () => ({ userId: 'me' }),
        },
    },
}));
// My user id drives the owner-vs-member title branch; 'me' owns channels tagged ownerId: 'me'.

// The rows' preview source — the list-level combined lookup (ADR-0057). Null by default (rows
// under test have no messages); the preview cases below seed it for EVERY row. Preview picking
// itself is covered by chatPreview.test.ts (libs/data) and useLastChats.test.ts.
let mockLastChat: any = null;
// Per-channel override, for the ordering cases — the list sorts by these same times (ADR-0055 decision 2).
let mockLastChatByChannel: Map<string, any> | null = null;
jest.mock('../../../hooks/useLastChats', () => ({
    useLastChats: () => ({
        get: (channelId: string) => mockLastChatByChannel?.get(channelId) ?? mockLastChat ?? undefined,
    }),
}));

// My profile nick is the self-chat title fallback and my photo is the self-chat row avatar
// (both resolved once by ChannelList). resolveSelfChatTitle / resolveChannelAvatar are the real
// pure fns (unit-tested separately).
jest.mock('../../../hooks', () => ({
    ...jest.requireActual('../../../hooks'),
    useMyProfile: () => ({ profile: { nick: 'MY_NICK', thumbnail: 'my-photo.png' } }),
    useBlurLastMessage: () => ({ blurLastMessage: false }),
}));

// The list-level DM peer lookup (one profile subscription for every DM row) is covered by
// useDmPeers.test.ts; here we inject its result so rows can be driven without the runtime.
const mockDmPeers = new Map<string, { id: string; profileNick?: string; thumbnail?: string }>();
jest.mock('../../channels/hooks', () => ({ useDmPeers: () => mockDmPeers }));

jest.mock('@chatic/ui-kit/components/ui/dropdown-menu', () => ({
    DropdownMenu: ({ children }: any) => <div>{children}</div>,
    DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
    DropdownMenuItem: ({ children, onClick }: any) => <div onClick={onClick}>{children}</div>,
    DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@chatic/web-ui-kit', () => ({
    Badge: ({ children }: any) => <span>{children}</span>,
    CollapsibleSection: ({ actions, children, count }: any) => (
        // `count` is surfaced as an attribute, not text: the rows under test already render bare
        // numbers (member counts, unread badges), so a text node would collide with them.
        <section data-count={count ?? ''}>
            {actions}
            {children}
        </section>
    ),
    DefaultAvatar: ({ variant }: any) => <div data-testid="default-avatar" data-variant={variant} />,
    IconChatAdd: () => <i />,
    IconPin: ({ role, 'aria-label': label }: any) => <i role={role} aria-label={label} />,
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
    SubscriptionBadge: ({ tier }: any) => <span data-testid="tier-badge">{tier}</span>,
    StatusBadge: ({ label }: any) => <span data-testid="status-badge">{label}</span>,
    UnreadBadge: ({ count }: any) => <span data-testid="unread">{count}</span>,
}));

const makeChannel = (over: any) => ({ id: 'c1', name: '', stereo: 'group', memberNo: 3, ...over });

/**
 * Path seen in a production alert:
 *   403 NOT ALLOWED - denied by policy (channel.get)  body: {"type":"channel.get","data":{"id":"U:1000030"}}
 *
 * `U:1000030` is guest 1000030's self-chat. Since a guest→social-login promotion only swaps the uid,
 * this list can go on holding a stale account's row for one render, and that row re-registers its
 * own channel target. The tag belongs to the new account, so SyncManager's scope guard can't catch
 * it — it's the id side that's stale.
 */
describe('ChannelList — 남의 셀프챗 행은 channel.get을 등록하지 않는다', () => {
    it('ownerId가 내가 아닌 self 행은 동기화 대상에서 빠진다', () => {
        render(
            <ChannelList
                channels={[makeChannel({ id: 'U:1000030', stereo: 'self', ownerId: '1000030', memberNo: 1 })]}
                isLoading={false}
            />
        );

        expect(mockUseChannelSync).toHaveBeenCalledWith(undefined);
        expect(mockUseChannelSync).not.toHaveBeenCalledWith('U:1000030');
    });

    it('내 셀프챗은 그대로 등록한다 — 가드가 과하게 막지 않는지', () => {
        render(
            <ChannelList
                channels={[makeChannel({ id: 'U:me', stereo: 'self', ownerId: 'me', memberNo: 1 })]}
                isLoading={false}
            />
        );

        expect(mockUseChannelSync).toHaveBeenCalledWith('U:me');
    });

    // Blocking even rows the server didn't attach an ownerId to would leave a perfectly fine room silently un-synced.
    it('ownerId를 모르면 막지 않는다', () => {
        render(
            <ChannelList channels={[makeChannel({ id: 'U:1000030', stereo: 'self', memberNo: 1 })]} isLoading={false} />
        );

        expect(mockUseChannelSync).toHaveBeenCalledWith('U:1000030');
    });
});

describe('ChannelList self-chat row', () => {
    it('stereo=self 행은 커스텀 nick($join.nick)을 제목으로, MY 배지를 노출한다', () => {
        render(
            <ChannelList
                channels={[
                    makeChannel({ id: 'self1', stereo: 'self', memberNo: 1, name: '', $join: { nick: '내 메모장' } }),
                ]}
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
                isLoading={false}
            />
        );

        expect(screen.getByText('MY_NICK')).toBeInTheDocument();
    });

    it('채널 목록을 마지막 메시지 시각 최신순으로 정렬한다', () => {
        // My read cursor (join.updatedAt) is more recent for a, but ordering looks only at message time.
        mockLastChatByChannel = new Map([
            ['a', { content: 'a의 마지막', createdAtMs: 100 }],
            ['b', { content: 'b의 마지막', createdAtMs: 200 }],
        ]);
        render(
            <ChannelList
                channels={[
                    makeChannel({ id: 'a', stereo: 'group', memberNo: 1, name: 'A방' }),
                    makeChannel({ id: 'b', stereo: 'group', memberNo: 1, name: 'B방' }),
                ]}
                joinByChannel={
                    new Map([
                        ['a', { updatedAt: 900 } as any],
                        ['b', { updatedAt: 100 } as any],
                    ])
                }
                isLoading={false}
            />
        );

        const titles = screen.getAllByTestId('row-title').map(el => el.textContent);
        expect(titles).toEqual(['B방', 'A방']); // b(last message 200) before a(100)
        mockLastChatByChannel = null;
    });

    it('unread 뱃지는 channel과 join 스트림만으로 계산된다', () => {
        render(
            <ChannelList
                channels={[makeChannel({ id: 'u1', stereo: 'group', name: '알림방', chatNo: 10, metaNo: 2 })]}
                joinByChannel={new Map([['u1', { readNo: 4, metaNo: 1 } as any]])}
                isLoading={false}
            />
        );

        expect(screen.getByTestId('unread')).toHaveTextContent('5');
    });

    it('그룹 행은 channel.name을 제목으로 쓰고 MY 배지가 없다', () => {
        render(
            <ChannelList
                channels={[makeChannel({ id: 'g1', stereo: 'group', memberNo: 3, name: '스터디방', ownerId: 'other' })]}
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
                isLoading={false}
            />
        );

        expect(screen.getByText('공지방')).toBeInTheDocument();
    });
});

// ADR-0039: a DM row shows the person, not the channel. Name, avatar, and member count all follow from that.
describe('ChannelList — 1:1(DM) 행', () => {
    // `cid` carries the lineage — the relay cloud vs a subscription one (ADR-0111). Not `sid`:
    // the server overwrites that, and it says where a room's creator stood, not which cloud it is in.
    const dmChannel = (over: any = {}) =>
        makeChannel({
            id: 'dm1',
            stereo: 'dm',
            memberNo: 2,
            name: '',
            ownerId: 'me',
            cid: 'default',
            sid: 'S:relay',
            ...over,
        });

    beforeEach(() => mockDmPeers.clear());

    it('상대 프로필 닉을 제목으로 쓴다', () => {
        mockDmPeers.set('dm1', { id: 'peer', profileNick: '토끼' });

        render(<ChannelList channels={[dmChannel()]} isLoading={false} />);

        expect(screen.getByText('토끼')).toBeInTheDocument();
    });

    it('내가 오너여도 channel.name이 아니라 상대 닉을 쓴다', () => {
        mockDmPeers.set('dm1', { id: 'peer', profileNick: '토끼' });

        render(<ChannelList channels={[dmChannel({ name: '서버 이름' })]} isLoading={false} />);

        expect(screen.getByText('토끼')).toBeInTheDocument();
        expect(screen.queryByText('서버 이름')).not.toBeInTheDocument();
    });

    it('내 join.nick이 있으면 상대 닉을 이긴다', () => {
        mockDmPeers.set('dm1', { id: 'peer', profileNick: '토끼' });

        render(
            <ChannelList
                channels={[dmChannel()]}
                joinByChannel={new Map([['dm1', { nick: '토끼친구' } as any]])}
                isLoading={false}
            />
        );

        expect(screen.getByText('토끼친구')).toBeInTheDocument();
    });

    it('상대 프로필이 없으면 DM 전용 라벨로 떨어진다', () => {
        mockDmPeers.set('dm1', { id: 'peer' });

        render(<ChannelList channels={[dmChannel()]} isLoading={false} />);

        expect(screen.getByText('chat.dm.unnamedPeer')).toBeInTheDocument();
    });

    it('아바타로 상대 thumbnail을 쓴다 (채널 thumbnail은 무시)', () => {
        mockDmPeers.set('dm1', { id: 'peer', profileNick: '토끼', thumbnail: 'peer.png' });

        render(<ChannelList channels={[dmChannel({ thumbnail: 'channel.png' })]} isLoading={false} />);

        expect(screen.getByTestId('image-avatar')).toHaveAttribute('src', 'peer.png');
    });

    it('상대 thumbnail이 없으면 기본 아바타를 쓴다', () => {
        mockDmPeers.set('dm1', { id: 'peer', profileNick: '토끼' });

        render(<ChannelList channels={[dmChannel()]} isLoading={false} />);

        expect(screen.getByTestId('default-avatar')).toBeInTheDocument();
    });

    it('인원수 pill을 숨긴다 (그룹 행에는 남아 있다)', () => {
        mockDmPeers.set('dm1', { id: 'peer', profileNick: '토끼' });

        render(
            <ChannelList
                channels={[dmChannel(), makeChannel({ id: 'g1', stereo: 'group', name: '공지방', memberNo: 5 })]}
                isLoading={false}
            />
        );

        expect(screen.queryByText('2')).not.toBeInTheDocument();
        expect(screen.getByText('5')).toBeInTheDocument();
    });
});

describe('ChannelList — 초대 행 (ADR-0089 Track B)', () => {
    it('sentInvites의 각 항목을 채널 위에 행으로 보여준다', () => {
        render(
            <ChannelList
                channels={[makeChannel({ id: 'g1', stereo: 'group', name: '공지방', ownerId: 'other' })]}
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
                isLoading={false}
                sentInvites={[{ id: 'invite-1', state: 'pending', name: '홍길동' } as any]}
            />
        );

        expect(screen.queryByText('channelList.empty')).not.toBeInTheDocument();
    });

    it('채널도 초대도 없으면 기존처럼 채널 없음 문구를 보여준다', () => {
        render(<ChannelList channels={[]} isLoading={false} />);

        expect(screen.getByText('channelList.empty')).toBeInTheDocument();
    });
});

describe('ChannelList 아바타', () => {
    it('self 행은 내 플레이스 프로필 사진을 쓴다', () => {
        render(
            <ChannelList
                channels={[makeChannel({ id: 'self1', stereo: 'self', memberNo: 1, name: '' })]}
                isLoading={false}
            />
        );

        expect(screen.getByTestId('image-avatar')).toHaveAttribute('src', 'my-photo.png');
    });

    it('self 행은 channel.thumbnail이 있어도 내 프로필 사진을 쓴다', () => {
        render(
            <ChannelList
                channels={[makeChannel({ id: 'self1', stereo: 'self', memberNo: 1, name: '', thumbnail: 'room.png' })]}
                isLoading={false}
            />
        );

        expect(screen.getByTestId('image-avatar')).toHaveAttribute('src', 'my-photo.png');
    });

    it('그룹 행은 내 프로필 사진이 아니라 channel.thumbnail을 쓴다', () => {
        render(
            <ChannelList
                channels={[makeChannel({ id: 'g1', stereo: 'group', name: '스터디방', thumbnail: 'room.png' })]}
                isLoading={false}
            />
        );

        expect(screen.getByTestId('image-avatar')).toHaveAttribute('src', 'room.png');
    });

    it('사진 없는 그룹 행은 2인 글리프를 쓴다 (1인 기본값이 아니라 — Figma 3164-12515)', () => {
        render(
            <ChannelList channels={[makeChannel({ id: 'g1', stereo: 'group', name: '스터디방' })]} isLoading={false} />
        );

        expect(screen.getByTestId('default-avatar')).toHaveAttribute('data-variant', 'group');
    });

    it('사진 없는 dm 행은 1인 글리프를 쓴다', () => {
        render(
            <ChannelList
                channels={[makeChannel({ id: 'd1', stereo: 'dm', memberNo: 2, name: '' })]}
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

// ADR-0047 decision 6 — a message deleted by another client (desktop) arrives as a hidden row.
// If the room and home don't use the same wording, one of them will keep showing the original text.
describe('ChannelList — 마지막 메시지 미리보기', () => {
    const renderRow = () =>
        render(<ChannelList channels={[makeChannel({ name: '개발방', ownerId: 'me' })]} sid="s1" isLoading={false} />);

    afterEach(() => {
        mockLastChat = null;
        mockLastChatByChannel = null;
    });

    it('평범한 마지막 메시지는 본문을 그대로 미리보기로 쓴다', () => {
        mockLastChat = { content: '안녕하세요', createdAt: 1 };
        renderRow();
        expect(screen.getByText('안녕하세요')).toBeInTheDocument();
    });

    // ADR-0055 — a single-line row has no room to render a code block. It's flattened to plain text, not rendered.
    it('인라인 백틱은 벗겨서 보여준다', () => {
        mockLastChat = { content: '배포는 `yarn deploy` 로', createdAt: 1 };
        renderRow();
        expect(screen.getByText('배포는 yarn deploy 로')).toBeInTheDocument();
    });

    // A webhook message's body is a Block Kit payload. Without collapsing it, the home row would show `{"blocks":[…`.
    it('Block Kit 본문은 한 줄 요약으로 접는다', () => {
        mockLastChat = {
            content: JSON.stringify({
                blocks: [
                    { type: 'header', text: { type: 'plain_text', text: '배포 실패' } },
                    { type: 'section', text: { type: 'mrkdwn', text: '*503* upstream timeout' } },
                ],
            }),
            createdAt: 1,
        };
        renderRow();
        expect(screen.getByText('배포 실패 503 upstream timeout')).toBeInTheDocument();
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

    // Since both preview and time come from the same lastChat, an "old body + new time" combination can't happen.
    it('tombstone이어도 그 행의 시각은 그대로 살아 있다', () => {
        mockLastChat = { content: '지워진 원문', createdAt: 1750000000000, hidden: true };
        renderRow();

        // The time is locale-formatted, so instead of pinning the exact string, we just check that a digit appears.
        expect(screen.getByTestId('row-trailing').textContent).toMatch(/\d/);
    });
});

// The create popover (Chat section ＋) — on relay, "1:1 대화" is the real action and "그룹 방 만들기" is
// layered on only as an upsell for non-subscribers (Figma 2870:20387). What each tap does belongs to
// the host (HomePage), so this only covers the delegation.
describe('ChannelList 생성 메뉴', () => {
    const renderMenu = (props: any) =>
        render(<ChannelList channels={[]} sid="site-1" isLoading={false} canCreate {...props} />);

    it('중계 + 미구독이면 1:1 대화와 그룹 방 만들기를 함께 보이고 그룹 쪽에 PRO 뱃지를 붙인다', () => {
        renderMenu({ isDefaultCloud: true, isPro: false, showOneOnOneCreate: true });

        expect(screen.getByText('channelList.createDirect')).toBeInTheDocument();
        expect(screen.getByText('channelList.createGroup')).toBeInTheDocument();
        expect(screen.getByTestId('tier-badge')).toHaveTextContent('pro');
    });

    it('중계 + 구독이면 그룹 방 만들기를 감춘다 — 그룹 방은 내 클라우드에서 만든다', () => {
        renderMenu({ isDefaultCloud: true, isPro: true, showOneOnOneCreate: true });

        expect(screen.getByText('channelList.createDirect')).toBeInTheDocument();
        expect(screen.queryByText('channelList.createGroup')).not.toBeInTheDocument();
    });

    it('중계의 그룹 방 만들기 탭은 호스트의 onCreateGroup으로 넘긴다', () => {
        const onCreateGroup = jest.fn();
        renderMenu({ isDefaultCloud: true, isPro: false, onCreateGroup });
        fireEvent.click(screen.getByText('channelList.createGroup'));

        expect(onCreateGroup).toHaveBeenCalledTimes(1);
    });

    it('클라우드에서도 요청받으면 1:1 대화를 보이고, 미구독이면 그룹 쪽에 뱃지가 붙는다', () => {
        renderMenu({ isDefaultCloud: false, isPro: false, showOneOnOneCreate: true });

        expect(screen.getByText('channelList.createDirect')).toBeInTheDocument();
        expect(screen.getByText('channelList.createGroup')).toBeInTheDocument();
        expect(screen.getByTestId('tier-badge')).toBeInTheDocument();
    });

    // The two used to be one flag. Splitting them is only worth anything if neither moves the
    // other, so both directions are pinned here (ADR-0111).
    it('1:1 표시 조건은 그룹 업셀 규칙을 건드리지 않는다', () => {
        renderMenu({ isDefaultCloud: true, isPro: true, showOneOnOneCreate: false });

        // Relay + subscribed still hides the group entry, with the 1:1 entry withheld.
        expect(screen.queryByText('channelList.createDirect')).not.toBeInTheDocument();
        expect(screen.queryByText('channelList.createGroup')).not.toBeInTheDocument();
    });

    it('1:1 표시를 켜도 그룹 업셀 뱃지 규칙은 그대로다', () => {
        renderMenu({ isDefaultCloud: true, isPro: false, showOneOnOneCreate: true });

        expect(screen.getByTestId('tier-badge')).toHaveTextContent('pro');
    });

    it('구독한 클라우드에선 뱃지 없이 그룹 방 만들기만 보인다', () => {
        renderMenu({ isDefaultCloud: false, isPro: true });

        expect(screen.getByText('channelList.createGroup')).toBeInTheDocument();
        expect(screen.queryByTestId('tier-badge')).not.toBeInTheDocument();
    });

    it('둘 다 아니면 생성 메뉴 자체가 없다', () => {
        renderMenu({ canCreate: false, isDefaultCloud: true, isPro: false, showOneOnOneCreate: false });

        expect(screen.queryByText('channelList.createDirect')).not.toBeInTheDocument();
        expect(screen.queryByText('channelList.createGroup')).not.toBeInTheDocument();
    });

    // An invited member cannot make a room here and CAN talk to the people already beside them.
    // `canCreate` used to close the popover outright, which took the second one with the first.
    it('방을 못 만드는 멤버에게도 1:1만 남겨 메뉴를 연다', () => {
        renderMenu({ canCreate: false, isDefaultCloud: false, isPro: true, showOneOnOneCreate: true });

        expect(screen.getByText('channelList.createDirect')).toBeInTheDocument();
        expect(screen.queryByText('channelList.createGroup')).not.toBeInTheDocument();
    });

    // The negative form (`!isDefaultCloud || !isPro`) reads true for every non-relay cloud, so
    // without `canCreate` guarding it the invited member would be offered exactly what they cannot do.
    it('초대받은 클라우드에서 그룹 생성이 새어 나오지 않는다', () => {
        renderMenu({ canCreate: false, isDefaultCloud: false, isPro: false, showOneOnOneCreate: true });

        expect(screen.queryByText('channelList.createGroup')).not.toBeInTheDocument();
        expect(screen.queryByTestId('tier-badge')).not.toBeInTheDocument();
    });
});

describe('ChannelList 빈 상태 / 로딩', () => {
    it('초대받은 플레이스에서 채널이 없으면 초대 안내와 플레이스 정보 링크를 보여준다', () => {
        const onOpenPlaceInfo = jest.fn();
        render(<ChannelList channels={[]} isLoading={false} isInvitedPlace onOpenPlaceInfo={onOpenPlaceInfo} />);

        expect(screen.getByText('channelList.emptyInvited')).toBeInTheDocument();
        // The create-oriented copy would be a dead end here: an invited member cannot make a room.
        expect(screen.queryByText('channelList.empty')).not.toBeInTheDocument();

        fireEvent.click(screen.getByText('channelList.emptyInvitedPlaceInfo'));
        expect(onOpenPlaceInfo).toHaveBeenCalledTimes(1);
    });

    it('로딩 중에는 스켈레톤을 status로 알리고 개수는 감춘다', () => {
        const { container } = render(<ChannelList channels={[]} isLoading />);

        expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'channelList.loading');
        // "0" next to a skeleton asserts an answer that has not arrived yet.
        expect(container.querySelector('section')).toHaveAttribute('data-count', '');
        expect(screen.queryByText('channelList.empty')).not.toBeInTheDocument();
        expect(screen.queryByText('channelList.emptyInvited')).not.toBeInTheDocument();
    });

    it('로딩이 끝나면 실제 개수를 보여준다', () => {
        const { container } = render(<ChannelList channels={[makeChannel({ id: 'c1' })]} isLoading={false} />);

        expect(container.querySelector('section')).toHaveAttribute('data-count', '1');
    });
});
