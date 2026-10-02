import { fireEvent, render, screen } from '@testing-library/react';

import { MessageFileCard } from './MessageFileCard';

const MB = 1024 * 1024;

describe('MessageFileCard', () => {
    it('shows the name with its extension and the size', () => {
        render(<MessageFileCard name="Quarterly report.pdf" size={2.5 * MB} />);

        expect(screen.getByText('Quarterly report')).toBeInTheDocument();
        expect(screen.getByText('.pdf')).toBeInTheDocument();
        expect(screen.getByText('2.5 MB')).toBeInTheDocument();
    });

    // Only the body is clamped; the extension sits outside the clamp, so it can never be cut off.
    it('clamps the name body to two lines and leaves the extension out of the clamp', () => {
        render(<MessageFileCard name={`${'very long name '.repeat(10)}.hwp`} />);

        expect(screen.getByText('.hwp')).not.toHaveClass('line-clamp-2');
        expect(screen.getByText('.hwp').previousElementSibling).toHaveClass('line-clamp-2');
    });

    it('names an upload that carries no name with the fallback label', () => {
        const { container } = render(<MessageFileCard labels={{ untitled: '파일' }} />);
        expect(container.querySelector('[aria-hidden="true"] .line-clamp-2')).toHaveTextContent('파일');
    });

    it('leaves the size out when there is none', () => {
        const { container } = render(<MessageFileCard name="a.txt" />);
        expect(container.textContent).not.toMatch(/KB|MB/);
    });

    it.each([
        ['a.pdf', 'PDF', 'text-destructive'],
        ['a.docx', 'DOC', 'text-point-blue'],
        ['a.xlsx', 'XLS', 'text-glyph-green'],
        ['a.pptx', 'PPT', 'text-glyph-indigo'],
        ['a.hwp', 'HWP', 'text-glyph-cyan'],
        ['a.txt', 'TXT', 'text-description'],
    ])('leads %p with the %p glyph tinted %p', (name, tag, tint) => {
        const { container } = render(<MessageFileCard name={name} />);
        const glyph = container.querySelector('svg') as SVGSVGElement;

        expect(glyph.querySelector('text')?.textContent).toBe(tag);
        expect(glyph.getAttribute('class')).toContain(tint);
    });

    it('leads an unknown format with the untagged generic glyph', () => {
        const { container } = render(<MessageFileCard name="archive.zip" />);
        expect(container.querySelector('svg text')).toBeNull();
    });

    describe('download button', () => {
        it('starts a download from idle', () => {
            const onDownload = jest.fn();
            render(<MessageFileCard name="a.pdf" onDownload={onDownload} />);

            fireEvent.click(screen.getByRole('button', { name: 'Download' }));
            expect(onDownload).toHaveBeenCalledTimes(1);
        });

        // Several cards in a row must not be a list of identical "Download" buttons to a screen reader.
        it('is described by the file it downloads', () => {
            render(<MessageFileCard name="a.pdf" />);
            expect(screen.getByRole('button', { name: 'Download' })).toHaveAccessibleDescription('a.pdf');
        });

        it('has a hit area of at least 44px', () => {
            render(<MessageFileCard name="a.pdf" />);
            expect(screen.getByRole('button', { name: 'Download' })).toHaveClass('size-11');
        });

        it('draws the ring from the progress ratio and cancels on a second press', () => {
            const onCancel = jest.fn();
            const onDownload = jest.fn();
            const { container } = render(
                <MessageFileCard
                    name="a.pdf"
                    download="downloading"
                    progress={0.25}
                    onCancel={onCancel}
                    onDownload={onDownload}
                />
            );

            const [, arc] = Array.from(container.querySelectorAll('[data-progress-ring] circle'));
            const length = Number(arc.getAttribute('stroke-dasharray'));
            expect(Number(arc.getAttribute('stroke-dashoffset'))).toBeCloseTo(length * 0.75);

            fireEvent.click(screen.getByRole('button', { name: 'Cancel download' }));
            expect(onCancel).toHaveBeenCalledTimes(1);
            expect(onDownload).not.toHaveBeenCalled();
        });

        it('turns a spinner instead of the ring while the total is unknown', () => {
            const { container } = render(<MessageFileCard name="a.pdf" download="downloading" />);

            expect(container.querySelector('[data-progress-ring]')).toBeNull();
            expect(
                screen.getByRole('button', { name: 'Cancel download' }).querySelector('.animate-spin')
            ).not.toBeNull();
        });

        it('clamps a ratio past the end to a full ring', () => {
            const { container } = render(<MessageFileCard name="a.pdf" download="downloading" progress={3} />);

            const [, arc] = Array.from(container.querySelectorAll('[data-progress-ring] circle'));
            expect(Number(arc.getAttribute('stroke-dashoffset'))).toBe(0);
        });

        it('opens the downloaded file once done', () => {
            const onOpen = jest.fn();
            const onDownload = jest.fn();
            render(<MessageFileCard name="a.pdf" download="done" onOpen={onOpen} onDownload={onDownload} />);

            fireEvent.click(screen.getByRole('button', { name: 'Open' }));
            expect(onOpen).toHaveBeenCalledTimes(1);
            expect(onDownload).not.toHaveBeenCalled();
        });

        // A shell that cannot save says why there is no button rather than offering one that fails.
        it('swaps the button for the notice where downloading is unavailable', () => {
            render(
                <MessageFileCard
                    name="a.pdf"
                    download="unavailable"
                    labels={{ unavailable: 'Update the app to download' }}
                />
            );

            expect(screen.queryByRole('button', { name: /download|open/i })).not.toBeInTheDocument();
            expect(screen.getByText('Update the app to download')).toBeInTheDocument();
        });

        it('takes translated button names', () => {
            render(<MessageFileCard name="a.pdf" labels={{ download: '다운로드' }} />);
            expect(screen.getByRole('button', { name: '다운로드' })).toBeInTheDocument();
        });
    });

    describe('card body', () => {
        it('hands a tap on the body to the host, apart from the download button', () => {
            const onPress = jest.fn();
            const onDownload = jest.fn();
            render(<MessageFileCard name="a.pdf" onPress={onPress} onDownload={onDownload} />);

            fireEvent.click(screen.getByText('.pdf'));
            expect(onPress).toHaveBeenCalledTimes(1);
            expect(onDownload).not.toHaveBeenCalled();
        });

        // The drawn name is split in two; the body's name must still read as the one file name.
        it('names the body by the whole file name and its size', () => {
            render(<MessageFileCard name="a.pdf" size={2048} onPress={jest.fn()} />);
            expect(screen.getByRole('button', { name: 'a.pdf 2 KB' })).toBeInTheDocument();
        });

        it('is inert without onPress', () => {
            render(<MessageFileCard name="a.pdf" />);
            expect(screen.getAllByRole('button')).toHaveLength(1);
        });
    });

    describe('pending and broken', () => {
        it('draws a sending file from its local name and size, with no download button', () => {
            render(<MessageFileCard name="draft.hwpx" size={300 * 1024} state="sending" download="idle" />);

            expect(screen.getByText('draft')).toBeInTheDocument();
            expect(screen.getByText('300 KB')).toBeInTheDocument();
            expect(screen.getByRole('status', { name: 'Sending' })).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Download' })).not.toBeInTheDocument();
        });

        it('marks a file that failed to send, with no download button', () => {
            render(<MessageFileCard name="draft.hwpx" state="failed" />);

            expect(screen.getByRole('img', { name: "Couldn't send" })).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Download' })).not.toBeInTheDocument();
        });

        it('keeps the body pressable while the file is on its way', () => {
            const onPress = jest.fn();
            render(<MessageFileCard name="draft.hwpx" state="failed" onPress={onPress} />);

            fireEvent.click(screen.getByText('draft'));
            expect(onPress).toHaveBeenCalledTimes(1);
        });

        // The server says the upload is unusable: nothing on the card may promise otherwise.
        it('dims a broken file, says it cannot be opened and offers nothing to press', () => {
            const onPress = jest.fn();
            const { container } = render(
                <MessageFileCard
                    name="a.pdf"
                    size={MB}
                    state="broken"
                    onPress={onPress}
                    labels={{ broken: '열 수 없음' }}
                />
            );

            expect(container.firstChild).toHaveClass('opacity-50');
            expect(screen.getByText('열 수 없음')).toBeInTheDocument();
            expect(screen.queryByText('1 MB')).not.toBeInTheDocument();
            expect(screen.queryByRole('button')).not.toBeInTheDocument();
        });
    });
});
