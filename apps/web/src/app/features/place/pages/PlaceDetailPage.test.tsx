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
    useRuntimeRepositories: () => ({ place: { observeItem } }),
}));
// The page deliberately does NOT read the session — the URL's place decides everything. The mock
// stays wired so that if it ever starts reading `selectedCloudId` again, the two regression tests at
// the end of the cloud block fail instead of passing silently.
jest.mock('@chatic/web-core', () => ({ useSessionSelection: () => ({ selectedCloudId: mockCloudId }) }));
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

    // isOwner 부재는 falsy(=비오너)로 읽는다 — 설정 허브(`!!place.isOwner`)와 같은 판정이다.
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

    // 소유자 프로필은 이름·날짜보다 늦게 도착할 수 있다. 그 사이에도 섹션은 자리를 지킨다.
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

    // 회귀 방지: 표시 이름의 근거는 URL의 플레이스지 활성 세션이 아니다. resolvePlaceDisplayName이
    // isDefaultCloud와 id를 OR하므로, 세션의 `selectedCloudId === 'default'`를 넘기면 relay 활성 중에
    // 직접 URL로 열린 클라우드 플레이스까지 "두유 홈"으로 브랜딩된다.
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
    // 실측: relay 기본플레이스는 stereo:'domain' 시스템 사이트로 ownerId·owner$·isOwner·thumbnail이
    // 전부 없고 name은 브랜딩 대상인 "default"다. createdAt은 실제로 오지만, 기획 결정(Figma
    // 3769-34207 변형)에 따라 이 화면은 만든 날짜·소유자 정보를 아예 렌더하지 않는다.
    const RELAY_PLACE: Partial<MySiteView> = { id: '0000', name: 'default', createdAt: CREATED_AT };

    // 중계서버는 이 기본플레이스 하나뿐이라 "초대돼 들어온 곳"이 아니다 — isOwner가 항상 없어도
    // 오너 라벨("플레이스 이름")을 쓴다. 이는 필드 부재의 결과가 아니라 명시적 예외다.
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

    // ownerId가 실려 와도(가정) 소유자 섹션은 뜨지 않는다 — 필드 부재의 결과가 아니라 명시적 예외다.
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

    // 회귀 방지: createdAt이 실제로 존재해도(RELAY_PLACE에 세팅됨) 렌더하지 않는다 — 데이터 부재가
    // 아니라 기획 결정이다.
    it('만든 날짜가 서버에 있어도 렌더하지 않는다', () => {
        mockPlace = RELAY_PLACE;
        render(<PlaceDetailPage />);

        expect(screen.queryByText('placeDetail.createdAtLabel')).not.toBeInTheDocument();
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
