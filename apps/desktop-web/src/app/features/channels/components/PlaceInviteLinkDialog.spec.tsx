import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const copy = vi.hoisted(() => vi.fn());
vi.mock('../../../shared/hooks/useCopyToClipboard', () => ({
    useCopyToClipboard: () => [false, copy] as const,
}));

import '../../../../i18n';

import { useInviteLinkStore } from '../stores/useInviteLinkStore';
import { PlaceInviteLinkDialog } from './PlaceInviteLinkDialog';

describe('PlaceInviteLinkDialog', () => {
    beforeEach(() => {
        cleanup();
        vi.clearAllMocks();
        useInviteLinkStore.getState().close();
    });

    it('shows the link and copies it on demand', () => {
        act(() => useInviteLinkStore.getState().open('https://dou.example/p/xyz'));
        render(<PlaceInviteLinkDialog />);

        expect((screen.getByLabelText('Invite link') as HTMLInputElement).value).toBe('https://dou.example/p/xyz');
        fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

        expect(copy).toHaveBeenCalledWith('https://dou.example/p/xyz');
    });

    it('closes from its button', () => {
        act(() => useInviteLinkStore.getState().open('https://dou.example/p/xyz'));
        render(<PlaceInviteLinkDialog />);

        fireEvent.click(screen.getByRole('button', { name: 'Close' }));

        expect(useInviteLinkStore.getState().link).toBeNull();
    });
});
