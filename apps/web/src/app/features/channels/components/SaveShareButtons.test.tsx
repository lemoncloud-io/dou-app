import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import { SaveShareButtons } from './SaveShareButtons';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, values?: Record<string, unknown>) => (values ? `${key}:${JSON.stringify(values)}` : key),
    }),
}));

const image = { uploadId: 'u-1', url: 'https://bucket.s3.amazonaws.com/k', name: 'photo.jpg' };

describe('SaveShareButtons', () => {
    it('puts share first and save last, the two ends of the bar', () => {
        render(<SaveShareButtons image={image} busy={undefined} onAction={jest.fn()} />);

        expect(screen.getAllByRole('button').map(button => button.getAttribute('aria-label'))).toEqual([
            'chat.attach.export.share',
            'chat.attach.export.save',
        ]);
    });

    it('offers both actions for a sent image', () => {
        const onAction = jest.fn();
        render(<SaveShareButtons image={image} busy={undefined} onAction={onAction} />);

        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.export.save' }));
        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.export.share' }));

        expect(onAction.mock.calls).toEqual([
            ['save', image],
            ['share', image],
        ]);
    });

    it('turns both off for a photo still on its way, whose address is a page-local preview', () => {
        render(
            <SaveShareButtons image={{ ...image, url: 'blob:https://app/1' }} busy={undefined} onAction={jest.fn()} />
        );

        expect(screen.getByRole('button', { name: 'chat.attach.export.save' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'chat.attach.export.share' })).toBeDisabled();
    });

    it('turns both off while either works on the image, and marks the one working', () => {
        render(<SaveShareButtons image={image} busy={{ action: 'save', progress: 0.5 }} onAction={jest.fn()} />);

        const save = screen.getByRole('button', { name: 'chat.attach.export.save' });
        const share = screen.getByRole('button', { name: 'chat.attach.export.share' });
        // The working one stays focusable and ignores presses; the other is off.
        expect(save).toHaveAttribute('aria-disabled', 'true');
        expect(share).toBeDisabled();
        expect(save).toHaveAttribute('aria-busy', 'true');
        expect(share).not.toHaveAttribute('aria-busy', 'true');
    });

    it('asks whether to save this photo or all of them when the message has more than one', () => {
        const onAction = jest.fn();
        const onSaveAll = jest.fn();
        render(
            <SaveShareButtons image={image} busy={undefined} onAction={onAction} saveAll={{ count: 3, onSaveAll }} />
        );

        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.export.save' }));
        expect(onAction).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.export.saveAll:{"n":3}' }));

        expect(onSaveAll).toHaveBeenCalledTimes(1);
        expect(onAction).not.toHaveBeenCalled();
    });

    it('saves only the showing photo when that is the choice', () => {
        const onAction = jest.fn();
        render(
            <SaveShareButtons
                image={image}
                busy={undefined}
                onAction={onAction}
                saveAll={{ count: 2, onSaveAll: jest.fn() }}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.export.save' }));
        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.export.saveOne' }));

        expect(onAction).toHaveBeenCalledWith('save', image);
    });

    it('saves the photo the sheet was opened on, even if the page behind it turns', () => {
        const onAction = jest.fn();
        const saveAll = { count: 2, onSaveAll: jest.fn() };
        const other = { uploadId: 'u-2', url: 'https://bucket.s3.amazonaws.com/k2', name: 'two.jpg' };
        const { rerender } = render(
            <SaveShareButtons image={image} busy={undefined} onAction={onAction} saveAll={saveAll} />
        );

        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.export.save' }));
        rerender(<SaveShareButtons image={other} busy={undefined} onAction={onAction} saveAll={saveAll} />);
        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.export.saveOne' }));

        expect(onAction).toHaveBeenCalledWith('save', image);
    });
});
