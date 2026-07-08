import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { DomainChannel, DomainChat, DomainListResult } from '@chatic/data';
import { Trash2 } from 'lucide-react';

import { useRuntimeRepositories } from '@chatic/app-runtime';

const makeId = (prefix: string): string => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
const nowLabel = (): string => new Date().toLocaleTimeString();

export const ChatDashboardScreen = () => {
    const { channel: channelRepository, chat: chatRepository } = useRuntimeRepositories();

    const [placeId] = useState(() => makeId('debug-place'));

    const [channelSubscribed, setChannelSubscribed] = useState(false);
    const [channelSnapshot, setChannelSnapshot] = useState<DomainListResult<DomainChannel> | null>(null);
    const [channelLogs, setChannelLogs] = useState<string[]>([]);

    const [selectedChannelId, setSelectedChannelId] = useState('');

    const [chatSubscribed, setChatSubscribed] = useState(false);
    const [chatSnapshot, setChatSnapshot] = useState<DomainListResult<DomainChat> | null>(null);
    const [chatLogs, setChatLogs] = useState<string[]>([]);
    const [editingChatId, setEditingChatId] = useState('');
    const [editingChatContent, setEditingChatContent] = useState('');

    const [sampleCount, setSampleCount] = useState('20');

    const channelUnsubRef = useRef<(() => void) | null>(null);
    const chatUnsubRef = useRef<(() => void) | null>(null);

    const pushChannelLog = useCallback((message: string) => {
        setChannelLogs(prev => [`[${nowLabel()}] ${message}`, ...prev].slice(0, 40));
    }, []);

    const pushChatLog = useCallback((message: string) => {
        setChatLogs(prev => [`[${nowLabel()}] ${message}`, ...prev].slice(0, 40));
    }, []);

    const nextAutoChatNo = useMemo(() => {
        const chatNos = (chatSnapshot?.list || [])
            .map(item => item.chatNo)
            .filter((value): value is number => typeof value === 'number');
        return chatNos.length > 0 ? Math.max(...chatNos) + 1 : 1;
    }, [chatSnapshot]);

    useEffect(() => {
        return () => {
            channelUnsubRef.current?.();
            chatUnsubRef.current?.();
        };
    }, []);

    const subscribeChannels = useCallback(
        (nextPlaceId?: string) => {
            const activePlaceId = (nextPlaceId || placeId).trim();
            if (!activePlaceId) return;

            channelUnsubRef.current?.();
            channelUnsubRef.current = channelRepository.observeList(
                { placeId: activePlaceId, page: 0, limit: 100 } as any,
                result => {
                    setChannelSnapshot(result);
                    const firstId = result?.list?.[0]?.id;
                    if (firstId) {
                        setSelectedChannelId(prev => prev || firstId);
                    }
                    pushChannelLog(`stream emit: ${result?.list?.length ?? 0} channels`);
                }
            );

            setChannelSubscribed(true);
            pushChannelLog(`stream subscribed (placeId=${activePlaceId})`);
        },
        [channelRepository, placeId, pushChannelLog]
    );

    const unsubscribeChannels = useCallback(() => {
        channelUnsubRef.current?.();
        channelUnsubRef.current = null;
        setChannelSubscribed(false);
        pushChannelLog('stream unsubscribed');
    }, [pushChannelLog]);

    const createChannel = useCallback(async () => {
        const id = makeId('debug-channel');
        await channelRepository.cacheWrite({
            id,
            sid: placeId,
            placeId,
            name: `Debug Channel ${id.slice(-4)}`,
            updatedAt: Date.now(),
            createdAt: Date.now(),
        } as any);
        setSelectedChannelId(id);
        pushChannelLog(`cacheCreate channel: ${id}`);
    }, [channelRepository, placeId, pushChannelLog]);

    const deleteChannel = useCallback(
        async (channelId: string) => {
            if (!channelId) return;
            await channelRepository.cacheDelete(channelId);
            pushChannelLog(`cacheDelete channel: ${channelId}`);
            if (selectedChannelId === channelId) {
                setSelectedChannelId('');
                setChatSnapshot(null);
            }
        },
        [channelRepository, pushChannelLog, selectedChannelId]
    );

    const subscribeChats = useCallback(() => {
        const channelId = selectedChannelId.trim();
        if (!channelId) {
            alert('먼저 채널을 생성하거나 선택하세요.');
            return;
        }

        chatUnsubRef.current?.();
        chatUnsubRef.current = chatRepository.observeList({ channelId } as any, result => {
            setChatSnapshot(result);
            pushChatLog(`stream emit: ${result?.list.length ?? 0} chats`);
        });

        setChatSubscribed(true);
        pushChatLog(`stream subscribed (channelId=${channelId})`);
    }, [chatRepository, pushChatLog, selectedChannelId]);

    const unsubscribeChats = useCallback(() => {
        chatUnsubRef.current?.();
        chatUnsubRef.current = null;
        setChatSubscribed(false);
        pushChatLog('stream unsubscribed');
    }, [pushChatLog]);

    useEffect(() => {
        if (!selectedChannelId.trim()) {
            unsubscribeChats();
            return;
        }
        subscribeChats();
    }, [selectedChannelId, subscribeChats, unsubscribeChats]);

    const createChat = useCallback(async () => {
        if (!selectedChannelId.trim()) {
            alert('먼저 채널을 생성하거나 선택하세요.');
            return;
        }

        const chatNo = nextAutoChatNo;
        const id = makeId('debug-chat');
        await chatRepository.cacheWrite({
            id,
            channelId: selectedChannelId.trim(),
            chatNo,
            content: `Sample chat #${chatNo}`,
            createdAt: Date.now(),
        } as any);
        pushChatLog(`cacheCreate chat: ${id} (chatNo=${chatNo})`);
    }, [chatRepository, nextAutoChatNo, pushChatLog, selectedChannelId]);

    const createSampleChats = useCallback(async () => {
        if (!selectedChannelId.trim()) {
            alert('먼저 채널을 생성하거나 선택하세요.');
            return;
        }

        const count = Math.max(1, Math.min(200, Number(sampleCount) || 20));
        const baseNo = nextAutoChatNo;
        const now = Date.now();

        const items = Array.from({ length: count }).map((_, index) => ({
            id: makeId('debug-chat-sample'),
            channelId: selectedChannelId.trim(),
            chatNo: baseNo + index,
            content: `[sample] #${baseNo + index}`,
            createdAt: now + index,
        }));

        await chatRepository.cacheWriteMany(items as any);
        pushChatLog(`cacheBulkCreate chats: ${count} items (start chatNo=${baseNo})`);
    }, [chatRepository, nextAutoChatNo, pushChatLog, sampleCount, selectedChannelId]);

    const deleteChat = useCallback(
        async (chatId: string) => {
            if (!chatId) return;
            await chatRepository.cacheDelete(chatId);
            pushChatLog(`cacheDelete chat: ${chatId}`);
        },
        [chatRepository, pushChatLog]
    );

    const startEditChat = useCallback((chatId: string, content?: string) => {
        setEditingChatId(chatId);
        setEditingChatContent(content || '');
    }, []);

    const cancelEditChat = useCallback(() => {
        setEditingChatId('');
        setEditingChatContent('');
    }, []);

    const saveEditChat = useCallback(async () => {
        if (!editingChatId.trim()) return;
        await chatRepository.cacheWrite({
            id: editingChatId.trim(),
            content: editingChatContent,
        } as any);
        pushChatLog(`cacheWrite content: ${editingChatId.trim()}`);
        cancelEditChat();
    }, [cancelEditChat, chatRepository, editingChatContent, editingChatId, pushChatLog]);

    return (
        <div className="h-full overflow-y-auto bg-background p-4 text-foreground">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
                <header className="rounded-2xl border border-border bg-card p-4">
                    <h1 className="text-xl font-semibold">Cache Stream Debug (Channel + Chat)</h1>
                </header>

                <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <article className="rounded-2xl border border-border bg-card p-4">
                        <h2 className="text-lg font-semibold">Channel</h2>
                        <div className="mt-4 flex flex-col gap-3">
                            <div className="rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
                                <p>placeId: {placeId}</p>
                                <p>stream: {channelSubscribed ? 'ON' : 'OFF'}</p>
                                <p>count: {channelSnapshot?.list?.length ?? 0}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => subscribeChannels()}
                                    className="rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background"
                                >
                                    stream subscribe
                                </button>
                                <button
                                    onClick={unsubscribeChannels}
                                    className="rounded-lg border border-border px-3 py-2 text-sm"
                                >
                                    stream unsubscribe
                                </button>
                                <button
                                    onClick={createChannel}
                                    className="rounded-lg border border-border px-3 py-2 text-sm"
                                >
                                    channel create (auto)
                                </button>
                                <div />
                            </div>

                            <ul className="max-h-64 overflow-y-auto rounded-lg border border-border bg-background p-3 text-xs">
                                {(channelSnapshot?.list || []).map(item => (
                                    <li
                                        key={item.id}
                                        className={`flex items-center justify-between border-b border-border/60 py-1 last:border-b-0 ${
                                            selectedChannelId === item.id ? 'bg-muted/60' : ''
                                        }`}
                                    >
                                        <button
                                            onClick={() => item.id && setSelectedChannelId(item.id)}
                                            className="flex-1 text-left"
                                        >
                                            <p className="font-medium">{item.id}</p>
                                            <p className="text-muted-foreground">{item.name || '-'}</p>
                                        </button>
                                        <button
                                            onClick={event => {
                                                event.stopPropagation();
                                                void deleteChannel(item.id || '');
                                            }}
                                            className="rounded p-1 text-muted-foreground hover:bg-muted"
                                            aria-label="Delete channel"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </li>
                                ))}
                            </ul>

                            <ul className="max-h-52 overflow-y-auto rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
                                {channelLogs.map((line, index) => (
                                    <li key={`${line}-${index}`}>{line}</li>
                                ))}
                            </ul>
                        </div>
                    </article>

                    <article className="rounded-2xl border border-border bg-card p-4">
                        <h2 className="text-lg font-semibold">Chat</h2>
                        <div className="mt-4 flex flex-col gap-3">
                            <div className="rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
                                <p>channelId: {selectedChannelId || '-'}</p>
                                <p>stream: {chatSubscribed ? 'ON' : 'OFF'}</p>
                                <p>count: {chatSnapshot?.list?.length ?? 0}</p>
                                <p>next auto chatNo: {nextAutoChatNo}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={createChat}
                                    className="rounded-lg border border-border px-3 py-2 text-sm"
                                >
                                    메시지 1개 생성 (auto)
                                </button>
                                <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-2">
                                    <span className="text-xs text-muted-foreground">샘플 수</span>
                                    <input
                                        value={sampleCount}
                                        onChange={event => setSampleCount(event.target.value)}
                                        className="w-full bg-transparent text-xs outline-none"
                                        placeholder="20"
                                    />
                                </div>
                                <button
                                    onClick={createSampleChats}
                                    className="col-span-2 rounded-lg border border-border bg-muted px-3 py-2 text-sm font-medium"
                                >
                                    샘플 채팅 일괄 생성 (auto chatNo)
                                </button>
                            </div>

                            <ul className="max-h-64 overflow-y-auto rounded-lg border border-border bg-background p-3 text-xs">
                                {(chatSnapshot?.list || []).map(item => (
                                    <li
                                        key={item.id}
                                        className="flex items-start justify-between border-b border-border/60 py-1 last:border-b-0"
                                    >
                                        <div className="min-w-0 flex-1 pr-2">
                                            <p className="font-medium">{item.id}</p>
                                            <p className="text-muted-foreground">chatNo: {item.chatNo}</p>
                                            {editingChatId === item.id ? (
                                                <div className="mt-1 flex items-center gap-1">
                                                    <input
                                                        value={editingChatContent}
                                                        onChange={event => setEditingChatContent(event.target.value)}
                                                        className="w-full rounded border border-border bg-background px-2 py-1 text-xs outline-none"
                                                    />
                                                    <button
                                                        onClick={() => void saveEditChat()}
                                                        className="rounded border border-border px-2 py-1 text-[11px]"
                                                    >
                                                        저장
                                                    </button>
                                                    <button
                                                        onClick={cancelEditChat}
                                                        className="rounded border border-border px-2 py-1 text-[11px]"
                                                    >
                                                        취소
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => startEditChat(item.id || '', item.content)}
                                                    className="mt-1 block w-full text-left text-muted-foreground underline underline-offset-2"
                                                >
                                                    {item.content || '(empty)'}
                                                </button>
                                            )}
                                        </div>
                                        {editingChatId !== item.id && (
                                            <button
                                                onClick={event => {
                                                    event.stopPropagation();
                                                    void deleteChat(item.id || '');
                                                }}
                                                className="rounded p-1 text-muted-foreground hover:bg-muted"
                                                aria-label="Delete chat"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </li>
                                ))}
                            </ul>

                            <ul className="max-h-52 overflow-y-auto rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
                                {chatLogs.map((line, index) => (
                                    <li key={`${line}-${index}`}>{line}</li>
                                ))}
                            </ul>
                        </div>
                    </article>
                </section>
            </div>
        </div>
    );
};
