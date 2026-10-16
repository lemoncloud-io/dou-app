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
        act(() => result.current.addFiles([file('a.png'), file('a.png'), file('a.7z', 'application/x-7z-compressed')]));
        expect(result.current.attachments.map(item => item.name)).toEqual(['a.png']);
        expect(toast).toHaveBeenCalledTimes(1);
        expect(toast.mock.calls[0][0]).toMatchObject({
            variant: 'destructive',
            description:
                "1 file was already attached. 1 file wasn't added. Images (PNG, JPEG, GIF, WebP), MP4 videos and PDF, Word, Excel, PowerPoint, HWP and text documents, and ZIP archives can be attached.",
        });
    });

    // The tray's preview opens a document from its object URL, so it gets one too, and gives it back on remove.
    it('gives a document an object URL and revokes it on remove', () => {
        const { result } = renderHook(() => useImageAttachments('C1'));
        act(() => result.current.addFiles([file('a.pdf', 'application/pdf')]));
        expect(result.current.attachments[0]).toMatchObject({ name: 'a.pdf', kind: 'file', url: 'blob:x' });
        act(() => result.current.remove(result.current.attachments[0].id));
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x');
    });
});
