export const channelIdOfChatId = (chatId: string): string => {
    const cut = chatId.lastIndexOf(':');
    return cut < 0 ? chatId : chatId.slice(0, cut);
};
