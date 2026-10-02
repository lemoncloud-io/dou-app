import { fireEvent, render, screen } from '@testing-library/react';

import { AttachSourceSheet } from './AttachSourceSheet';

const labels = { album: '앨범에서 선택', files: '파일에서 선택' };

describe('AttachSourceSheet', () => {
    it('offers the album then the files and fires each', () => {
        const onAlbum = jest.fn();
        const onFiles = jest.fn();
        render(<AttachSourceSheet open onOpenChange={jest.fn()} onAlbum={onAlbum} onFiles={onFiles} labels={labels} />);

        expect(screen.getAllByRole('button').map(button => button.textContent)).toEqual([
            '앨범에서 선택',
            '파일에서 선택',
        ]);

        fireEvent.click(screen.getByRole('button', { name: '앨범에서 선택' }));
        expect(onAlbum).toHaveBeenCalledTimes(1);
        expect(onFiles).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: '파일에서 선택' }));
        expect(onFiles).toHaveBeenCalledTimes(1);
    });

    it('falls back to English labels', () => {
        render(<AttachSourceSheet open onOpenChange={jest.fn()} onAlbum={jest.fn()} onFiles={jest.fn()} />);

        expect(screen.getByRole('button', { name: 'From album' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'From files' })).toBeInTheDocument();
    });

    it('draws the notice line only when one is given', () => {
        const { rerender } = render(
            <AttachSourceSheet open onOpenChange={jest.fn()} onAlbum={jest.fn()} onFiles={jest.fn()} />
        );
        expect(screen.queryByText('Update the app to send videos')).not.toBeInTheDocument();

        rerender(
            <AttachSourceSheet
                open
                onOpenChange={jest.fn()}
                onAlbum={jest.fn()}
                onFiles={jest.fn()}
                notice="Update the app to send videos"
            />
        );
        expect(screen.getByText('Update the app to send videos')).toBeInTheDocument();
    });

    it('is still named for assistive tech without a drawn title', () => {
        render(
            <AttachSourceSheet
                open
                onOpenChange={jest.fn()}
                title="파일 첨부"
                onAlbum={jest.fn()}
                onFiles={jest.fn()}
            />
        );

        expect(screen.getByRole('dialog', { name: '파일 첨부' })).toBeInTheDocument();
    });

    // The second step has to read as the first one narrowing: the same sheet edge as the attach menu.
    it('draws the sheet as the attach menu does', () => {
        render(<AttachSourceSheet open onOpenChange={jest.fn()} onAlbum={jest.fn()} onFiles={jest.fn()} />);

        expect(screen.getByRole('dialog')).toHaveClass('rounded-t-[20px]', 'shadow-[0_-2px_6px_rgba(0,0,0,0.12)]');
    });

    it('draws nothing while closed', () => {
        render(<AttachSourceSheet open={false} onOpenChange={jest.fn()} onAlbum={jest.fn()} onFiles={jest.fn()} />);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
});
