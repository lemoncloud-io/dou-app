import { fireEvent, render, screen } from '@testing-library/react';

import { PickedFileStrip, type PickedFileItem } from './PickedFileStrip';

const MB = 1024 * 1024;

const files: PickedFileItem[] = [
    { id: 'a', name: 'Quarterly report.pdf', size: 2.5 * MB },
    { id: 'b', name: '회의록.hwp', size: 320 * 1024 },
];

describe('PickedFileStrip', () => {
    it('draws nothing while nothing waits', () => {
        const { container } = render(<PickedFileStrip files={[]} onRemove={jest.fn()} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('shows one chip per file, in order, with its name, extension and size', () => {
        const { container } = render(<PickedFileStrip files={files} onRemove={jest.fn()} />);

        const chips = container.querySelectorAll('[data-picked-file]');
        expect(chips).toHaveLength(2);
        expect(chips[0]).toHaveTextContent('Quarterly report');
        expect(screen.getByText('.pdf')).toBeInTheDocument();
        expect(screen.getByText('2.5 MB')).toBeInTheDocument();
        expect(screen.getByText('320 KB')).toBeInTheDocument();
    });

    // The body truncates; the extension sits outside it, so two files that differ only in kind stay apart.
    it('truncates the name body and never the extension', () => {
        render(<PickedFileStrip files={[{ id: 'a', name: `${'long '.repeat(20)}.docx` }]} onRemove={jest.fn()} />);

        expect(screen.getByText('.docx')).not.toHaveClass('truncate');
        expect(screen.getByText('.docx').previousElementSibling).toHaveClass('truncate');
    });

    it('leaves the size out when there is none', () => {
        const { container } = render(<PickedFileStrip files={[{ id: 'a', name: 'a.txt' }]} onRemove={jest.fn()} />);
        expect(container.textContent).not.toMatch(/KB|MB/);
    });

    it('hands the file id to onRemove from its own remove button', () => {
        const onRemove = jest.fn();
        render(<PickedFileStrip files={files} onRemove={onRemove} />);

        fireEvent.click(screen.getByRole('button', { name: 'Remove 회의록.hwp' }));
        expect(onRemove).toHaveBeenCalledWith('b');
    });

    it('names the remove buttons with the host label, by name and position', () => {
        render(
            <PickedFileStrip
                files={files}
                onRemove={jest.fn()}
                removeLabel={(name, position) => `${position}: ${name} 빼기`}
            />
        );
        expect(screen.getByRole('button', { name: '1: Quarterly report.pdf 빼기' })).toBeInTheDocument();
    });

    it('reads as a named group when given a label', () => {
        render(<PickedFileStrip files={files} onRemove={jest.fn()} label="보낼 파일" />);
        expect(screen.getByRole('group', { name: '보낼 파일' })).toBeInTheDocument();
    });

    it('tints each chip by the file kind, as the feed card does', () => {
        const { container } = render(
            <PickedFileStrip
                files={[
                    { id: 'a', name: 'a.xlsx' },
                    { id: 'b', name: 'clip.mp4' },
                ]}
                onRemove={jest.fn()}
            />
        );
        const glyphs = container.querySelectorAll('[data-picked-file] > svg');
        expect(glyphs[0].getAttribute('class')).toContain('text-glyph-green');
        // Anything the card has no family for is the generic, untagged glyph.
        expect(glyphs[1].querySelector('text')).toBeNull();
    });
});
