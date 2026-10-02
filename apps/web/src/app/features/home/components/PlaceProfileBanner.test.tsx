import '@testing-library/jest-dom';

import { fireEvent, render, screen } from '@testing-library/react';

import { PlaceProfileBanner } from './PlaceProfileBanner';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (k: string, options?: { place?: string }) => (options?.place ? `${k}:${options.place}` : k),
    }),
}));

const mockSetMyPlaceProfile = jest.fn();
jest.mock('../../../hooks', () => ({
    useActivePlaceName: () => 'Studio',
    useSetMyPlaceProfile: () => mockSetMyPlaceProfile,
}));
jest.mock('@chatic/web-ui-kit', () => ({
    ProfileAvatar: () => <span data-testid="avatar" />,
    PromoBanner: ({
        title,
        actionLabel,
        onAction,
        onDismiss,
    }: {
        title: string;
        actionLabel?: string;
        onAction?: () => void;
        onDismiss?: () => void;
    }) => (
        <div data-testid="card">
            <p>{title}</p>
            <button onClick={onAction}>{actionLabel}</button>
            <button onClick={onDismiss}>dismiss</button>
        </div>
    ),
}));
// The form is the shared create dialog; this suite only needs to open it and finish or leave it.
jest.mock('../../../ui/components/PlaceProfileCreateDialog', () => ({
    PlaceProfileCreateDialog: ({
        open,
        placeName,
        onDone,
        onExit,
        exit,
        dismissible,
    }: {
        open: boolean;
        placeName: string;
        onDone: () => void;
        onExit: () => void;
        exit?: object;
        dismissible?: boolean;
    }) =>
        open ? (
            <div
                data-testid="form"
                data-place={placeName}
                data-has-exit-guard={String(!!exit)}
                data-dismissible={String(dismissible ?? true)}
            >
                <button onClick={onDone}>save</button>
                <button onClick={onExit}>leave</button>
            </div>
        ) : null,
}));

const onDismiss = jest.fn();
const onSaved = jest.fn();
const renderBanner = (visible = true) =>
    render(<PlaceProfileBanner visible={visible} onDismiss={onDismiss} onSaved={onSaved} className="pb-2" />);

beforeEach(() => jest.clearAllMocks());

describe('PlaceProfileBanner', () => {
    it('names the active place in the card', () => {
        renderBanner();

        expect(screen.getByText('placeProfileBanner.title:Studio')).toBeInTheDocument();
    });

    it('renders nothing while hidden and the form is closed', () => {
        const { container } = renderBanner(false);

        expect(container).toBeEmptyDOMElement();
    });

    it('opens a create form that can be left, with the unsaved-changes guard', () => {
        renderBanner();
        fireEvent.click(screen.getByText('placeProfileBanner.action'));

        const form = screen.getByTestId('form');
        expect(form).toHaveAttribute('data-place', 'Studio');
        expect(form).toHaveAttribute('data-dismissible', 'true');
        expect(form).toHaveAttribute('data-has-exit-guard', 'true');

        fireEvent.click(screen.getByText('leave'));
        expect(screen.queryByTestId('form')).not.toBeInTheDocument();
        expect(onSaved).not.toHaveBeenCalled();
    });

    // A save writes my nick to the cache before the server answers, which hides the card. The form
    // has to stay up until the save settles, or a failure would vanish with it.
    it('keeps the form open after the card is hidden mid-save', () => {
        const { rerender } = renderBanner();
        fireEvent.click(screen.getByText('placeProfileBanner.action'));

        rerender(<PlaceProfileBanner visible={false} onDismiss={onDismiss} onSaved={onSaved} />);

        expect(screen.queryByTestId('card')).not.toBeInTheDocument();
        expect(screen.getByTestId('form')).toBeInTheDocument();
    });

    it('reports a save and closes the form', () => {
        renderBanner();
        fireEvent.click(screen.getByText('placeProfileBanner.action'));
        fireEvent.click(screen.getByText('save'));

        expect(onSaved).toHaveBeenCalledTimes(1);
        expect(screen.queryByTestId('form')).not.toBeInTheDocument();
    });

    it('passes the close button through', () => {
        renderBanner();
        fireEvent.click(screen.getByText('dismiss'));

        expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('puts the gutter on the wrapper, as the cloud promo does', () => {
        const { container } = renderBanner();

        expect((container.firstElementChild as HTMLElement).className).toContain('px-4');
    });
});
