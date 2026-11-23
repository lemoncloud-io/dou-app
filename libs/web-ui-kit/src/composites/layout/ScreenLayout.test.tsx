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

describe('ScreenLayout bottom clearance', () => {
    it('puts a strip under the footer that clears the bottom inset and the keyboard', () => {
        render(
            <ScreenLayout footer={<button type="button">cta</button>}>
                <div>body</div>
            </ScreenLayout>
        );

        const strip = screen.getByTestId('screen-layout-footer-inset');
        expect(screen.getByRole('button', { name: 'cta' }).parentElement).toBe(strip.parentElement);
        expect(strip.previousElementSibling).toBe(screen.getByRole('button', { name: 'cta' }));
        expect(strip.style.height).toBe('max(var(--safe-bottom, 0px), var(--keyboard-height, 0px))');
    });

    it('pads by the bottom inset alone when there is no footer', () => {
        const { container } = render(<ScreenLayout>body</ScreenLayout>);

        expect(screen.queryByTestId('screen-layout-footer-inset')).not.toBeInTheDocument();
        expect(container.querySelector('.pb-safe-bottom')).not.toBeNull();
    });
});
