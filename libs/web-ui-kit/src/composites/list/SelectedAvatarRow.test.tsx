import { act, fireEvent, render, screen } from '@testing-library/react';

import { SelectedAvatarRow } from './SelectedAvatarRow';

const items = [
    { id: 'a', name: 'Alice' },
    { id: 'b', name: 'Bob' },
];

describe('SelectedAvatarRow', () => {
    it('renders one entry per item', () => {
        render(<SelectedAvatarRow items={items} onRemove={jest.fn()} removeLabel="Remove" />);
        expect(screen.getByText('Alice')).toBeInTheDocument();
        expect(screen.getByText('Bob')).toBeInTheDocument();
    });

    it('calls onRemove with the item id when its badge is tapped', () => {
        const onRemove = jest.fn();
        render(<SelectedAvatarRow items={items} onRemove={onRemove} removeLabel="Remove" />);
        fireEvent.click(screen.getByRole('button', { name: 'Remove: Bob' }));
        expect(onRemove).toHaveBeenCalledWith('b');
    });

    it('renders nothing when empty', () => {
        const { container } = render(<SelectedAvatarRow items={[]} onRemove={jest.fn()} />);
        expect(container).toBeEmptyDOMElement();
    });

    describe('exit transition', () => {
        beforeEach(() => jest.useFakeTimers());
        afterEach(() => jest.useRealTimers());

        it('keeps a dropped item mounted (fading out) until the exit transition elapses', () => {
            const { rerender } = render(<SelectedAvatarRow items={items} onRemove={jest.fn()} />);

            rerender(<SelectedAvatarRow items={[items[0]]} onRemove={jest.fn()} />);

            expect(screen.getByText('Bob')).toBeInTheDocument();

            act(() => jest.advanceTimersByTime(150));
            expect(screen.queryByText('Bob')).not.toBeInTheDocument();
        });
    });
});
