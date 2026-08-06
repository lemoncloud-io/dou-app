import '@testing-library/jest-dom';

import { render, screen } from '@testing-library/react';

import type { DomainProfile } from '@chatic/data';

const navigate = jest.fn();
const setMyProfile = jest.fn();
let mockProfile: Partial<DomainProfile> | null = null;
let mockAbsent: boolean | undefined = false;

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => navigate }));
jest.mock('@chatic/app-runtime', () => ({ useRuntimeRepositories: () => ({ profile: { setMyProfile } }) }));
jest.mock('../../../hooks', () => ({
    useMyProfile: () => ({ profile: mockProfile }),
    usePlaceProfileAbsent: () => ({ absent: mockAbsent, markPresent: jest.fn() }),
}));
// The real barrels pull `@chatic/assets` / `@chatic/app-runtime`, which jest cannot resolve or parse.
// The form stub surfaces the seeded values — the whole point of the gate is WHAT gets latched.
jest.mock('../../../ui', () => ({ PageHeader: ({ title }: { title: string }) => <div>header:{title}</div> }));
jest.mock('../../../ui/components/PlaceProfileForm', () => ({
    PlaceProfileForm: ({ initialNick, initialThumbnail }: { initialNick: string; initialThumbnail: string }) => (
        <div>
            <span>form</span>
            <span>seeded-nick:{initialNick}</span>
            <span>seeded-thumb:{initialThumbnail}</span>
        </div>
    ),
}));

import { PlaceProfilePage } from './PlaceProfilePage';

beforeEach(() => {
    jest.clearAllMocks();
    mockProfile = null;
    mockAbsent = false;
});

const headerOnly = () => {
    expect(screen.getByText('header:placeProfileEdit.header')).toBeInTheDocument();
    expect(screen.queryByText('form')).not.toBeInTheDocument();
};

describe('PlaceProfilePage — 렌더 게이트', () => {
    it('판정이 아직 안 났으면 헤더만 보여준다', () => {
        mockAbsent = undefined;
        render(<PlaceProfilePage />);

        headerOnly();
    });

    // 회귀 방지: absent는 getMyProfile()로 즉시 풀리지만 myProfile은 observeItem 재방출(~50ms 디바운스)로
    // 늦게 온다. 그 틈에 폼을 올리면 seededRef가 빈 값을 한 번 물고 다시 seed하지 않으므로, 프로필이 있는
    // 사용자가 자기 이름을 본 적도 없이 교체하게 된다.
    it('프로필이 있다고 판정됐지만 아직 도착하지 않았으면 폼을 올리지 않는다', () => {
        mockAbsent = false;
        mockProfile = null;
        render(<PlaceProfilePage />);

        headerOnly();
    });

    it('프로필이 도착하면 그 값으로 seed한다', () => {
        mockAbsent = false;
        mockProfile = { nick: '기존이름', thumbnail: 'data:image/png;base64,AAA' };
        render(<PlaceProfilePage />);

        expect(screen.getByText('seeded-nick:기존이름')).toBeInTheDocument();
        expect(screen.getByText('seeded-thumb:data:image/png;base64,AAA')).toBeInTheDocument();
    });

    // ADR-0041 결정 7: 프로필이 없는 사용자도 여기서 만들 수 있어야 한다. 이전에는 `!myProfile`로 막아
    // 헤더만 떠서 생성 경로가 아예 없었다.
    it('프로필이 없다고 확정되면 행이 없어도 빈 폼을 올린다', () => {
        mockAbsent = true;
        mockProfile = null;
        render(<PlaceProfilePage />);

        expect(screen.getByText('form')).toBeInTheDocument();
        expect(screen.getByText('seeded-nick:')).toBeInTheDocument();
    });
});
