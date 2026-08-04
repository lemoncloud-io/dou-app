import '@testing-library/jest-dom';

import { render, screen } from '@testing-library/react';

import { CloudPromoBanner } from './CloudPromoBanner';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

let isVisible = true;
const dismiss = jest.fn();
jest.mock('../hooks/useCloudPromo', () => ({ useCloudPromo: () => ({ isVisible, dismiss }) }));

beforeEach(() => {
    jest.clearAllMocks();
    isVisible = true;
});

describe('CloudPromoBanner', () => {
    it('puts the horizontal gutter on a wrapper as PADDING, never as a margin on the card', () => {
        // The card is `w-full`. A margin on it would resolve to 100% + gutter and push the whole
        // page into a horizontal scroll — the bug this structure exists to prevent.
        const { container } = render(<CloudPromoBanner className="pb-2" />);

        const wrapper = container.firstElementChild as HTMLElement;
        expect(wrapper.className).toContain('px-4');
        expect(wrapper.className).toContain('pb-2');

        const card = wrapper.firstElementChild as HTMLElement;
        expect(card.className).toContain('w-full');
        // No mx-*/ml-*/mr-* on a full-width box.
        expect(card.className).not.toMatch(/\bm[xlr]-/);
    });

    it('renders nothing at all when hidden, so the gutter leaves no empty box', () => {
        isVisible = false;

        const { container } = render(<CloudPromoBanner className="pb-2" />);

        expect(container).toBeEmptyDOMElement();
    });

    it('offers the action link only when a handler is supplied', () => {
        const { rerender } = render(<CloudPromoBanner />);
        expect(screen.queryByRole('button', { name: /cloudPromo\.action/ })).not.toBeInTheDocument();

        rerender(<CloudPromoBanner onAddCloud={jest.fn()} />);
        expect(screen.getByRole('button', { name: /cloudPromo\.action/ })).toBeInTheDocument();
    });
});
