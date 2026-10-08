import { render, screen } from '@testing-library/react';

import { CloudStatusBadge } from './CloudStatusBadge';

describe('CloudStatusBadge', () => {
    it('renders the given label', () => {
        render(<CloudStatusBadge label="생성 중" variant="provisioning" />);
        expect(screen.getByText('생성 중')).toBeInTheDocument();
    });

    it('paints each variant in its own tone', () => {
        const { rerender } = render(<CloudStatusBadge label="x" variant="provisioning" />);
        expect(screen.getByText('x').className).toContain('text-point-blue');

        rerender(<CloudStatusBadge label="x" variant="failed" />);
        expect(screen.getByText('x').className).toContain('text-destructive');

        rerender(<CloudStatusBadge label="x" variant="restricted" />);
        expect(screen.getByText('x').className).toContain('text-description');
    });

    it('leads the restricted variant with an alert glyph, and only that one', () => {
        const { container, rerender } = render(<CloudStatusBadge label="이용 제한" variant="restricted" />);
        expect(container.querySelector('svg')).not.toBeNull();

        rerender(<CloudStatusBadge label="확인 필요" variant="failed" />);
        expect(container.querySelector('svg')).toBeNull();
    });
});
