import { act, renderHook } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import '../../../../i18n';

const toast = vi.hoisted(() => vi.fn());
vi.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast }));

import { useImageAttachments } from './useImageAttachments';

const file = (name: string, type = 'image/png') => new File(['x'], name, { type, lastModified: 1 });

describe('useImageAttachments', () => {
    beforeAll(() => {
        URL.createObjectURL = vi.fn(() => 'blob:x');
        URL.revokeObjectURL = vi.fn();
    });

    // A blocking dialog named only the first reason and nothing about how many were left out.
    it('adds what fits and reports every refusal in one toast', () => {
        const { result } = renderHook(() => useImageAttachments('C1'));
        act(() => result.current.addFiles([file('a.png'), file('a.png'), file('a.zip', 'application/zip')]));
        expect(result.current.attachments.map(item => item.name)).toEqual(['a.png']);
        expect(toast).toHaveBeenCalledTimes(1);
        expect(toast.mock.calls[0][0]).toMatchObject({
            variant: 'destructive',
            description:
                "1 file was already attached. 1 file wasn't added. Images (PNG, JPEG, GIF, WebP), MP4 videos and PDF, Word, Excel, PowerPoint, HWP or text documents can be attached.",
        });
    });

    // A document has no picture, so it gets no object URL to leak; its tile shows its name.
    it('keeps a document as a file with no preview', () => {
        const { result } = renderHook(() => useImageAttachments('C1'));
        act(() => result.current.addFiles([file('a.pdf', 'application/pdf')]));
        expect(result.current.attachments[0]).toMatchObject({ name: 'a.pdf', kind: 'file', url: '' });
    });
});
