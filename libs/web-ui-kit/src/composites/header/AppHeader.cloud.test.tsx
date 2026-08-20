import { fireEvent, render, screen } from '@testing-library/react';

import { AppHeader } from './AppHeader';

describe('AppHeader — cloud kind (Type 2)', () => {
    it('renders the cloud name, place nickname and cloud avatar', () => {
        render(
            <AppHeader
                kind="cloud"
                cloudAvatar={<span>CLOUD</span>}
                name="<클라우드 명>"
                subName="<플레이스 닉네임>"
                avatar={<span>PLACE</span>}
                onSwitcher={jest.fn()}
            />
        );

        expect(screen.getByText('<클라우드 명>')).toBeInTheDocument();
        expect(screen.getByText('<플레이스 닉네임>')).toBeInTheDocument();
        expect(screen.getByText('CLOUD')).toBeInTheDocument();
        expect(screen.getByText('PLACE')).toBeInTheDocument();
    });

    it('renders a cloud initials avatar when no cloudAvatar is supplied', () => {
        render(<AppHeader kind="cloud" name="스터디 플레이스" onSwitcher={jest.fn()} />);

        expect(screen.getByText('스')).toBeInTheDocument();
    });

    it('fires the switcher action on the cloud/name cluster', () => {
        const onSwitcher = jest.fn();
        render(<AppHeader kind="cloud" name="<클라우드 명>" onSwitcher={onSwitcher} switcherLabel="클라우드 선택" />);

        fireEvent.click(screen.getByRole('button', { name: '클라우드 선택' }));
        expect(onSwitcher).toHaveBeenCalledTimes(1);
    });

    it('renders a dropdown trigger when switcherMenu is provided', () => {
        render(
            <AppHeader kind="cloud" name="<클라우드 명>" switcherLabel="클라우드 선택" switcherMenu={<div>menu</div>} />
        );

        // Radix wires the trigger with a menu popup; it stays closed until opened.
        expect(screen.getByRole('button', { name: '클라우드 선택' })).toHaveAttribute('aria-haspopup', 'menu');
    });

    it('renders the switcher dot next to the cloud name (ADR-0056)', () => {
        render(
            <AppHeader
                kind="cloud"
                name="<클라우드 명>"
                onSwitcher={jest.fn()}
                switcherLabel="클라우드 선택"
                switcherDot
            />
        );

        expect(screen.getByRole('button', { name: '클라우드 선택' }).querySelector('.bg-red-500')).not.toBeNull();
    });
});

describe('AppHeader — cloud kind loading placeholder', () => {
    it('replaces the avatar and name with an announced placeholder while loading', () => {
        render(
            <AppHeader
                kind="cloud"
                loading
                loadingLabel="클라우드를 불러오는 중이에요"
                name="<클라우드 명>"
                subName="<플레이스 닉네임>"
                cloudAvatar={<span>CLOUD</span>}
                onSwitcher={jest.fn()}
            />
        );

        expect(screen.getByRole('status', { name: '클라우드를 불러오는 중이에요' })).toBeInTheDocument();
        // A half-resolved header (blank circle + blank text) reads as a nameless cloud, so neither
        // the stale identity nor the real avatar may show through the placeholder.
        expect(screen.queryByText('<클라우드 명>')).not.toBeInTheDocument();
        expect(screen.queryByText('CLOUD')).not.toBeInTheDocument();
    });

    it('keeps the brand mark for the no-cloud kind even when loading is set', () => {
        // Only the cloud identity is fetched; the brand mark is known before any request.
        render(<AppHeader kind="no-cloud" loading loadingLabel="loading" onSwitcher={jest.fn()} />);

        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
});
