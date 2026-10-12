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

    // If the host's placeholder name ("Unnamed channel") flashes before the channel has loaded,
    // it reads as if a different room opened — so we just hold the spot and show the name once it's settled.
    describe('loading', () => {
        it('holds back the invented title and the meta row', () => {
            render(<ChatRoomHeader loading title="이름 없는 채널" meta={<span>MEMBERS</span>} onBack={jest.fn()} />);

            expect(screen.queryByText('이름 없는 채널')).not.toBeInTheDocument();
            expect(screen.queryByText('MEMBERS')).not.toBeInTheDocument();
        });

        // The way out has to stay open even while loading.
        it('keeps the back button reachable', () => {
            const onBack = jest.fn();
            render(<ChatRoomHeader loading onBack={onBack} />);

            fireEvent.click(screen.getByRole('button', { name: 'Back' }));

            expect(onBack).toHaveBeenCalledTimes(1);
        });

        it('shows the real title once loading clears', () => {
            const { rerender } = render(<ChatRoomHeader loading title="개발 모임방" />);
            expect(screen.queryByText('개발 모임방')).not.toBeInTheDocument();

            rerender(<ChatRoomHeader title="개발 모임방" />);

            expect(screen.getByText('개발 모임방')).toBeInTheDocument();
        });
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

    describe('meta slot', () => {
        it('renders the meta node under the title when provided (group)', () => {
            render(<ChatRoomHeader kind="group" title="개발 모임방" meta={<span>메타 스택</span>} />);

            expect(screen.getByText('개발 모임방')).toBeInTheDocument();
            expect(screen.getByText('메타 스택')).toBeInTheDocument();
        });

        it('stays a single line (no meta rendered) when meta is omitted', () => {
            render(<ChatRoomHeader kind="direct" title="친구 이름" />);

            expect(screen.queryByText('메타 스택')).not.toBeInTheDocument();
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

    describe('self kind', () => {
        it('falls back to the self solid-silhouette glyph (viewBox 0 0 42 42) with a ring', () => {
            const { container } = render(<ChatRoomHeader kind="self" title="나와의 채팅" />);

            // The self fallback avatar uses the custom solid-person glyph, not the lucide outline.
            expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 42 42');
        });
    });

    // Figma 4718:22183 — a thread's header names the SCREEN, and pairing that with the
    // channel's face would claim the screen is the channel.
    it('hideAvatar drops both the avatar node and the fallback glyph', () => {
        const { container, rerender } = render(<ChatRoomHeader title="스레드" hideAvatar />);
        expect(container.querySelector('svg')).toBeNull();

        rerender(<ChatRoomHeader title="스레드" hideAvatar avatar={<img alt="" data-testid="thumb" src="x.png" />} />);
        expect(screen.queryByTestId('thumb')).not.toBeInTheDocument();
        expect(screen.getByText('스레드')).toBeInTheDocument();
    });

    it('hideAvatar also drops the loading placeholder', () => {
        const { container } = render(<ChatRoomHeader title="스레드" hideAvatar loading />);

        expect(container.querySelector('[class*="size-[42px]"]')).toBeNull();
    });

    // A 1:1 room's avatar and name stand for the peer, so the host can make them open the profile.
    describe('onIdentityClick', () => {
        it('turns the avatar + title zone into one labelled button', () => {
            const onIdentityClick = jest.fn();
            render(
                <ChatRoomHeader
                    kind="direct"
                    title="친구 이름"
                    avatar={<span>PEER</span>}
                    onIdentityClick={onIdentityClick}
                    identityLabel="Open profile"
                />
            );

            const button = screen.getByRole('button', { name: 'Open profile' });
            expect(button).toContainElement(screen.getByText('PEER'));
            expect(button).toContainElement(screen.getByText('친구 이름'));

            fireEvent.click(button);
            expect(onIdentityClick).toHaveBeenCalledTimes(1);
        });

        // A button may hold phrasing content only; a <div> or <p> inside it is invalid HTML.
        it('holds no block elements of its own inside the button', () => {
            render(
                <ChatRoomHeader
                    kind="direct"
                    title="Peer"
                    avatar={<span>PEER</span>}
                    meta={<span>META</span>}
                    onIdentityClick={jest.fn()}
                    identityLabel="Open profile"
                />
            );

            expect(screen.getByRole('button', { name: 'Open profile' }).querySelector('div, p')).toBeNull();
        });

        // Nothing is resolved yet, so there is nothing to open.
        it('stays inert while loading', () => {
            render(
                <ChatRoomHeader loading title="친구 이름" onIdentityClick={jest.fn()} identityLabel="Open profile" />
            );

            expect(screen.queryByRole('button', { name: 'Open profile' })).not.toBeInTheDocument();
        });

        it('wins over onMetaClick, since a button cannot hold another one', () => {
            const onMetaClick = jest.fn();
            render(
                <ChatRoomHeader
                    title="친구 이름"
                    meta={<span>MEMBERS</span>}
                    onIdentityClick={jest.fn()}
                    identityLabel="Open profile"
                    onMetaClick={onMetaClick}
                    metaLabel="Open members"
                />
            );

            expect(screen.queryByRole('button', { name: 'Open members' })).not.toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Open profile' })).toContainElement(screen.getByText('MEMBERS'));
        });
    });

    describe('onMetaClick', () => {
        it('makes only the meta row a button, leaving the title inert', () => {
            const onMetaClick = jest.fn();
            render(
                <ChatRoomHeader
                    title="개발 모임방"
                    meta={<span>MEMBERS</span>}
                    onMetaClick={onMetaClick}
                    metaLabel="Open members"
                />
            );

            const button = screen.getByRole('button', { name: 'Open members' });
            expect(button).toContainElement(screen.getByText('MEMBERS'));
            expect(button).not.toContainElement(screen.getByText('개발 모임방'));

            fireEvent.click(button);
            expect(onMetaClick).toHaveBeenCalledTimes(1);
        });

        it('draws no button when there is no meta to press', () => {
            render(<ChatRoomHeader title="개발 모임방" onMetaClick={jest.fn()} metaLabel="Open members" />);

            expect(screen.queryByRole('button')).not.toBeInTheDocument();
        });
    });
});
