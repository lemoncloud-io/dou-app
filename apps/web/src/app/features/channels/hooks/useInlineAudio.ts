import { useRoomAudioStore } from '../stores/roomAudioStore';

export const pauseInlineAudio = (): void => {
    useRoomAudioStore.getState().pause();
};
