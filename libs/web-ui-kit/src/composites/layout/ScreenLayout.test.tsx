import { render, screen } from '@testing-library/react';

import { ScreenLayout } from './ScreenLayout';

describe('ScreenLayout', () => {
    it('renders header, body and footer slots', () => {
        render(
            <ScreenLayout header={<div>header</div>} footer={<div>footer</div>}>
                <div>body</div>
            </ScreenLayout>
        );

        expect(screen.getByText('header')).toBeInTheDocument();
        expect(screen.getByText('body')).toBeInTheDocument();
        expect(screen.getByText('footer')).toBeInTheDocument();
    });

    it('renders without header/footer', () => {
        render(<ScreenLayout>body</ScreenLayout>);
        expect(screen.getByText('body')).toBeInTheDocument();
    });
});
