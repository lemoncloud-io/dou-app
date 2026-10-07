import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import type { DomainProfile } from '@chatic/data';

const navigate = jest.fn();
const setMyPlaceProfile = jest.fn();
let mockProfile: Partial<DomainProfile> | null = null;
let mockAbsent: boolean | undefined = false;

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => navigate }));
jest.mock('../../../hooks', () => ({
    useMyProfile: () => ({ profile: mockProfile }),
    usePlaceProfileAbsent: () => ({ absent: mockAbsent, markPresent: jest.fn() }),
    useSetMyPlaceProfile: () => setMyPlaceProfile,
}));
// The real barrels pull `@chatic/assets` / `@chatic/app-runtime`, which jest cannot resolve or parse.
// The form stub surfaces the seeded values — the whole point of the gate is WHAT gets latched.
jest.mock('../../../ui', () => ({ PageHeader: ({ title }: { title: string }) => <div>header:{title}</div> }));
jest.mock('../../../ui/components/PlaceProfileForm', () => ({
    PlaceProfileForm: ({
        initialNick,
        initialThumbnail,
        onSubmit,
    }: {
        initialNick: string;
        initialThumbnail: string;
        onSubmit: (value: { nick: string }) => Promise<void>;
    }) => (
        <div>
            <span>form</span>
            <button type="button" onClick={() => void onSubmit({ nick: 'Raine' })}>
                submit
            </button>
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

    // Regression guard: absent resolves immediately via getMyProfile(), but myProfile arrives late
    // through observeItem's re-emit (~50ms debounce). Mounting the form in that gap would let
    // seededRef latch onto an empty value once and never seed again, so a user who does have a
    // profile would have it replaced without ever having seen their own name.
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

    // ADR-0041 decision 7: a user with no profile must be able to create one here too. It used to be
    // blocked by `!myProfile`, leaving only the header and no creation path at all.
    it('프로필이 없다고 확정되면 행이 없어도 빈 폼을 올린다', () => {
        mockAbsent = true;
        mockProfile = null;
        render(<PlaceProfilePage />);

        expect(screen.getByText('form')).toBeInTheDocument();
        expect(screen.getByText('seeded-nick:')).toBeInTheDocument();
    });
});

describe('PlaceProfilePage — save', () => {
    it('saves through the shared active-place profile write, not a write of its own', () => {
        mockAbsent = true;
        render(<PlaceProfilePage />);

        fireEvent.click(screen.getByRole('button', { name: 'submit' }));

        expect(setMyPlaceProfile).toHaveBeenCalledWith({ nick: 'Raine' });
    });
});
