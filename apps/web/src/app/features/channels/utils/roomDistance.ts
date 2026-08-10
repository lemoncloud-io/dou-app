/**
 * How many `navigate()` pushes a screen is from the channel room, carried through route state.
 *
 * The invite flow (room -> settings -> invite -> invite/link, or room -> invite -> invite/link)
 * can be entered at different depths. Each hop forwards `roomDistance + 1` so the flow's final
 * step can pop back exactly that many entries — landing on the room's existing history entry
 * instead of pushing a new one on top of the stack it came from.
 */
export interface RoomDistanceState {
    roomDistance?: number;
}

export const getRoomDistance = (state: unknown, fallback: number): number => {
    const distance = (state as RoomDistanceState | null)?.roomDistance;
    return typeof distance === 'number' && distance > 0 ? distance : fallback;
};
