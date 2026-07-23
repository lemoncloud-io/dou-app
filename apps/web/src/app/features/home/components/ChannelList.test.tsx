import '@testing-library/jest-dom';

import { render, screen } from '@testing-library/react';

import { ChannelList } from './ChannelList';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'ko' } }) }));
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => jest.fn() }));
jest.mock('@chatic/app-runtime', () => ({ useChannelSync: () => undefined }));
// My user id drives the owner-vs-member title branch; 'me' owns channels tagged ownerId: 'me'.
jest.mock('@chatic/web-core', () => ({ useSessionIdentity: () => ({ userId: 'me' }) }));
jest.mock('../../../stores/usePreferenceStore', () => ({ usePreferenceStore: () => false }));
jest.mock('../hooks/useLastChat', () => ({ useLastChat: () => null }));

// My profile nick is the self-chat title fallback (resolved once by ChannelList).
// resolveSelfChatTitle is the real pure fn (unit-tested separately).
jest.mock('../../../hooks', () => ({ useMyProfile: () => ({ profile: { nick: 'MY_NICK' } }) }));

jest.mock('@chatic/ui-kit/components/ui/dropdown-menu', () => ({
    DropdownMenu: ({ children }: any) => <div>{children}</div>,
    DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
    DropdownMenuItem: ({ children }: any) => <div>{children}</div>,
    DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@chatic/web-ui-kit', () => ({
    Badge: ({ children }: any) => <span>{children}</span>,
    CollapsibleSection: ({ children }: any) => <section>{children}</section>,
    DefaultAvatar: () => <div data-testid="default-avatar" />,
    IconBolt: () => <i />,
    IconPlus: () => <i />,
    ImageAvatar: () => <img alt="" />,
    ListRow: ({ title, subtitle }: any) => (
        <div>
            <div data-testid="row-title">{title}</div>
            <div>{subtitle}</div>
        </div>
    ),
    PlanBadge: () => <span>PRO</span>,
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
