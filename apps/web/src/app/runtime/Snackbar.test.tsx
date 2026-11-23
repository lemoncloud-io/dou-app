import { act, render, screen } from '@testing-library/react';

import { SNACKBAR_OFFSET, TOAST_MIN_LIFT_PX, Toaster, useToastLift } from '@chatic/ui-kit/components/ui/toaster';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

describe('snackbar (ui-kit Toaster in apps/web)', () => {
    const raise = () => act(() => void toast({ title: 'Place notifications are off.' }));

    afterEach(() => act(() => toast({}).dismiss()));

    it('anchors the region to the bottom, clear of the inset, keyboard and any pinned bar', () => {
        render(<Toaster label="Notifications" />);
        raise();

        const viewport = screen.getByRole('region', { name: 'Notifications' }).querySelector('ol');
        const classes = Array.from(viewport?.classList ?? []);
        expect(classes).toEqual(expect.arrayContaining(['bottom-0', 'top-auto']));
        expect(classes).not.toContain('top-0');
        expect(viewport?.style.getPropertyValue('--snackbar-offset')).toBe(SNACKBAR_OFFSET);
        expect(viewport?.style.paddingBottom).toBe('var(--snackbar-offset)');
        expect(SNACKBAR_OFFSET).toContain('var(--safe-bottom, 0px)');
        expect(SNACKBAR_OFFSET).toContain('var(--keyboard-height, 0px)');
        expect(SNACKBAR_OFFSET).toContain('var(--toast-lift, 0px)');
        expect(SNACKBAR_OFFSET).toContain(`${TOAST_MIN_LIFT_PX}px`);
    });

    it("replaces the primitive's top-slide animations with the snackbar's own", () => {
        render(<Toaster label="Notifications" />);
        raise();

        const item = screen.getByText('Place notifications are off.').closest('li');
        expect(Array.from(item?.classList ?? [])).toEqual(
            expect.arrayContaining([
                'data-[state=open]:animate-snackbar-in',
                'data-[state=closed]:animate-snackbar-out',
                'touch-none',
            ])
        );
        expect(item?.className).not.toMatch(/animate-(slide-in-from-top|slide-out-to-top|fade-in|fade-out)\b/);
        expect(Array.from(item?.classList ?? [])).toEqual(
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
