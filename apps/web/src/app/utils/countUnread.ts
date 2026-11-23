export interface UnreadInputs {
    headChatNo?: number;
    headMetaNo?: number;
    readNo?: number;
    readMetaNo?: number;
}

export const countUnread = ({ headChatNo, headMetaNo, readNo, readMetaNo }: UnreadInputs): number => {
    if (readNo === undefined) return 0;

    const metaNo = headMetaNo ?? 0;
    const userHead = Math.max(0, (headChatNo ?? 0) - metaNo);
    const cursorMetaNo = readMetaNo ?? metaNo;
    return Math.max(0, userHead - (readNo - cursorMetaNo));
};

export const readCursorOf = (join?: { readNo?: number; chatNo?: number }): number | undefined =>
    join ? Math.max(join.readNo ?? 0, join.chatNo ?? 0) : undefined;

export interface ReadPosition {
    readNo?: number;
    chatNo?: number;
    metaNo?: number;
}

export const readPositionOf = (join?: ReadPosition, embedded?: ReadPosition): ReadPosition | undefined => {
    const own = readCursorOf(join);
    const carried = readCursorOf(embedded);
    if (carried === undefined) return join;
    if (own === undefined) return embedded;
    if (carried > own) return embedded;
    if (carried === own && join?.metaNo === undefined && embedded?.metaNo !== undefined) return embedded;
    return join;
};

export interface UnreadChannel {
    chatNo?: number;
    metaNo?: number;
    $join?: ReadPosition;
}

export const unreadOf = (channel: UnreadChannel, join?: ReadPosition): number => {
    const position = readPositionOf(join, channel.$join);
    return countUnread({
        headChatNo: channel.chatNo,
        headMetaNo: channel.metaNo,
        readNo: readCursorOf(position),
        readMetaNo: position?.metaNo,
    });
};
