import { fireEvent, render, screen } from '@testing-library/react';

import { LinkPreviewCard } from './LinkPreviewCard';

const baseProps = {
    url: 'https://example.com/post/1',
    title: 'Hello',
};

describe('LinkPreviewCard', () => {
    it('links to the previewed URL in a new context', () => {
        render(<LinkPreviewCard {...baseProps} />);

        const link = screen.getByRole('link');
        expect(link).toHaveAttribute('href', 'https://example.com/post/1');
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noreferrer noopener');
    });

    it('renders only the fields it was given', () => {
        render(<LinkPreviewCard {...baseProps} />);

        expect(screen.getByText('Hello')).toBeTruthy();
        expect(screen.queryByRole('img')).toBeNull();
    });

    it('shows the publisher name and snippet when present', () => {
        render(<LinkPreviewCard {...baseProps} siteName="Example" description="A snippet" />);

        expect(screen.getByText('Example')).toBeTruthy();
        expect(screen.getByText('A snippet')).toBeTruthy();
    });

    it('loads the thumbnail lazily and without a referrer', () => {
        render(<LinkPreviewCard {...baseProps} imageUrl="https://cdn.example.com/a.png" />);

        const image = screen.getByRole('presentation');
        expect(image).toHaveAttribute('src', 'https://cdn.example.com/a.png');
        expect(image).toHaveAttribute('loading', 'lazy');
        expect(image).toHaveAttribute('referrerpolicy', 'no-referrer');
    });

    it('drops a thumbnail that fails to load rather than showing a broken glyph', () => {
        render(<LinkPreviewCard {...baseProps} imageUrl="https://cdn.example.com/gone.png" />);

        fireEvent.error(screen.getByRole('presentation'));

        expect(screen.queryByRole('presentation')).toBeNull();
        expect(screen.getByText('Hello')).toBeTruthy();
    });

    it('hands taps to the host so it can route the link itself', () => {
        const onPress = jest.fn();
        render(<LinkPreviewCard {...baseProps} onPress={onPress} />);

        fireEvent.click(screen.getByRole('link'));

        expect(onPress).toHaveBeenCalledTimes(1);
    });
});
