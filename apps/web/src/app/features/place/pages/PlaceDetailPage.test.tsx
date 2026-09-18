import '@testing-library/jest-dom';

import { render, screen } from '@testing-library/react';

import type { DomainProfile } from '@chatic/data';
import type { MySiteView } from '@lemoncloud/chatic-backend-api';

let mockPlace: Partial<MySiteView> | null = null;
let mockOwner: Partial<DomainProfile> | null = null;
let mockCloudId: string | null = 'default';
const observeItem = jest.fn();

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'ko' } }),
}));
jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: () => ({ place: { observeItem } }),
        },
        session: {
            useSessionSelection: () => ({ selectedCloudId: mockCloudId }),
        },
    },
}));
// The page deliberately does NOT read the session — the URL's place decides everything. The mock
// stays wired so that if it ever starts reading `selectedCloudId` again, the two regression tests at
// the end of the cloud block fail instead of passing silently.

jest.mock('react-router-dom', () => ({ useParams: () => ({ placeId: 'p1' }) }));
// The real `ui` barrel pulls `@chatic/assets` through PrivateLayout, which jest cannot parse.
jest.mock('../../../ui', () => ({ PageHeader: ({ title }: { title: string }) => <div>header:{title}</div> }));
// The owner lookup has its own gate (usePlaceOwnerProfile.test.ts); here only its RESULT matters.
jest.mock('../hooks/usePlaceOwnerProfile', () => ({ usePlaceOwnerProfile: () => mockOwner }));

import { PlaceDetailPage } from './PlaceDetailPage';

// 2026-08-07T00:00:00Z — the exact value only matters for the format assertion.
const CREATED_AT = Date.UTC(2026, 7, 7);

beforeEach(() => {
    jest.clearAllMocks();
    mockPlace = null;
    mockOwner = null;
    mockCloudId = 'default';
    // observeItem emits synchronously, the way the local data source does for a warm cache.
    observeItem.mockImplementation((_id: string, cb: (item: unknown) => void) => {
        cb(mockPlace);
        return jest.fn();
    });
});

describe('PlaceDetailPage — 클라우드 플레이스', () => {
    beforeEach(() => {
        mockCloudId = 'cloud-a';
    });

    it('오너에게는 "플레이스 이름" 라벨을 쓴다', () => {
        mockPlace = { id: '10014', name: '우리 플레이스', isOwner: true, ownerId: 'u1', createdAt: CREATED_AT };
        render(<PlaceDetailPage />);

        expect(screen.getByText('placeDetail.nameLabel')).toBeInTheDocument();
        expect(screen.queryByText('placeDetail.invitedNameLabel')).not.toBeInTheDocument();
        expect(screen.getByText('우리 플레이스')).toBeInTheDocument();
    });

    it('비오너에게는 "초대된 플레이스 이름" 라벨을 쓴다', () => {
        mockPlace = { id: '10014', name: '우리 플레이스', isOwner: false, ownerId: 'u1', createdAt: CREATED_AT };
        render(<PlaceDetailPage />);

        expect(screen.getByText('placeDetail.invitedNameLabel')).toBeInTheDocument();
        expect(screen.queryByText('placeDetail.nameLabel')).not.toBeInTheDocument();
    });

    // A missing isOwner reads as falsy (= non-owner) — the same verdict the settings hub makes
    // (`!!place.isOwner`).
    it('isOwner가 없으면 비오너로 읽는다', () => {
        mockPlace = { id: '10014', name: '우리 플레이스', ownerId: 'u1' };
        render(<PlaceDetailPage />);

        expect(screen.getByText('placeDetail.invitedNameLabel')).toBeInTheDocument();
    });

    it('ownerId가 있으면 방장 뱃지와 소유자 닉을 보여준다', () => {
        mockPlace = { id: '10014', name: '우리 플레이스', isOwner: false, ownerId: 'u1' };
        mockOwner = { nick: '두유' };
        render(<PlaceDetailPage />);

        expect(screen.getByText('placeDetail.ownerLabel')).toBeInTheDocument();
        expect(screen.getByText('chat.settings.badge.owner')).toBeInTheDocument();
        expect(screen.getByText('두유')).toBeInTheDocument();
    });

    // The owner profile can arrive later than the name and date. The section still holds its place in
    // the meantime.
    it('소유자 프로필이 아직 없어도 소유자 섹션은 남는다', () => {
        mockPlace = { id: '10014', name: '우리 플레이스', ownerId: 'u1' };
        mockOwner = null;
        render(<PlaceDetailPage />);

        expect(screen.getByText('placeDetail.ownerLabel')).toBeInTheDocument();
        expect(screen.getByText('chat.settings.badge.owner')).toBeInTheDocument();
    });

    it('썸네일이 있으면 그 사진을 아바타로 쓴다', () => {
        mockPlace = { id: '10014', name: '우리 플레이스', ownerId: 'u1', thumbnail: 'data:image/png;base64,AAA' };
        const { container } = render(<PlaceDetailPage />);

        expect(container.querySelector('img[src="data:image/png;base64,AAA"]')).toBeInTheDocument();
    });

    it('만든 날짜를 zero-padding된 로케일 형식으로 보여준다', () => {
        mockPlace = { id: '10014', name: '우리 플레이스', ownerId: 'u1', createdAt: CREATED_AT };
        render(<PlaceDetailPage />);

        expect(screen.getByText('placeDetail.createdAtLabel')).toBeInTheDocument();
        expect(screen.getByText(/^\d{4}\. \d{2}\. \d{2}\.?$/)).toBeInTheDocument();
    });

    it('createdAt이 없으면 날짜 행을 그리지 않는다', () => {
        mockPlace = { id: '10014', name: '우리 플레이스', ownerId: 'u1' };
        render(<PlaceDetailPage />);

        expect(screen.queryByText('placeDetail.createdAtLabel')).not.toBeInTheDocument();
    });

    it('소개 문구가 있으면 그 행을 보여준다', () => {
        mockPlace = { id: '10014', name: '우리 플레이스', ownerId: 'u1', desc: '개발자들이 모이는 곳' };
        render(<PlaceDetailPage />);

        expect(screen.getByText('placeDetail.descLabel')).toBeInTheDocument();
        expect(screen.getByText('개발자들이 모이는 곳')).toBeInTheDocument();
    });

    it('desc가 없으면 소개 행을 그리지 않는다', () => {
        mockPlace = { id: '10014', name: '우리 플레이스', ownerId: 'u1' };
        render(<PlaceDetailPage />);

        expect(screen.queryByText('placeDetail.descLabel')).not.toBeInTheDocument();
    });

    // Clearing the introduction makes the server return ''. An empty string is treated the same as
    // "no value" and the row is dropped — rendering an empty row with just a label would break the
    // rule the created-date and owner rows already follow.
    it('desc가 빈 문자열이면 소개 행을 그리지 않는다', () => {
        mockPlace = { id: '10014', name: '우리 플레이스', ownerId: 'u1', desc: '' };
        render(<PlaceDetailPage />);

        expect(screen.queryByText('placeDetail.descLabel')).not.toBeInTheDocument();
    });

    it('줄바꿈이 들어간 소개 문구도 그대로 보존한다', () => {
        mockPlace = { id: '10014', name: '우리 플레이스', ownerId: 'u1', desc: '첫 줄\n둘째 줄' };
        const { container } = render(<PlaceDetailPage />);

        expect(container.querySelector('.whitespace-pre-wrap')).toHaveTextContent('첫 줄');
    });

    // Regression guard: the display name's source of truth is the place in the URL, not the active
    // session. Since resolvePlaceDisplayName ORs isDefaultCloud with the id, passing the session's
    // `selectedCloudId === 'default'` would brand even a cloud place opened directly by URL as "DoU
    // Home" while the relay is active.
    it('relay가 활성이어도 클라우드 플레이스는 자기 이름을 유지한다', () => {
        mockCloudId = 'default';
        mockPlace = { id: '10014', name: '우리 플레이스', ownerId: 'u1' };
        render(<PlaceDetailPage />);

        expect(screen.getByText('우리 플레이스')).toBeInTheDocument();
        expect(screen.queryByText('placeList.defaultPlace')).not.toBeInTheDocument();
    });

    it('relay가 활성이어도 클라우드 플레이스는 풍경 기본 아바타를 쓴다', () => {
        mockCloudId = 'default';
        mockPlace = { id: '10014', name: '우리 플레이스', ownerId: 'u1' };
        const { container } = render(<PlaceDetailPage />);

        expect(container.querySelector('.bg-brand-ink')).toBeInTheDocument();
        expect(container.querySelector('.bg-avatar-ring')).not.toBeInTheDocument();
    });
});

describe('PlaceDetailPage — DoU홈(relay 기본플레이스)', () => {
    // Observed: the relay's default place is a stereo:'domain' system site, so ownerId, owner$,
    // isOwner and thumbnail are all absent and name is "default", which gets branded. createdAt does
    // arrive, but per a product decision (Figma 3769-34207 variant) this screen doesn't render the
    // created-date or owner info at all.
    const RELAY_PLACE: Partial<MySiteView> = { id: '0000', name: 'default', createdAt: CREATED_AT };

    // The relay server only ever has this one default place, so it's not "a place I was invited
    // into" — it uses the owner label ("Place name") even though isOwner is always absent. This is an
    // explicit exception, not a side effect of the missing field.
    it('isOwner가 없어도 "플레이스 이름" 라벨을 쓴다', () => {
        mockPlace = RELAY_PLACE;
        render(<PlaceDetailPage />);

        expect(screen.getByText('placeDetail.nameLabel')).toBeInTheDocument();
        expect(screen.queryByText('placeDetail.invitedNameLabel')).not.toBeInTheDocument();
    });

    it('소유자 섹션을 그리지 않는다', () => {
        mockPlace = RELAY_PLACE;
        render(<PlaceDetailPage />);

        expect(screen.queryByText('placeDetail.ownerLabel')).not.toBeInTheDocument();
        expect(screen.queryByText('chat.settings.badge.owner')).not.toBeInTheDocument();
    });

    // Even if ownerId were sent along (hypothetically), the owner section still wouldn't show — an
    // explicit exception, not a side effect of the missing field.
    it('ownerId가 있어도 소유자 섹션을 그리지 않는다', () => {
        mockPlace = { ...RELAY_PLACE, ownerId: 'u1' };
        mockOwner = { nick: '두유' };
        render(<PlaceDetailPage />);

        expect(screen.queryByText('placeDetail.ownerLabel')).not.toBeInTheDocument();
    });

    it('백엔드 원본 이름 "default"를 노출하지 않고 브랜딩한다', () => {
        mockPlace = RELAY_PLACE;
        render(<PlaceDetailPage />);

        expect(screen.queryByText('default')).not.toBeInTheDocument();
        expect(screen.getByText('placeList.defaultPlace')).toBeInTheDocument();
    });

    it('DoU 캐릭터를 밝은 원반 위에 올린 기본 아바타를 쓴다', () => {
        mockPlace = RELAY_PLACE;
        const { container } = render(<PlaceDetailPage />);

        expect(container.querySelector('.bg-avatar-ring')).toBeInTheDocument();
        expect(container.querySelector('.bg-brand-ink')).not.toBeInTheDocument();
    });

    // Regression guard: even though createdAt actually exists (it's set on RELAY_PLACE), it isn't
    // rendered — that's a product decision, not a missing-data effect.
    it('만든 날짜가 서버에 있어도 렌더하지 않는다', () => {
        mockPlace = RELAY_PLACE;
        render(<PlaceDetailPage />);

        expect(screen.queryByText('placeDetail.createdAtLabel')).not.toBeInTheDocument();
    });

    // Regression guard: unlike the created-date and owner rows, the introduction text is not excluded
    // for the relay (ADR-0074). If the isHomePlace branch that hides those two rows is mistakenly
    // applied to the introduction row too, this test breaks.
    it('소개 문구는 DoU홈에서도 렌더한다', () => {
        mockPlace = { ...RELAY_PLACE, desc: '두유 홈입니다' };
        render(<PlaceDetailPage />);

        expect(screen.getByText('placeDetail.descLabel')).toBeInTheDocument();
        expect(screen.getByText('두유 홈입니다')).toBeInTheDocument();
    });
});

describe('PlaceDetailPage — 플레이스 없음', () => {
    it('행이 없으면 안내 문구만 보여준다', () => {
        mockPlace = null;
        render(<PlaceDetailPage />);

        expect(screen.getByText('placeDetail.notFound')).toBeInTheDocument();
        expect(screen.queryByText('placeDetail.nameLabel')).not.toBeInTheDocument();
        expect(screen.queryByText('placeDetail.invitedNameLabel')).not.toBeInTheDocument();
    });
});
