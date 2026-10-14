import { describe, expect, it } from 'vitest';

import { render, screen } from '@testing-library/react';

import { buttonVariants } from '@chatic/ui-kit/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem } from '@chatic/ui-kit/components/ui/dropdown-menu';
import { Textarea } from '@chatic/ui-kit/components/ui/textarea';

/**
 * The kit-level floor of the account-area backlog: every tappable surface is
 * at least 36px, and control edges read the 3:1 control-border token the
 * contrast spec already pins (tokenContrast.spec.ts). Class-level on purpose:
 * jsdom does no layout, so what these guard is the revert, not the pixels.
 */
describe('kit target sizes and control edges', () => {
    it('draws the small button at the 36px floor', () => {
        expect(buttonVariants({ size: 'sm' })).toContain('h-9');
    });

    it('draws menu rows at the 36px floor', () => {
        render(
            <DropdownMenu defaultOpen>
                <DropdownMenuContent>
                    <DropdownMenuItem>action</DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        );

        expect(screen.getByRole('menuitem', { name: 'action' }).className).toContain('min-h-9');
    });

    it('draws the dialog close in a 36px box', () => {
        render(
            <Dialog open>
                <DialogContent closeLabel="Close">
                    <DialogTitle>title</DialogTitle>
                </DialogContent>
            </Dialog>
        );

        const close = screen.getByRole('button', { name: 'Close' });
        expect(close.className).toContain('h-9');
        expect(close.className).toContain('w-9');
    });

    it('edges the outline button with the control token, not the 1.21:1 input edge', () => {
        expect(buttonVariants({ variant: 'outline' })).toContain('border-control-border');
    });

    it('edges the textarea with the control token and its focus border', () => {
        render(<Textarea aria-label="notes" />);

        const box = screen.getByRole('textbox', { name: 'notes' }).className;
        expect(box).toContain('border-control-border');
        expect(box).toContain('border-focus-border');
    });
});
