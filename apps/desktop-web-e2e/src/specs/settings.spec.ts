import { expect, test } from '../support/test';

test.describe('settings page', () => {
    test('keeps its header in place when scrolled past the end with quiet hours on', async ({ app }) => {
        // Short enough that the settings column has to scroll.
        await app.setViewportSize({ width: 1000, height: 630 });
        await app.goto('/settings');
        const title = app.getByRole('heading', { level: 1, name: 'Settings' });
        await expect(title).toBeVisible();

        // Quiet hours draw their time fields under a visually hidden legend.
        const quietHours = app.getByRole('switch', { name: 'Quiet hours', exact: true });
        await expect(quietHours).toHaveAttribute('aria-checked', 'false');
        await quietHours.click();
        await expect(app.getByRole('group', { name: 'Quiet hours window' })).toBeVisible();

        // Wheel well past the end of the column, as a reader does.
        await app.getByRole('main').hover();
        for (let tick = 0; tick < 12; tick += 1) await app.mouse.wheel(0, 400);

        await expect(title).toBeInViewport();
        expect(await app.evaluate(() => window.scrollY)).toBe(0);
    });
});
