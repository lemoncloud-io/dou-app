/**
 * The channel a chat id belongs to. A chat's id is `<channelId>:<chatNo>`.
 *
 * Cut at the last `:`, not the first: the chat number never holds one, while nothing promises a
 * channel id never will. An id with no `:` is returned whole.
 */
export const channelIdOfChatId = (chatId: string): string => {
    const cut = chatId.lastIndexOf(':');
    return cut < 0 ? chatId : chatId.slice(0, cut);
};
