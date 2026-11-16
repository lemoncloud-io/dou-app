import { fireEvent, render, screen } from '@testing-library/react';

import { RoomFilesTabs } from './RoomFilesTabs';

const tabs = [
    { key: 'media', label: 'Photos' },
    { key: 'file', label: 'Files' },
    { key: 'audio', label: 'Audio', count: 3 },
    { key: 'link', label: 'Links' },
];

describe('RoomFilesTabs', () => {
    it('renders a tablist with the selected tab marked', () => {
        render(<RoomFilesTabs tabs={tabs} value="audio" onChange={jest.fn()} />);

        expect(screen.getByRole('tablist')).toBeInTheDocument();
        expect(screen.getAllByRole('tab')).toHaveLength(4);
        expect(screen.getByRole('tab', { name: 'Audio 3' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('tab', { name: 'Files' })).toHaveAttribute('aria-selected', 'false');
    });

    it('draws a count only when one is given', () => {
        render(
            <RoomFilesTabs
                tabs={[
                    { key: 'a', label: 'Audio', count: 0 },
                    { key: 'b', label: 'Links' },
                ]}
                value="a"
                onChange={jest.fn()}
            />
        );

        expect(screen.getByRole('tab', { name: 'Audio 0' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Links' })).toBeInTheDocument();
    });

    it('switches on click, and not when the tab is already selected', () => {
        const onChange = jest.fn();
        render(<RoomFilesTabs tabs={tabs} value="audio" onChange={onChange} />);

        fireEvent.click(screen.getByRole('tab', { name: 'Links' }));
        fireEvent.click(screen.getByRole('tab', { name: 'Audio 3' }));
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith('link');
    });

    it('moves with the arrow keys and wraps', () => {
        const onChange = jest.fn();
        render(<RoomFilesTabs tabs={tabs} value="link" onChange={onChange} />);

        fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });
        fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowLeft' });
        expect(onChange).toHaveBeenNthCalledWith(1, 'media');
        expect(onChange).toHaveBeenNthCalledWith(2, 'audio');
    });

    it('does not switch while dimmed for selection mode', () => {
        const onChange = jest.fn();
        render(<RoomFilesTabs tabs={tabs} value="audio" onChange={onChange} dimmed />);

        expect(screen.getByRole('tablist')).toHaveAttribute('aria-disabled', 'true');
        const links = screen.getByRole('tab', { name: 'Links' });
        expect(links).toBeDisabled();
        fireEvent.click(links);
        fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });
        expect(onChange).not.toHaveBeenCalled();
        // The selection is still reported, so the reader knows which list is being picked from.
        expect(screen.getByRole('tab', { name: 'Audio 3' })).toHaveAttribute('aria-selected', 'true');
    });
});
