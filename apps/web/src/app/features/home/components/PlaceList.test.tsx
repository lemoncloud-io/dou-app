import '@testing-library/jest-dom';

import { render, screen } from '@testing-library/react';

import { PlaceList } from './PlaceList';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/app-runtime', () => ({ usePlaceSync: () => undefined }));

jest.mock('@chatic/web-ui-kit', () => ({
    CollapsibleSection: ({ children, count }: any) => <section data-count={count ?? ''}>{children}</section>,
    IconPlus: () => <i />,
    ImageAvatar: ({ src }: any) => <img alt="" src={src} />,
    ListRow: ({ leading, title, subtitle, onClick, disabled }: any) => (
        <div onClick={onClick} data-disabled={!!disabled}>
            <div>{leading}</div>
            <div>{title}</div>
            <div>{subtitle}</div>
        </div>
    ),
    PlaceAvatar: ({ name }: any) => <span>{name?.[0]}</span>,
    VerifiedBadge: ({ label }: any) => <span aria-label={label} role="img" />,
}));

const makePlace = (over: any) => ({ id: 'p1', name: 'Sunny Place', stereo: 'site', ...over });

describe('PlaceList 로딩 / 전환 표시', () => {
    it('로딩 중에는 스켈레톤을 status로 알리고 개수는 감춘다', () => {
        const { container } = render(
            <PlaceList places={[]} selectedPlaceId={null} isLoading onSelectPlace={jest.fn()} />
        );

        expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'placeList.loading');
        expect(container.querySelector('section')).toHaveAttribute('data-count', '');
    });

    it('전환 중인 플레이스에는 선택 배지 대신 스피너를 보여준다', () => {
        // The switch pre-applies the sid, so the destination row is already "selected" while the
        // session is still committing — the badge alone would claim the move is done.
        render(
            <PlaceList
                places={[makePlace({ id: 'p1' }), makePlace({ id: 'p2', name: 'Rainy Place' })]}
                selectedPlaceId="p1"
                isLoading={false}
                isSwitching
                onSelectPlace={jest.fn()}
            />
        );

        expect(screen.getByRole('img', { name: 'placeList.switching' })).toBeInTheDocument();
        expect(screen.queryByRole('img', { name: 'placeList.selected' })).not.toBeInTheDocument();
    });

    it('전환이 끝나면 선택 배지로 돌아간다', () => {
        render(
            <PlaceList
                places={[makePlace({ id: 'p1' })]}
                selectedPlaceId="p1"
                isLoading={false}
                onSelectPlace={jest.fn()}
            />
        );

        expect(screen.getByRole('img', { name: 'placeList.selected' })).toBeInTheDocument();
        expect(screen.queryByRole('img', { name: 'placeList.switching' })).not.toBeInTheDocument();
    });
});
