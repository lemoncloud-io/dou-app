import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const toast = vi.hoisted(() => vi.fn());
vi.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast }));

import { toastFailure } from './failureToast';

const lastDescription = () => toast.mock.calls.at(-1)?.[0].description as ReactElement | undefined;

describe('toastFailure', () => {
    beforeEach(() => toast.mockReset());

    it("puts the server's own words under the sentence", () => {
        const error = Object.assign(new Error('Request failed with status code 400'), {
            response: { data: { error: '400 INVALID - grace-timeout by invite[910024]' } },
        });
        toastFailure('Could not join', error);

        expect(toast).toHaveBeenCalledWith(
            expect.objectContaining({ variant: 'destructive', title: 'Could not join' })
        );
        render(lastDescription() as ReactElement);
        expect(screen.getByText('400 INVALID - grace-timeout by invite[910024]')).toBeTruthy();
    });

    it('keeps an explanation of its own above the server text', () => {
        toastFailure('Could not switch', new Error('403 NOT ALLOWED - cloud access'), { detail: 'Renew in the app' });

        render(lastDescription() as ReactElement);
        expect(screen.getByText('Renew in the app')).toBeTruthy();
        expect(screen.getByText('403 NOT ALLOWED - cloud access')).toBeTruthy();
    });

    it('shows the sentence alone when the failure carries no words', () => {
        toastFailure('Could not save', undefined);

        expect(lastDescription()).toBeUndefined();
    });
});
