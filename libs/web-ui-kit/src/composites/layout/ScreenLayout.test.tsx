import { render, screen } from '@testing-library/react';

import { COLUMN_INSET, FORM_COLUMN } from '../../foundations/formColumn';
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

    it('declares the form column on its root and insets the body to it when width is form', () => {
        const { container } = render(
            <ScreenLayout width="form" footer={<div>footer</div>}>
                <div>body</div>
            </ScreenLayout>
        );

        expect(container.firstElementChild?.className).toContain(FORM_COLUMN);
        expect(screen.getByText('body').parentElement?.className).toContain(COLUMN_INSET);
    });

    it('keeps filling the app column when no form column is asked for', () => {
        const { container } = render(
            <ScreenLayout footer={<div>footer</div>}>
                <div>body</div>
            </ScreenLayout>
        );

        expect(container.firstElementChild?.className).not.toContain(FORM_COLUMN);
        expect(screen.getByText('body').parentElement?.className).not.toContain(COLUMN_INSET);
    });
});
