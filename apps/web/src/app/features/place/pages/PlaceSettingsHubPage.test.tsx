import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import type { MySiteView } from '@lemoncloud/chatic-backend-api';

let mockPlace: Partial<MySiteView> | null = null;
const navigate = jest.fn();
const observeItem = jest.fn();

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/shared', () => ({ useNavigateWithTransition: () => navigate }));
jest.mock('@chatic/app-runtime', () => ({ useRuntimeRepositories: () => ({ place: { observeItem } }) }));
jest.mock('react-router-dom', () => ({ useParams: () => ({ placeId: 'p1' }) }));
// The real `ui` barrel pulls `@chatic/assets` through PrivateLayout, which jest cannot parse.
jest.mock('../../../ui', () => ({ PageHeader: ({ title }: { title: string }) => <div>header:{title}</div> }));
jest.mock('../components/ChannelSortSheet', () => ({ ChannelSortSheet: () => <div>sort-sheet</div> }));

import { PlaceSettingsHubPage } from './PlaceSettingsHubPage';

beforeEach(() => {
    jest.clearAllMocks();
    mockPlace = null;
    observeItem.mockImplementation((_id: string, cb: (item: unknown) => void) => {
        cb(mockPlace);
        return jest.fn();
    });
});

const rowButton = (label: string) => screen.getByText(label).closest('button') as HTMLButtonElement;

describe('PlaceSettingsHubPage — 설정 카드', () => {
    it('첫 카드 제목은 "설정"이다', () => {
        render(<PlaceSettingsHubPage />);

        expect(screen.getByText('placeSettings.sectionSettings')).toBeInTheDocument();
    });

    it('"플레이스 정보" 행이 상세 화면으로 이동한다', () => {
        render(<PlaceSettingsHubPage />);

        fireEvent.click(rowButton('placeSettings.placeDetail'));

        expect(navigate).toHaveBeenCalledWith('/place/p1/settings/detail');
    });

    it('"플레이스 프로필" 행이 편집 화면으로 이동한다', () => {
        mockPlace = { id: 'p1', isOwner: true };
        render(<PlaceSettingsHubPage />);

        fireEvent.click(rowButton('placeSettings.placeProfile'));

        expect(navigate).toHaveBeenCalledWith('/place/p1/settings/edit');
    });

    // 읽기 전용이라 오너 게이트가 없다 — 편집 행과 달리 비오너도 눌러야 한다(ADR-0047).
    it('비오너에게도 "플레이스 정보" 행은 활성이고, "플레이스 프로필" 행만 막힌다', () => {
        mockPlace = { id: 'p1', isOwner: false };
        render(<PlaceSettingsHubPage />);

        expect(rowButton('placeSettings.placeDetail')).not.toBeDisabled();
        expect(rowButton('placeSettings.placeProfile')).toBeDisabled();

        fireEvent.click(rowButton('placeSettings.placeDetail'));
        expect(navigate).toHaveBeenCalledWith('/place/p1/settings/detail');
    });
});
