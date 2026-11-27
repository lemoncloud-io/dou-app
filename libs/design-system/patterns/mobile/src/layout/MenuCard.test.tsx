import { render, screen } from '@testing-library/react';

import { MenuCard } from './MenuCard';

describe('MenuCard', () => {
    it('renders composed rows', () => {
        render(
            <MenuCard>
                <button>내 정보</button>
                <button>로그아웃</button>
            </MenuCard>
        );
        expect(screen.getByText('내 정보')).toBeInTheDocument();
        expect(screen.getByText('로그아웃')).toBeInTheDocument();
    });

    it('merges a custom className', () => {
        const { container } = render(<MenuCard className="mt-4">x</MenuCard>);
        expect(container.firstChild).toHaveClass('mt-4');
    });
});
