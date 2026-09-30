import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import i18n from '../../../../i18n';

vi.mock('../../../shared', () => ({
    useDesktopChannelMutations: () => ({ updateChannel: vi.fn(), isMutating: false }),
}));

import { RenameChannelDialog } from './RenameChannelDialog';

describe('RenameChannelDialog', () => {
    beforeAll(() => i18n.changeLanguage('ko'));

    it('is named by its title and not described by a hidden copy of it', () => {
        render(<RenameChannelDialog open onOpenChange={vi.fn()} channelId="c-1" currentName="design" />);

        const dialog = screen.getByRole('dialog', { name: i18n.t('channels.rename.title') });
        // A screen reader read the title twice while an sr-only description repeated it.
        expect(dialog.hasAttribute('aria-describedby')).toBe(false);
    });

    it('names the close button in the app language', () => {
        render(<RenameChannelDialog open onOpenChange={vi.fn()} channelId="c-1" currentName="design" />);

        expect(screen.getByRole('button', { name: '닫기' })).toBeTruthy();
    });
});
