import { render, screen } from '@testing-library/react';

import { VerifiedBadge } from './VerifiedBadge';

describe('VerifiedBadge', () => {
    it('renders with an accessible label', () => {
        render(<VerifiedBadge label="기본 플레이스" />);
        expect(screen.getByRole('img', { name: '기본 플레이스' })).toBeInTheDocument();
    });

    it('applies the blue verified fill', () => {
        render(<VerifiedBadge />);
        expect(screen.getByRole('img').className).toContain('bg-verified');
    });
});
