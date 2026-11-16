import { useRoomAudioStore } from '../stores/roomAudioStore';

/**
 * Pauses the room's audio player — a recording is about to start. Kept under this name for the
 * recording sheet, which predates the room player; the player itself is `useRoomAudioStore`.
 */
export const pauseInlineAudio = (): void => {
    useRoomAudioStore.getState().pause();
};
