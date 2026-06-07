import { cn } from '@chatic/lib/utils';

import type { MessageGroup } from '../utils';
import { avatarStyle } from '../../../shared';

interface MessageRowProps {
    group: MessageGroup;
}

const formatTime = (ms: number): string => {
    if (!ms) return '';
    const date = new Date(ms);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export const MessageRow = ({ group }: MessageRowProps) => {
    const initial = group.ownerName.charAt(0).toUpperCase() || '?';

    return (
        <div className="group flex gap-3 rounded-md px-2 py-1 -mx-2 transition-colors hover:bg-accent/40">
            <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-sm font-semibold"
                style={avatarStyle(group.ownerId || group.ownerName || '?')}
            >
                {initial}
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold text-foreground">{group.ownerName}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">{formatTime(group.timestamp)}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                    {group.messages.map(message => {
                        const isPending = message.isPending;
                        return (
                            <p
                                key={message.id ?? message.tempId ?? message.chatNo}
                                className={cn(
                                    'whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground',
                                    isPending && 'opacity-50'
                                )}
                            >
                                {message.content ?? ''}
                            </p>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
