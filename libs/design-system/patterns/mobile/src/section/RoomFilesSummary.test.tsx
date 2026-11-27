import { fireEvent, render, screen } from '@testing-library/react';

import { RoomFilesSummary, type RoomFilesSummaryItem } from './RoomFilesSummary';

const items: RoomFilesSummaryItem[] = [
    { key: 'media', label: 'Photos', count: 128 },
    { key: 'file', label: 'Files', count: 12 },
    { key: 'audio', label: 'Audio', count: 3, accent: true },
    { key: 'link', label: 'Links', count: 24 },
];

describe('RoomFilesSummary', () => {
    it('renders the titled section with a cell per kind, label and count', () => {
        render(<RoomFilesSummary items={items} onSelect={jest.fn()} />);

        expect(screen.getByRole('region', { name: 'Room files' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Room files' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Photos 128' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Audio 3' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Links 24' })).toBeInTheDocument();
    });

    it('reports the pressed cell by key', () => {
        const onSelect = jest.fn();
        render(<RoomFilesSummary items={items} onSelect={onSelect} />);

        fireEvent.click(screen.getByRole('button', { name: 'Files 12' }));
        expect(onSelect).toHaveBeenCalledWith('file');
    });

    it('draws "See all" only with a handler, and fires it', () => {
        const onSeeAll = jest.fn();
        const { rerender } = render(<RoomFilesSummary items={items} onSelect={jest.fn()} />);
        expect(screen.queryByRole('button', { name: 'See all' })).not.toBeInTheDocument();

        rerender(<RoomFilesSummary items={items} onSelect={jest.fn()} onSeeAll={onSeeAll} seeAllLabel="View all" />);
        fireEvent.click(screen.getByRole('button', { name: 'View all' }));
        expect(onSeeAll).toHaveBeenCalledTimes(1);
    });

    it('shows placeholders instead of counts while loading', () => {
        render(<RoomFilesSummary items={items} onSelect={jest.fn()} loading />);

        expect(screen.getByRole('region')).toHaveAttribute('aria-busy', 'true');
        expect(screen.getAllByTestId('count-placeholder')).toHaveLength(4);
        expect(screen.queryByText('128')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Photos' })).toBeInTheDocument();
    });

    it('uses a host icon in place of the default', () => {
        render(
            <RoomFilesSummary
                items={[{ key: 'link', label: 'Links', count: 1, icon: <svg data-testid="custom" /> }]}
                onSelect={jest.fn()}
            />
        );

        expect(screen.getByTestId('custom')).toBeInTheDocument();
    });
});
