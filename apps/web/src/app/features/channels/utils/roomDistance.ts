export interface RoomDistanceState {
    roomDistance?: number;
}

export const getRoomDistance = (state: unknown, fallback: number): number => {
    const distance = (state as RoomDistanceState | null)?.roomDistance;
    return typeof distance === 'number' && distance > 0 ? distance : fallback;
};
