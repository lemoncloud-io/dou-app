import { fireEvent, render, screen } from '@testing-library/react';

import { AttachMenuSheet } from './AttachMenuSheet';

const labels = { photo: '사진', camera: '카메라', file: '파일' };

describe('AttachMenuSheet', () => {
    it('offers photos, camera and files in the design order and fires each', () => {
        const onPhoto = jest.fn();
        const onCamera = jest.fn();
        const onFile = jest.fn();
        render(
            <AttachMenuSheet
                open
                onOpenChange={jest.fn()}
                onPhoto={onPhoto}
                onCamera={onCamera}
                onFile={onFile}
                labels={labels}
            />
        );

        const names = screen.getAllByRole('button').map(button => button.textContent);
        expect(names).toEqual(['사진', '카메라', '파일']);

        fireEvent.click(screen.getByRole('button', { name: '사진' }));
        fireEvent.click(screen.getByRole('button', { name: '카메라' }));
        fireEvent.click(screen.getByRole('button', { name: '파일' }));
        expect(onPhoto).toHaveBeenCalledTimes(1);
        expect(onCamera).toHaveBeenCalledTimes(1);
        expect(onFile).toHaveBeenCalledTimes(1);
    });

    it('hides the files entry when there is nothing to open', () => {
        render(
            <AttachMenuSheet open onOpenChange={jest.fn()} onPhoto={jest.fn()} onCamera={jest.fn()} labels={labels} />
        );

        expect(screen.queryByRole('button', { name: '파일' })).not.toBeInTheDocument();
    });

    // A shell that cannot read the library passes no strip; the menu must not draw an empty one.
    it('draws the recent strip only when one is given', () => {
        const { rerender } = render(
            <AttachMenuSheet open onOpenChange={jest.fn()} onPhoto={jest.fn()} onCamera={jest.fn()} />
        );
        expect(screen.queryByTestId('recent')).not.toBeInTheDocument();

        rerender(
            <AttachMenuSheet
                open
                onOpenChange={jest.fn()}
                onPhoto={jest.fn()}
                onCamera={jest.fn()}
                recent={<div data-testid="recent" />}
            />
        );
        expect(screen.getByTestId('recent')).toBeInTheDocument();
    });

    it('is still named for assistive tech without a drawn title', () => {
        render(<AttachMenuSheet open onOpenChange={jest.fn()} title="첨부" onPhoto={jest.fn()} onCamera={jest.fn()} />);

        expect(screen.getByRole('dialog', { name: '첨부' })).toBeInTheDocument();
    });
});
