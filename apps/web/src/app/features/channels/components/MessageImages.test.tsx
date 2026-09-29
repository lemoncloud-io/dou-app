import '@testing-library/jest-dom';

import { act, fireEvent, render, screen } from '@testing-library/react';

import type { DomainChat } from '@chatic/data';

import { MessageImages } from './MessageImages';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, vars?: { position?: number }) => (vars?.position ? `${key}:${vars.position}` : key),
    }),
}));
const refresh = jest.fn().mockResolvedValue(true);
jest.mock('../hooks/useImageAddressRefresh', () => ({ useImageAddressRefresh: () => refresh }));

type Uploads = NonNullable<DomainChat['upload$$']>;
const sent = (id: string, thumb: string) =>
    ({ id, status: 'stored', orgUrl: `https://s3/${id}`, thumbUrl: thumb }) as Uploads[number];

beforeEach(() => refresh.mockClear());

describe('MessageImages', () => {
    // A cached row keeps addresses that expire; the message is read again for fresh ones.
    it('re-reads the message from its cloud when an image fails, and shows a placeholder meanwhile', () => {
        const uploads = [sent('u1', 'https://s3/u1-thumb-old'), sent('u2', 'https://s3/u2-thumb')];
        const { container } = render(<MessageImages uploads={uploads} chatId="ch1:5" cid="cloud-b" align="start" />);

        act(() => {
            fireEvent.error(container.querySelectorAll('img')[0]);
        });

        expect(refresh).toHaveBeenCalledWith({ cid: 'cloud-b', chatId: 'ch1:5', src: 'https://s3/u1-thumb-old' });
        expect(container.querySelectorAll('img')).toHaveLength(1);
    });

    it('draws the fresh address once the re-read brings one', () => {
        const { container, rerender } = render(
            <MessageImages uploads={[sent('u1', 'https://s3/old')]} chatId="ch1:5" cid="c" align="start" />
        );
        act(() => {
            fireEvent.error(container.querySelector('img') as HTMLImageElement);
        });
        expect(container.querySelector('img')).toBeNull();

        rerender(<MessageImages uploads={[sent('u1', 'https://s3/new')]} chatId="ch1:5" cid="c" align="start" />);

        expect(container.querySelector('img')).toHaveAttribute('src', 'https://s3/new');
    });

    // A message still on its way draws from a local preview; there is nothing to re-read.
    it('never re-reads for a local preview', () => {
        const uploads = [{ localStatus: 'sending', localThumbUrl: 'blob:1' }] as Uploads;
        const { container } = render(<MessageImages uploads={uploads} chatId="tmp-1" cid="c" align="end" />);

        fireEvent.error(container.querySelector('img') as HTMLImageElement);

        expect(refresh).not.toHaveBeenCalled();
    });

    it('opens the original and re-reads when the open original fails', () => {
        const uploads = [sent('u1', 'https://s3/u1-thumb')];
        render(<MessageImages uploads={uploads} chatId="ch1:5" cid="c" align="start" />);

        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.tile:1' }));
        const viewerImage = screen.getByRole('dialog').querySelector('img[data-current]') as HTMLImageElement;
        expect(viewerImage).toHaveAttribute('src', 'https://s3/u1');

        fireEvent.error(viewerImage);
        expect(refresh).toHaveBeenCalledWith({ cid: 'c', chatId: 'ch1:5', src: 'https://s3/u1' });
    });

    describe("stepping through a message's images", () => {
        const many = (count: number) =>
            Array.from({ length: count }, (_, i) => sent(`u${i}`, `https://s3/u${i}-thumb`));
        const viewerSrc = () =>
            (screen.getByRole('dialog').querySelector('img[data-current]') as HTMLImageElement).getAttribute('src');

        it('opens at the tapped image and steps to the next one', () => {
            render(<MessageImages uploads={many(3)} chatId="ch1:5" cid="c" align="start" />);

            fireEvent.click(screen.getByRole('button', { name: 'chat.attach.tile:2' }));
            expect(viewerSrc()).toBe('https://s3/u1');
            expect(screen.getByText('2 / 3')).toBeInTheDocument();

            fireEvent.click(screen.getByRole('button', { name: 'chat.attach.viewerNext' }));
            expect(viewerSrc()).toBe('https://s3/u2');
        });

        // The tiles show four and a "+n"; the viewer still reaches the ones behind it.
        it('reaches the images hidden behind the "+n" tile', () => {
            render(<MessageImages uploads={many(6)} chatId="ch1:5" cid="c" align="start" />);

            fireEvent.click(screen.getByRole('button', { name: 'chat.attach.tile:4' }));
            expect(screen.getByText('4 / 6')).toBeInTheDocument();
            fireEvent.click(screen.getByRole('button', { name: 'chat.attach.viewerNext' }));
            fireEvent.click(screen.getByRole('button', { name: 'chat.attach.viewerNext' }));

            expect(viewerSrc()).toBe('https://s3/u5');
        });

        it('skips a broken image instead of showing a blank page', () => {
            const uploads = [
                sent('u0', 'https://s3/t0'),
                { id: 'u1', status: 'failed' } as Uploads[number],
                sent('u2', 'https://s3/t2'),
            ];
            render(<MessageImages uploads={uploads} chatId="ch1:5" cid="c" align="start" />);

            fireEvent.click(screen.getByRole('button', { name: 'chat.attach.tile:1' }));
            expect(screen.getByText('1 / 2')).toBeInTheDocument();
            fireEvent.click(screen.getByRole('button', { name: 'chat.attach.viewerNext' }));

            expect(viewerSrc()).toBe('https://s3/u2');
        });
    });
});
