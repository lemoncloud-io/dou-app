import { fireEvent, render, screen } from '@testing-library/react';

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
});
