import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import { LinkedText } from './LinkedText';
import { openExternalUrl } from '../utils/openExternalUrl';

jest.mock('../utils/openExternalUrl', () => ({
    openExternalUrl: jest.fn(),
}));

describe('LinkedText', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('renders plain text without any anchor', () => {
        render(<LinkedText text="링크 없는 메시지" />);

        expect(screen.getByText('링크 없는 메시지')).toBeInTheDocument();
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    it('renders each URL as an anchor with a matching href', () => {
        render(<LinkedText text="a https://one.com b https://two.com/x" />);

        const links = screen.getAllByRole('link');
        expect(links.map(link => link.getAttribute('href'))).toEqual(['https://one.com', 'https://two.com/x']);
        expect(links[0]).toHaveTextContent('https://one.com');
    });

    it('opens in a new context and does not leak the referrer', () => {
        render(<LinkedText text="https://example.com/a" />);

        const link = screen.getByRole('link');
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noreferrer noopener');
    });

    it('routes a click through openExternalUrl instead of the anchor default', () => {
        render(<LinkedText text="보세요 https://example.com/a" />);

        const event = fireEvent.click(screen.getByRole('link'));

        // fireEvent returns false when a listener called preventDefault.
        expect(event).toBe(false);
        expect(openExternalUrl).toHaveBeenCalledWith('https://example.com/a');
    });

    it('uses the onUrlClick override when given', () => {
        const onUrlClick = jest.fn();
        render(<LinkedText text="https://example.com/a" onUrlClick={onUrlClick} />);

        fireEvent.click(screen.getByRole('link'));

        expect(onUrlClick).toHaveBeenCalledWith('https://example.com/a');
        expect(openExternalUrl).not.toHaveBeenCalled();
    });

    it('leaves a URL cut by truncation as plain text', () => {
        const cut = '보세요 https://example.com/very/long/pa';
        render(<LinkedText text={cut} truncated />);

        expect(screen.queryByRole('link')).not.toBeInTheDocument();
        expect(screen.getByText(cut)).toBeInTheDocument();
    });

    it('links the same URL once the text is no longer truncated', () => {
        render(<LinkedText text="보세요 https://example.com/very/long/pa" />);

        expect(screen.getByRole('link')).toHaveAttribute('href', 'https://example.com/very/long/pa');
    });
});
