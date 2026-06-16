interface ReadStatusProps {
    readCount: number;
    unreadCount: number;
}

export const ReadStatus = ({ unreadCount }: ReadStatusProps) => {
    if (unreadCount <= 0) return null;

    return <span className="font-medium text-[#F2C80C]">{unreadCount}</span>;
};
