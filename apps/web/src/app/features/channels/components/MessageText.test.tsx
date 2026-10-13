import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import { MessageText } from './MessageText';
import type { MentionMarks } from '../utils/mentionHighlight';
import { openExternalUrl } from '../utils/openExternalUrl';

jest.mock('../utils/openExternalUrl', () => ({
    openExternalUrl: jest.fn(),
}));

describe('MessageText', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('renders plain text without any anchor', () => {
        render(<MessageText text="링크 없는 메시지" />);

        expect(screen.getByText('링크 없는 메시지')).toBeInTheDocument();
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    it('renders each URL as an anchor with a matching href', () => {
        render(<MessageText text="a https://one.com b https://two.com/x" />);

        const links = screen.getAllByRole('link');
        expect(links.map(link => link.getAttribute('href'))).toEqual(['https://one.com', 'https://two.com/x']);
        expect(links[0]).toHaveTextContent('https://one.com');
    });

    it('opens in a new context and does not leak the referrer', () => {
        render(<MessageText text="https://example.com/a" />);

        const link = screen.getByRole('link');
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noreferrer noopener');
    });

    it('routes a click through openExternalUrl instead of the anchor default', () => {
        render(<MessageText text="보세요 https://example.com/a" />);

        const event = fireEvent.click(screen.getByRole('link'));

        // fireEvent returns false when a listener called preventDefault.
        expect(event).toBe(false);
        expect(openExternalUrl).toHaveBeenCalledWith('https://example.com/a');
    });

    it('uses the onUrlClick override when given', () => {
        const onUrlClick = jest.fn();
        render(<MessageText text="https://example.com/a" onUrlClick={onUrlClick} />);

        fireEvent.click(screen.getByRole('link'));

        expect(onUrlClick).toHaveBeenCalledWith('https://example.com/a');
        expect(openExternalUrl).not.toHaveBeenCalled();
    });

    it('leaves a URL cut by truncation as plain text', () => {
        const cut = '보세요 https://example.com/very/long/pa';
        render(<MessageText text={cut} truncated />);

        expect(screen.queryByRole('link')).not.toBeInTheDocument();
        expect(screen.getByText(cut)).toBeInTheDocument();
    });

    it('links the same URL once the text is no longer truncated', () => {
        render(<MessageText text="보세요 https://example.com/very/long/pa" />);

        expect(screen.getByRole('link')).toHaveAttribute('href', 'https://example.com/very/long/pa');
    });
    describe('mentions', () => {
        const marks = (fields: Partial<MentionMarks> = {}): MentionMarks => ({
            words: ['@레인', '@Minsu', '@channel'],
            self: [],
            own: false,
            people: new Map([['@minsu', { id: 'u2', name: 'Minsu' }]]),
            ...fields,
        });
        const mentionSpan = (container: HTMLElement, word: string) =>
            Array.from(container.querySelectorAll('span, button')).find(node => node.textContent === word);

        it('draws every mention word and leaves the rest as text', () => {
            const { container } = render(<MessageText text="hi @Minsu and @channel" mentions={marks()} />);

            expect(mentionSpan(container, '@Minsu')).toHaveClass('text-brand-ink');
            expect(mentionSpan(container, '@channel')).toHaveClass('text-brand-ink');
            expect(container).toHaveTextContent('hi @Minsu and @channel');
        });

        it('draws a mention of me louder than one of anybody else', () => {
            const { container } = render(
                <MessageText text="@레인 @Minsu" mentions={marks({ self: ['@레인', '@channel'] })} />
            );

            expect(mentionSpan(container, '@레인')).toHaveClass('bg-warning/30');
            expect(mentionSpan(container, '@Minsu')).toHaveClass('text-brand-ink');
        });

        // My bubble is dark; the blue of a light bubble would not read on it.
        it('draws the mentions on my own message in a colour that reads on my bubble', () => {
            const { container } = render(<MessageText text="@Minsu hello" mentions={marks({ own: true })} />);

            expect(mentionSpan(container, '@Minsu')).toHaveClass('text-primary');
        });

        it('opens the member a mention names on a tap, and nothing for an everyone word', () => {
            const onMentionClick = jest.fn();
            render(<MessageText text="@Minsu @channel" mentions={marks()} onMentionClick={onMentionClick} />);

            fireEvent.click(screen.getByRole('button', { name: '@Minsu' }));

            expect(onMentionClick).toHaveBeenCalledWith({ id: 'u2', name: 'Minsu' });
            expect(screen.queryByRole('button', { name: '@channel' })).not.toBeInTheDocument();
        });

        it('draws a mention as text when nothing opens it', () => {
            render(<MessageText text="@Minsu" mentions={marks()} />);

            expect(screen.queryByRole('button')).not.toBeInTheDocument();
        });

        // A name inside a link or a code span belongs to that link or that code.
        it('does not mark a word inside a link or a code span', () => {
            const { container } = render(<MessageText text="`@레인` https://x.test/@레인 @레인" mentions={marks()} />);

            expect(Array.from(container.querySelectorAll('span')).map(span => span.textContent)).toEqual(['@레인']);
        });

        it('marks nothing without words to mark', () => {
            const { container } = render(<MessageText text="hi @레인" />);

            expect(container.querySelectorAll('span')).toHaveLength(0);
        });
    });
});
