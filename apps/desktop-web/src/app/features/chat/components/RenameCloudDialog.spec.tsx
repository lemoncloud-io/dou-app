import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import i18next from 'i18next';

import type * as SharedModule from '../../../shared';

const renameCloud = vi.fn();
vi.mock('../../../shared', async () => ({
    ...(await vi.importActual<typeof SharedModule>('../../../shared')),
    useRenameCloud: () => ({ renameCloud, isRenaming: false }),
}));

import '../../../../i18n';
import { RenameCloudDialog } from './RenameCloudDialog';

const setup = (onOpenChange = vi.fn()) => {
    render(<RenameCloudDialog open onOpenChange={onOpenChange} cloudId="c-1" currentName="Studio" />);
    const input = screen.getByLabelText(i18next.t('cloud.rename.nameLabel')) as HTMLInputElement;
    const submit = screen.getByRole('button', { name: i18next.t('cloud.rename.submit') });
    return { onOpenChange, input, submit };
};

beforeEach(() => {
    vi.clearAllMocks();
    renameCloud.mockResolvedValue(undefined);
});

describe('RenameCloudDialog', () => {
    it('renames with the trimmed name and closes', async () => {
        const { onOpenChange, input, submit } = setup();
        fireEvent.change(input, { target: { value: '  Atelier ' } });
        fireEvent.click(submit);

        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
        expect(renameCloud).toHaveBeenCalledWith('c-1', 'Atelier');
    });

    it('does not submit a name shorter than two characters', () => {
        const { input, submit } = setup();
        fireEvent.change(input, { target: { value: ' A ' } });

        expect((submit as HTMLButtonElement).disabled).toBe(true);
        expect(renameCloud).not.toHaveBeenCalled();
    });

    it('closes without a request when the name is unchanged', async () => {
        const { onOpenChange, submit } = setup();
        fireEvent.click(submit);

        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
        expect(renameCloud).not.toHaveBeenCalled();
    });

    it('stays open and says what went wrong when the rename fails', async () => {
        renameCloud.mockRejectedValue(new Error('403 NOT ALLOWED - action[update] is invalid'));
        const { onOpenChange, input, submit } = setup();
        fireEvent.change(input, { target: { value: 'Atelier' } });
        fireEvent.click(submit);

        expect((await screen.findByRole('alert')).textContent).toBe(i18next.t('errors.notAllowed'));
        expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('words a missing cloud as a cloud, not a channel', async () => {
        renameCloud.mockRejectedValue(new Error('404 NOT FOUND - cloud is gone'));
        const { input, submit } = setup();
        fireEvent.change(input, { target: { value: 'Atelier' } });
        fireEvent.click(submit);

        expect((await screen.findByRole('alert')).textContent).toBe(i18next.t('cloud.rename.error.notFound'));
    });
});
