import { useQueryClient } from '@tanstack/react-query';
import { createQueryKeys, useCustomMutation } from '@chatic/shared';
import { sendPublicMessage, readPublicMessage } from '../apis';
import type { ChatReadBody, ChatSendBody, ChatView, JoinView } from '@lemoncloud/chatic-socials-api';
import type { AxiosError } from 'axios';

export const messagesKeys = createQueryKeys('messages');

export const useReadPublicMessage = () => {
    return useCustomMutation<JoinView, AxiosError<string>, ChatReadBody>(body => readPublicMessage(body));
};

export const useSendPublicMessage = () => {
    const queryClient = useQueryClient();

    return useCustomMutation<ChatView, AxiosError<string>, ChatSendBody>(body => sendPublicMessage(body), {
        onSuccess: data => {
            // queryClient.invalidateQueries({ queryKey: messagesKeys.list({ channelId: data.channelId }) });
        },
    });
};
