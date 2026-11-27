import { fireEvent, render, screen } from '@testing-library/react';

import { RoomFilesHeader } from './RoomFilesHeader';

const props = () => ({
    title: 'Room files',
    onBack: jest.fn(),
    onSearch: jest.fn(),
    actionLabel: 'Select',
    onAction: jest.fn(),
});

describe('RoomFilesHeader', () => {
    it('names the screen and fires back, search and the action', () => {
        const p = props();
        render(<RoomFilesHeader {...p} />);
        expect(screen.getByRole('heading', { name: 'Room files' })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Back' }));
        fireEvent.click(screen.getByRole('button', { name: 'Search' }));
        fireEvent.click(screen.getByRole('button', { name: 'Select' }));
        expect(p.onBack).toHaveBeenCalledTimes(1);
        expect(p.onSearch).toHaveBeenCalledTimes(1);
        expect(p.onAction).toHaveBeenCalledTimes(1);
    });

    it('says when the search is open, and leaves the button out without a handler', () => {
        const { rerender } = render(<RoomFilesHeader {...props()} searchActive />);
        expect(screen.getByRole('button', { name: 'Search' })).toHaveAttribute('aria-pressed', 'true');
        rerender(<RoomFilesHeader {...props()} onSearch={undefined} />);
        expect(screen.queryByRole('button', { name: 'Search' })).toBeNull();
    });

    it('keeps the action from firing while it is disabled', () => {
        const p = props();
        render(<RoomFilesHeader {...p} actionDisabled />);
        const action = screen.getByRole('button', { name: 'Select' });
        expect(action).toBeDisabled();
        fireEvent.click(action);
        expect(p.onAction).not.toHaveBeenCalled();
    });

    it('takes host labels', () => {
        render(<RoomFilesHeader {...props()} backLabel="뒤로" searchLabel="검색" actionLabel="선택" />);
        expect(screen.getByRole('button', { name: '뒤로' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '검색' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '선택' })).toBeInTheDocument();
    });
});
