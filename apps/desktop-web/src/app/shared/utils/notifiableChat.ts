interface NotifiableCandidate {
    stereo?: string;
}

export const isNotifiableChat = (chat: NotifiableCandidate): boolean => chat.stereo !== 'system';
