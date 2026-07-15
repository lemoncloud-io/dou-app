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
        it('renders only the room name, with no avatar', () => {
            const { container } = render(<ChatRoomHeader kind="group" title="개발 모임방" />);

            expect(screen.getByText('개발 모임방')).toBeInTheDocument();
            expect(container.querySelector('svg')).not.toBeInTheDocument();
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
