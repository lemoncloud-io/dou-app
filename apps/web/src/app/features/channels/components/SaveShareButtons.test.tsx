import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import { SaveShareButtons } from './SaveShareButtons';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, values?: Record<string, unknown>) => (values ? `${key}:${JSON.stringify(values)}` : key),
    }),
}));

const image = { uploadId: 'u-1', url: 'https://bucket.s3.amazonaws.com/k', name: 'photo.jpg', kind: 'image' as const };
const clip = { uploadId: 'v-1', url: 'https://bucket.s3.amazonaws.com/v', name: 'clip.mp4', kind: 'video' as const };

describe('SaveShareButtons', () => {
    it('puts share first and save last, the two ends of the bar', () => {
        render(<SaveShareButtons item={image} busy={undefined} onAction={jest.fn()} />);

        expect(screen.getAllByRole('button').map(button => button.getAttribute('aria-label'))).toEqual([
            'chat.attach.export.share',
            'chat.attach.export.save',
        ]);
    });

    it('offers both actions for a sent image', () => {
        const onAction = jest.fn();
        render(<SaveShareButtons item={image} busy={undefined} onAction={onAction} />);

        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.export.save' }));
        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.export.share' }));

        expect(onAction.mock.calls).toEqual([
            ['save', image],
            ['share', image],
        ]);
    });

    it('turns both off for a photo still on its way, whose address is a page-local preview', () => {
        render(
            <SaveShareButtons item={{ ...image, url: 'blob:https://app/1' }} busy={undefined} onAction={jest.fn()} />
        );

        expect(screen.getByRole('button', { name: 'chat.attach.export.save' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'chat.attach.export.share' })).toBeDisabled();
    });

    it('turns both off while either works on the image, and marks the one working', () => {
        render(<SaveShareButtons item={image} busy={{ action: 'save', progress: 0.5 }} onAction={jest.fn()} />);

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
            <SaveShareButtons
                item={image}
                busy={undefined}
                onAction={onAction}
                saveAll={{ count: 3, videos: false, onSaveAll }}
            />
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
                item={image}
                busy={undefined}
                onAction={onAction}
                saveAll={{ count: 2, videos: false, onSaveAll: jest.fn() }}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.export.save' }));
        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.export.saveOne' }));

        expect(onAction).toHaveBeenCalledWith('save', image);
    });

    it('saves the photo the sheet was opened on, even if the page behind it turns', () => {
        const onAction = jest.fn();
        const saveAll = { count: 2, videos: false, onSaveAll: jest.fn() };
        const other = {
            uploadId: 'u-2',
            url: 'https://bucket.s3.amazonaws.com/k2',
            name: 'two.jpg',
            kind: 'image' as const,
        };
        const { rerender } = render(
            <SaveShareButtons item={image} busy={undefined} onAction={onAction} saveAll={saveAll} />
        );

        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.export.save' }));
        rerender(<SaveShareButtons item={other} busy={undefined} onAction={onAction} saveAll={saveAll} />);
        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.export.saveOne' }));

        expect(onAction).toHaveBeenCalledWith('save', image);
    });

    it('names the buttons for a video when the showing item is one', () => {
        render(<SaveShareButtons item={clip} busy={undefined} onAction={jest.fn()} />);

        expect(screen.getAllByRole('button').map(button => button.getAttribute('aria-label'))).toEqual([
            'chat.attach.export.shareVideo',
            'chat.attach.export.saveVideo',
        ]);
    });

    it('turns both off for an item the viewer could not draw', () => {
        render(<SaveShareButtons item={{ ...clip, broken: true }} busy={undefined} onAction={jest.fn()} />);

        expect(screen.getByRole('button', { name: 'chat.attach.export.saveVideo' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'chat.attach.export.shareVideo' })).toBeDisabled();
    });

    it('saves straight away when only one item can be saved', () => {
        const onAction = jest.fn();
        render(
            <SaveShareButtons
                item={clip}
                busy={undefined}
                onAction={onAction}
                saveAll={{ count: 1, videos: true, onSaveAll: jest.fn() }}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.export.saveVideo' }));

        expect(onAction).toHaveBeenCalledWith('save', clip);
        expect(screen.queryByRole('button', { name: /saveAll/ })).not.toBeInTheDocument();
    });

    it('offers this video and a count of items when the message has videos', () => {
        const onAction = jest.fn();
        render(
            <SaveShareButtons
                item={clip}
                busy={undefined}
                onAction={onAction}
                saveAll={{ count: 3, videos: true, onSaveAll: jest.fn() }}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.export.saveVideo' }));

        expect(screen.getByRole('button', { name: 'chat.attach.export.saveAllItems:{"n":3}' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.export.saveOneVideo' }));
        expect(onAction).toHaveBeenCalledWith('save', clip);
    });

    it('keeps the photo wording for a photo of a message that also has videos', () => {
        render(
            <SaveShareButtons
                item={image}
                busy={undefined}
                onAction={jest.fn()}
                saveAll={{ count: 2, videos: true, onSaveAll: jest.fn() }}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.export.save' }));

        expect(screen.getByRole('button', { name: 'chat.attach.export.saveOne' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'chat.attach.export.saveAllItems:{"n":2}' })).toBeInTheDocument();
    });

    it('shows which item a save all is on, between the two buttons', () => {
        render(
            <SaveShareButtons
                item={image}
                busy={{ action: 'save', progress: 0.4, step: { current: 3, total: 5 } }}
                onAction={jest.fn()}
            />
        );

        expect(screen.getByRole('status')).toHaveTextContent(
            'chat.attach.export.saveAllProgress:{"current":3,"total":5}'
        );
    });

    it('shows no position for a single save', () => {
        render(<SaveShareButtons item={image} busy={{ action: 'save', progress: 0.4 }} onAction={jest.fn()} />);

        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
});
