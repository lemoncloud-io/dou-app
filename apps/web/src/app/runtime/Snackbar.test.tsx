import { act, render, screen } from '@testing-library/react';

import { SNACKBAR_OFFSET, Toaster, useToastLift } from '@chatic/ui-kit/components/ui/toaster';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

// The kit's Toaster as apps/web mounts it in AppRuntime. The kit has no test runner of its own, and
// the classes asserted here only mean anything against this app's Tailwind config, which is where
// the snackbar keyframes are declared.
describe('snackbar (ui-kit Toaster in apps/web)', () => {
    const raise = () => act(() => void toast({ title: 'Place notifications are off.' }));

    afterEach(() => act(() => toast({}).dismiss()));

    it('anchors the region to the bottom, clear of the inset, keyboard and any pinned bar', () => {
        render(<Toaster label="Notifications" />);
        raise();

        const viewport = screen.getByRole('region', { name: 'Notifications' }).querySelector('ol');
        const classes = [...(viewport?.classList ?? [])];
        expect(classes).toEqual(expect.arrayContaining(['bottom-0', 'top-auto']));
        expect(classes).not.toContain('top-0');
        expect(viewport?.style.getPropertyValue('--snackbar-offset')).toBe(SNACKBAR_OFFSET);
        expect(viewport?.style.paddingBottom).toBe('var(--snackbar-offset)');
        expect(SNACKBAR_OFFSET).toContain('var(--safe-bottom, 0px)');
        expect(SNACKBAR_OFFSET).toContain('var(--keyboard-height, 0px)');
        expect(SNACKBAR_OFFSET).toContain('var(--toast-lift, 0px)');
    });

    it("replaces the primitive's top-slide animations with the snackbar's own", () => {
        render(<Toaster label="Notifications" />);
        raise();

        const item = screen.getByText('Place notifications are off.').closest('li');
        expect([...(item?.classList ?? [])]).toEqual(
            expect.arrayContaining([
                'data-[state=open]:animate-snackbar-in',
                'data-[state=closed]:animate-snackbar-out',
                'touch-none',
            ])
        );
        // Left alongside, the stylesheet's declaration order — not the toaster — would pick the
        // animation that runs.
        expect(item?.className).not.toMatch(/animate-(slide-in-from-top|slide-out-to-top|fade-in|fade-out)\b/);
        // Reduced motion has to name each state: a bare `motion-reduce:animate-none` loses to the
        // state rules on specificity.
        expect([...(item?.classList ?? [])]).toEqual(
            expect.arrayContaining([
                'motion-reduce:data-[state=open]:animate-none',
                'motion-reduce:data-[state=closed]:animate-none',
            ])
        );
    });

    describe('useToastLift', () => {
        const Bar = ({ px }: { px: number | null }) => {
            useToastLift(px);
            return null;
        };
        const lift = () => document.documentElement.style.getPropertyValue('--toast-lift');

        it('publishes the tallest lift among the bars on screen', () => {
            const tabBar = render(<Bar px={80} />);
            const cta = render(<Bar px={120} />);
            expect(lift()).toBe('120px');

            cta.unmount();
            expect(lift()).toBe('80px');

            tabBar.unmount();
            expect(lift()).toBe('');
        });

        it('keeps a bar that is still showing lifted when one opened before it leaves first', () => {
            // A dialog's CTA opens over the tab bar, then the tab bar steps aside for the keyboard.
            const tabBar = render(<Bar px={80} />);
            const cta = render(<Bar px={120} />);

            tabBar.unmount();
            expect(lift()).toBe('120px');

            cta.unmount();
            expect(lift()).toBe('');
        });

        it('asks for nothing with null or zero, and follows a bar whose height changes', () => {
            const bar = render(<Bar px={null} />);
            expect(lift()).toBe('');

            bar.rerender(<Bar px={0} />);
            expect(lift()).toBe('');

            bar.rerender(<Bar px={96} />);
            expect(lift()).toBe('96px');

            bar.rerender(<Bar px={140} />);
            expect(lift()).toBe('140px');

            bar.unmount();
            expect(lift()).toBe('');
        });
    });
});
