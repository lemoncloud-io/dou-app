import { act, renderHook } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import '../../../../i18n';

const toast = vi.hoisted(() => vi.fn());
vi.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast }));

import { useImageAttachments, useUnsendableFilesStore } from './useImageAttachments';

const file = (name: string, type = 'image/png') => new File(['x'], name, { type, lastModified: 1 });

describe('useImageAttachments', () => {
    beforeAll(() => {
        URL.createObjectURL = vi.fn(() => 'blob:x');
        URL.revokeObjectURL = vi.fn();
    });

    // A toast said how many were refused but not which, and added the rest unasked.
    it('holds a batch with a refusal for the unsendable-files dialog, and adds the rest only from it', () => {
        const { result } = renderHook(() => useImageAttachments('C1'));
        act(() => result.current.addFiles([file('a.png'), file('a.png'), file('a.7z', 'application/x-7z-compressed')]));
        expect(result.current.attachments).toEqual([]);
        const request = useUnsendableFilesStore.getState().request;
        expect(request?.refused).toEqual([
            { name: 'a.png', reason: 'duplicate', max: undefined },
            { name: 'a.7z', reason: 'unsupported', max: undefined },
        ]);
        expect(request?.restCount).toBe(1);
        act(() => request?.onUploadRest?.());
        expect(result.current.attachments.map(item => item.name)).toEqual(['a.png']);
        expect(toast).not.toHaveBeenCalled();
    });

    // The tray's preview opens a document from its object URL, so it gets one too, and gives it back on remove.
    it('gives a document an object URL and revokes it on remove', () => {
        const { result } = renderHook(() => useImageAttachments('D1'));
        act(() => result.current.addFiles([file('a.pdf', 'application/pdf')]));
        expect(result.current.attachments[0]).toMatchObject({ name: 'a.pdf', kind: 'file', url: 'blob:x' });
        act(() => result.current.remove(result.current.attachments[0].id));
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x');
    });

    beforeEach(() => vi.mocked(URL.revokeObjectURL).mockClear());

    // Leaving a room (another channel, or another page that unmounts the pane) and coming back found
    // the typed text but not the files waiting above it.
    it('keeps the waiting files when the composer leaves the room and comes back', () => {
        const first = renderHook(() => useImageAttachments('L1'));
        act(() => first.result.current.addFiles([file('a.png')]));
        first.unmount();
        const back = renderHook(() => useImageAttachments('L1'));
        // The restored tile still draws: its object URL was not handed back on the way out.
        expect(URL.revokeObjectURL).not.toHaveBeenCalled();
        expect(back.result.current.attachments.map(item => item.name)).toEqual(['a.png']);
    });

    it('keeps the waiting files across a switch to another channel and back', () => {
        const { result, rerender } = renderHook(({ scope }) => useImageAttachments(scope), {
            initialProps: { scope: 'C2' },
        });
        act(() => result.current.addFiles([file('b.png')]));
        rerender({ scope: 'C3' });
        expect(result.current.attachments).toEqual([]);
        rerender({ scope: 'C2' });
        expect(result.current.attachments.map(item => item.name)).toEqual(['b.png']);
    });

    it('empties only its own conversation on clear', () => {
        const other = renderHook(() => useImageAttachments('K2'));
        act(() => other.result.current.addFiles([file('c.png')]));
        const { result } = renderHook(() => useImageAttachments('K1'));
        act(() => result.current.addFiles([file('d.png')]));
        act(() => result.current.clear());
        expect(result.current.attachments).toEqual([]);
        expect(other.result.current.attachments.map(item => item.name)).toEqual(['c.png']);
    });
});
