import { fireEvent, render, screen } from '@testing-library/react';

import { Button } from './Button';

describe('Button', () => {
    it('renders children and fires onClick', () => {
        const onClick = jest.fn();
        render(<Button onClick={onClick}>완료</Button>);
        fireEvent.click(screen.getByRole('button', { name: '완료' }));
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('solid green (default) fills with primary', () => {
        render(<Button>완료</Button>);
        expect(screen.getByRole('button').className).toContain('bg-primary');
    });

    it('solid black fills with the dark foreground', () => {
        render(<Button tone="black">완료</Button>);
        expect(screen.getByRole('button').className).toContain('bg-foreground');
    });

    it('outline defaults to the neutral (gray) border', () => {
        render(<Button variant="outline">취소</Button>);
        expect(screen.getByRole('button').className).toContain('border-input-border');
    });

    it('outline + accent (back-compat) uses the brand-green border', () => {
        render(
            <Button variant="outline" accent>
                PRO
            </Button>
        );
        expect(screen.getByRole('button').className).toContain('border-main-accent');
    });

    it('outline tone=black uses the dark border', () => {
        render(
            <Button variant="outline" tone="black">
                확인
            </Button>
        );
        expect(screen.getByRole('button').className).toContain('border-foreground');
    });

    it('loading disables the button and hides the label', () => {
        render(<Button loading>완료</Button>);
        expect(screen.getByRole('button')).toBeDisabled();
        expect(screen.queryByText('완료')).not.toBeInTheDocument();
    });
});
