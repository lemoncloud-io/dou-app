import { fireEvent, render, screen } from '@testing-library/react';

import { AppHeader } from './AppHeader';

describe('AppHeader', () => {
    it('renders the logo and plan badge', () => {
        render(<AppHeader logo={<span>DoU</span>} planTier="free" />);

        expect(screen.getByText('DoU')).toBeInTheDocument();
        expect(screen.getByText('FREE')).toBeInTheDocument();
    });

    it('fires switcher, search and profile handlers', () => {
        const onSwitcher = jest.fn();
        const onSearch = jest.fn();
        const onProfile = jest.fn();
        render(
            <AppHeader
                logo={<span>DoU</span>}
                onSwitcher={onSwitcher}
                onSearch={onSearch}
                avatar={<span>me</span>}
                onProfile={onProfile}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Switch' }));
        fireEvent.click(screen.getByRole('button', { name: 'Search' }));
        fireEvent.click(screen.getByRole('button', { name: 'Profile' }));

        expect(onSwitcher).toHaveBeenCalledTimes(1);
        expect(onSearch).toHaveBeenCalledTimes(1);
        expect(onProfile).toHaveBeenCalledTimes(1);
    });

    it('omits the search button when no handler is given', () => {
        render(<AppHeader logo={<span>DoU</span>} />);

        expect(screen.queryByRole('button', { name: 'Search' })).not.toBeInTheDocument();
    });

    it('omits the plan badge when no tier is given', () => {
        render(<AppHeader logo={<span>DoU</span>} />);

        expect(screen.queryByText('FREE')).not.toBeInTheDocument();
        expect(screen.queryByText('PRO')).not.toBeInTheDocument();
    });

    it('renders a default avatar glyph when the place profile avatar is omitted', () => {
        render(<AppHeader logo={<span>DoU</span>} onProfile={jest.fn()} />);

        const profileButton = screen.getByRole('button', { name: 'Profile' });
        expect(profileButton.querySelector('svg')).toBeInTheDocument();
    });

    it('renders the host-supplied avatar instead of the default glyph', () => {
        render(<AppHeader logo={<span>DoU</span>} avatar={<span>me</span>} onProfile={jest.fn()} />);

        expect(screen.getByText('me')).toBeInTheDocument();
    });

    it('uses host-supplied localized labels for the action buttons', () => {
        render(
            <AppHeader
                logo={<span>DoU</span>}
                onSwitcher={jest.fn()}
                onSearch={jest.fn()}
                avatar={<span>me</span>}
                onProfile={jest.fn()}
                switcherLabel="클라우드 선택하기"
                searchLabel="검색"
                profileLabel="프로필"
            />
        );

        expect(screen.getByRole('button', { name: '클라우드 선택하기' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '검색' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '프로필' })).toBeInTheDocument();
    });

    it('renders the trailing slot after the avatar', () => {
        render(<AppHeader logo={<span>DoU</span>} trailing={<button type="button">More</button>} />);

        expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument();
    });

    it('renders the switcher dot when switcherDot is set (ADR-0056)', () => {
        render(<AppHeader logo={<span>DoU</span>} onSwitcher={jest.fn()} switcherDot />);

        expect(screen.getByRole('button', { name: 'Switch' }).querySelector('.bg-red-500')).not.toBeNull();
    });

    it('omits the switcher dot by default', () => {
        render(<AppHeader logo={<span>DoU</span>} onSwitcher={jest.fn()} />);

        expect(screen.getByRole('button', { name: 'Switch' }).querySelector('.bg-red-500')).toBeNull();
    });

    it('never renders the dot without a switcher, even if switcherDot is set', () => {
        const { container } = render(<AppHeader logo={<span>DoU</span>} switcherDot />);

        expect(container.querySelector('.bg-red-500')).toBeNull();
    });
});
