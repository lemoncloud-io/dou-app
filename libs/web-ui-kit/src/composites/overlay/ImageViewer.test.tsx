import { fireEvent, render, screen } from '@testing-library/react';

import { ImageViewer } from './ImageViewer';

describe('ImageViewer', () => {
    it('is closed while there is no image', () => {
        render(<ImageViewer src={null} onClose={jest.fn()} />);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('shows the image and closes from the button', () => {
        const onClose = jest.fn();
        render(<ImageViewer src="https://example.com/a.jpg" onClose={onClose} title="사진" closeLabel="닫기" />);

        expect(screen.getByRole('dialog', { name: '사진' })).toBeInTheDocument();
        expect(screen.getByRole('dialog').querySelector('img')).toHaveAttribute('src', 'https://example.com/a.jpg');

        fireEvent.click(screen.getByRole('button', { name: '닫기' }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    // Anywhere off the image leaves; the image itself does not, so a tap meant to look closer stays.
    it('closes on a tap beside the image but not on the image', () => {
        const onClose = jest.fn();
        render(<ImageViewer src="https://example.com/a.jpg" onClose={onClose} />);

        fireEvent.click(screen.getByRole('dialog').querySelector('img') as HTMLImageElement);
        expect(onClose).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('dialog'));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('reports an image that failed to load', () => {
        const onError = jest.fn();
        render(<ImageViewer src="https://example.com/a.jpg" onClose={jest.fn()} onError={onError} />);

        fireEvent.error(screen.getByRole('dialog').querySelector('img') as HTMLImageElement);

        expect(onError).toHaveBeenCalledTimes(1);
    });
});
