import { act, fireEvent, render, screen } from '@testing-library/react';

import { ROOM_FILE_LONG_PRESS_MS, RoomFileRow } from './RoomFileRow';

const title = 'New recording 8.m4a';
const subtitle = 'Sunny · Nov 11 · 35:47 · 17.0MB';

const pointer = (type: string, target: Element, clientX: number, clientY: number) =>
    fireEvent(target, new MouseEvent(type, { bubbles: true, clientX, clientY }));

describe('RoomFileRow', () => {
    afterEach(() => {
        jest.useRealTimers();
    });

    it('renders the title, subtitle, play button and more button', () => {
        const onToggle = jest.fn();
        const onMore = jest.fn();
        render(
            <RoomFileRow
                leading={{ kind: 'play', playing: false, onToggle }}
                title={title}
                subtitle={subtitle}
                onMore={onMore}
            />
        );

        expect(screen.getByText(title)).toBeInTheDocument();
        expect(screen.getByText(subtitle)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Play' }));
        fireEvent.click(screen.getByRole('button', { name: 'More options' }));
        expect(onToggle).toHaveBeenCalledTimes(1);
        expect(onMore).toHaveBeenCalledTimes(1);
    });

    it('shows pause, the playing ground and the position bar while playing', () => {
        const onSeek = jest.fn();
        const { container } = render(
            <RoomFileRow
                leading={{ kind: 'play', playing: true, onToggle: jest.fn() }}
                title={title}
                progress={{ position: 723, duration: 2147, onSeek, label: 'Position' }}
            />
        );

        expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
        expect(container.firstChild).toHaveAttribute('data-playing', 'true');
        expect(screen.getByText('12:03 / 35:47')).toBeInTheDocument();
        const slider = screen.getByRole('slider', { name: 'Position' });
        expect(slider).toHaveAttribute('aria-valuetext', '12:03 / 35:47');
        fireEvent.change(slider, { target: { value: '60' } });
        expect(onSeek).toHaveBeenCalledWith(60);
    });

    it('shows the position alone when the length is unknown', () => {
        render(
            <RoomFileRow
                leading={{ kind: 'play', playing: true, onToggle: jest.fn() }}
                title={title}
                progress={{ position: 7, onSeek: jest.fn() }}
            />
        );

        expect(screen.getByText('0:07')).toBeInTheDocument();
    });

    it('draws a glyph tile for a file or link row and opens it on press', () => {
        const onPress = jest.fn();
        render(
            <RoomFileRow
                leading={{ kind: 'icon', icon: <svg data-testid="file-glyph" /> }}
                title="report.pdf"
                subtitle="Sunny · Nov 11 · 1.2MB"
                onPress={onPress}
            />
        );

        expect(screen.getByTestId('file-glyph')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Play' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'More options' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByText('report.pdf'));
        expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('becomes one checkbox in selection mode, without the leading slot or more button', () => {
        const onToggle = jest.fn();
        const { rerender } = render(
            <RoomFileRow
                leading={{ kind: 'play', playing: false, onToggle: jest.fn() }}
                title={title}
                subtitle={subtitle}
                onMore={jest.fn()}
                selection={{ selected: false, onToggle }}
            />
        );

        const row = screen.getByRole('checkbox');
        expect(row).toHaveAttribute('aria-checked', 'false');
        expect(row).toHaveAccessibleName(new RegExp(`^${title}`));
        expect(screen.queryByRole('button', { name: 'Play' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'More options' })).not.toBeInTheDocument();
        fireEvent.click(row);
        expect(onToggle).toHaveBeenCalledTimes(1);

        rerender(
            <RoomFileRow
                leading={{ kind: 'play', playing: false, onToggle: jest.fn() }}
                title={title}
                selection={{ selected: true, onToggle }}
            />
        );
        expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');
    });

    it('drops the progress bar in selection mode', () => {
        render(
            <RoomFileRow
                leading={{ kind: 'play', playing: true, onToggle: jest.fn() }}
                title={title}
                progress={{ position: 1, duration: 2, onSeek: jest.fn() }}
                selection={{ selected: false, onToggle: jest.fn() }}
            />
        );

        expect(screen.queryByRole('slider')).not.toBeInTheDocument();
    });

    it('fires onLongPress after a held press and swallows the click that ends it', () => {
        jest.useFakeTimers();
        const onPress = jest.fn();
        const onLongPress = jest.fn();
        render(
            <RoomFileRow
                leading={{ kind: 'icon', icon: null }}
                title={title}
                onPress={onPress}
                onLongPress={onLongPress}
            />
        );
        const body = screen.getByRole('button', { name: title });

        pointer('pointerdown', body, 10, 10);
        act(() => jest.advanceTimersByTime(ROOM_FILE_LONG_PRESS_MS));
        fireEvent.pointerUp(body);
        fireEvent.click(body);

        expect(onLongPress).toHaveBeenCalledTimes(1);
        expect(onPress).not.toHaveBeenCalled();
    });

    it('swallows the ending click even after the host switched to selection mode', () => {
        jest.useFakeTimers();
        const onToggle = jest.fn();
        const props = { leading: { kind: 'icon', icon: null } as const, title };
        const { rerender } = render(<RoomFileRow {...props} onLongPress={jest.fn()} />);

        pointer('pointerdown', screen.getByRole('button', { name: title }), 10, 10);
        act(() => jest.advanceTimersByTime(ROOM_FILE_LONG_PRESS_MS));
        rerender(<RoomFileRow {...props} onLongPress={jest.fn()} selection={{ selected: true, onToggle }} />);
        fireEvent.click(screen.getByRole('checkbox'));
        expect(onToggle).not.toHaveBeenCalled();

        pointer('pointerdown', screen.getByRole('checkbox'), 10, 10);
        fireEvent.click(screen.getByRole('checkbox'));
        expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it('drops the long press when the finger moves like a scroll, or lifts early', () => {
        jest.useFakeTimers();
        const onLongPress = jest.fn();
        render(<RoomFileRow leading={{ kind: 'icon', icon: null }} title={title} onLongPress={onLongPress} />);
        const body = screen.getByRole('button', { name: title });

        pointer('pointerdown', body, 10, 10);
        pointer('pointermove', body, 10, 30);
        act(() => jest.advanceTimersByTime(ROOM_FILE_LONG_PRESS_MS));

        pointer('pointerdown', body, 10, 10);
        act(() => jest.advanceTimersByTime(ROOM_FILE_LONG_PRESS_MS - 100));
        fireEvent.pointerUp(body);
        act(() => jest.advanceTimersByTime(200));

        expect(onLongPress).not.toHaveBeenCalled();
    });

    it('does not start a long press from the position bar', () => {
        jest.useFakeTimers();
        const onLongPress = jest.fn();
        render(
            <RoomFileRow
                leading={{ kind: 'play', playing: true, onToggle: jest.fn() }}
                title={title}
                progress={{ position: 1, duration: 10, onSeek: jest.fn() }}
                onLongPress={onLongPress}
            />
        );

        pointer('pointerdown', screen.getByRole('slider'), 10, 10);
        act(() => jest.advanceTimersByTime(ROOM_FILE_LONG_PRESS_MS));
        expect(onLongPress).not.toHaveBeenCalled();
    });
});
