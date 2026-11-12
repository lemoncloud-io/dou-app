import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import type { DragEvent } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import '../../../../../i18n';

import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

import { useFileDrop, useImageAttachments, useUnsendableFilesStore } from '../../hooks';
import { UnsendableFilesHost } from './UnsendableFilesDialog';

const file = (name: string, type = 'image/png', size = 1) =>
    new File([new Uint8Array(size)], name, { type, lastModified: 1 });
const MB = 1024 * 1024;

beforeAll(() => {
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
});
beforeEach(() => {
    useUnsendableFilesStore.setState({ request: null });
});
afterEach(cleanup);

const setup = (scope: string) => {
    render(
        <TooltipProvider>
            <UnsendableFilesHost />
        </TooltipProvider>
    );
    return renderHook(() => useImageAttachments(scope)).result;
};
// The name is drawn as stem and extension, so the row is found by its text, not one node's.
const rowOf = (name: string) =>
    screen.getAllByRole('listitem').find(row => row.textContent?.startsWith(name)) as HTMLElement;

describe('unsendable files', () => {
    it('lists every refused file with its reason, and adds the rest only on "upload the other n"', () => {
        const tray = setup('S1');
        const big = file('huge.png');
        Object.defineProperty(big, 'size', { value: 21 * MB });
        act(() =>
            tray.current.addFiles([
                file('a.png'),
                big,
                file('empty.pdf', 'application/pdf', 0),
                file('a.7z', 'application/x-7z-compressed'),
                file('b.png'),
            ])
        );

        const dialog = screen.getByRole('alertdialog', { name: "Some files can't be sent" });
        expect(within(rowOf('huge.png')).getByText('Too large · up to 20 MB')).toBeTruthy();
        expect(within(rowOf('empty.pdf')).getByText('Empty file')).toBeTruthy();
        expect(within(rowOf('a.7z')).getByText('Format not supported')).toBeTruthy();
        expect(dialog.textContent).toContain('MP4 videos');
        expect(tray.current.attachments).toEqual([]);

        fireEvent.click(screen.getByRole('button', { name: 'Upload the other 2' }));
        expect(tray.current.attachments.map(item => item.name)).toEqual(['a.png', 'b.png']);
        expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('adds nothing on cancel', () => {
        const tray = setup('S2');
        act(() => tray.current.addFiles([file('a.png'), file('a.7z', 'application/x-7z-compressed')]));
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(tray.current.attachments).toEqual([]);
        expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('only acknowledges when nothing in the batch can be sent', () => {
        const tray = setup('S3');
        act(() => tray.current.addFiles([file('a.7z', 'application/x-7z-compressed')]));
        expect(screen.queryByRole('button', { name: /Upload the other/ })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
        expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('names duplicates and what is over the per-message limit', () => {
        const tray = setup('S4');
        act(() => tray.current.addFiles([file('a.png')]));
        const many = Array.from({ length: 10 }, (_, i) => file(`${i}.png`));
        act(() => tray.current.addFiles([file('a.png'), ...many]));
        expect(within(rowOf('a.png')).getByText('Already attached')).toBeTruthy();
        expect(within(rowOf('9.png')).getByText('Over 10 files per message')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Upload the other 9' }));
        expect(tray.current.attachments).toHaveLength(10);
    });

    it('opens no dialog when every file fits', () => {
        const tray = setup('S5');
        act(() => tray.current.addFiles([file('a.png')]));
        expect(screen.queryByRole('alertdialog')).toBeNull();
        expect(tray.current.attachments).toHaveLength(1);
    });

    it('refuses a dropped folder by name', () => {
        const tray = setup('S6');
        const { result } = renderHook(() => useFileDrop(tray.current.addFiles));
        const folder = new File([], 'Recordings', { type: '' });
        const song = file('song.mp3', 'audio/mpeg');
        const entry = (name: string, isDirectory: boolean) => ({
            kind: 'file',
            webkitGetAsEntry: () => ({ name, isDirectory }),
        });
        act(() =>
            result.current.dropHandlers.onDrop({
                preventDefault: () => undefined,
                dataTransfer: {
                    types: ['Files'],
                    files: [folder, song],
                    items: [entry('Recordings', true), entry('song.mp3', false)],
                },
            } as unknown as DragEvent)
        );
        expect(within(rowOf('Recordings')).getByText('Folders can’t be sent')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Upload the other 1' }));
        expect(tray.current.attachments.map(item => item.name)).toEqual(['song.mp3']);
    });
});
