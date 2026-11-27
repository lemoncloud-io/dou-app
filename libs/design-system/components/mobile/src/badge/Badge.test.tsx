import { render, screen } from '@testing-library/react';

import { Badge } from './Badge';

describe('Badge', () => {
    it('renders icon and children', () => {
        render(<Badge icon={<span>ic</span>}>PRO</Badge>);
        expect(screen.getByText('ic')).toBeInTheDocument();
        expect(screen.getByText('PRO')).toBeInTheDocument();
    });

    it('solid accent fills with primary', () => {
        render(
            <Badge variant="solid" tone="accent">
                방장
            </Badge>
        );
        expect(screen.getByText('방장').className).toContain('bg-primary');
    });

    it('outline accent uses the brand-green border', () => {
        render(
            <Badge variant="outline" tone="accent">
                PRO
            </Badge>
        );
        expect(screen.getByText('PRO').className).toContain('border-main-accent');
    });
});
