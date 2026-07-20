import { fireEvent, render, screen } from '@testing-library/react';

import { ChatRoomHeader } from './ChatRoomHeader';

describe('ChatRoomHeader', () => {
    it('renders the title and fires back / more handlers', () => {
        const onBack = jest.fn();
        const onMore = jest.fn();
        render(<ChatRoomHeader title="친구 이름" onBack={onBack} onMore={onMore} />);

        expect(screen.getByText('친구 이름')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Back' }));
        fireEvent.click(screen.getByRole('button', { name: 'More' }));

        expect(onBack).toHaveBeenCalledTimes(1);
        expect(onMore).toHaveBeenCalledTimes(1);
    });

    it('hides back / more buttons when handlers are omitted', () => {
        render(<ChatRoomHeader title="친구 이름" />);

        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    describe('group kind (default)', () => {
        it('renders the room name with a group-glyph fallback avatar', () => {
            const { container } = render(<ChatRoomHeader kind="group" title="개발 모임방" />);

            expect(screen.getByText('개발 모임방')).toBeInTheDocument();
            // The group fallback avatar renders a glyph in the leading slot.
            expect(container.querySelector('svg')).toBeInTheDocument();
        });

        it('uses a host-supplied avatar node when provided', () => {
            render(<ChatRoomHeader kind="group" title="개발 모임방" avatar={<span>THUMB</span>} />);

            expect(screen.getByText('THUMB')).toBeInTheDocument();
        });
    });

    describe('moreMenu', () => {
        it('renders the ⋯ button as a dropdown trigger (not calling onMore)', () => {
            const onMore = jest.fn();
            render(<ChatRoomHeader title="개발 모임방" onMore={onMore} moreMenu={<div>menu</div>} />);

            const moreButton = screen.getByRole('button', { name: 'More' });
            expect(moreButton).toHaveAttribute('aria-haspopup', 'menu');

            fireEvent.click(moreButton);
            // moreMenu takes precedence — the plain onMore callback must not fire.
            expect(onMore).not.toHaveBeenCalled();
        });
    });

    describe('direct kind', () => {
        it('renders the host-supplied peer avatar', () => {
            render(<ChatRoomHeader kind="direct" title="친구 이름" avatar={<span>PEER</span>} />);

            expect(screen.getByText('PEER')).toBeInTheDocument();
        });

        it('falls back to a default avatar glyph when no peer avatar is supplied', () => {
            const { container } = render(<ChatRoomHeader kind="direct" title="친구 이름" />);

            expect(container.querySelector('svg')).toBeInTheDocument();
        });
    });
});
