import { useState, useRef, useEffect } from 'react';
import {
    useChannelMembers,
    useChannelMutations,
    useChannels,
    useChatMutations,
    useChats,
    useInviteClouds,
    usePlaceMutations,
    usePlaces,
    useUserMutations,
} from '@chatic/data';
import { useWebSocketV2Store, getSocketSend } from '@chatic/socket';
import { cloudCore, useWebCoreStore } from '@chatic/web-core';
import type { ChatStartPayload } from '@lemoncloud/chatic-sockets-api';
import { ChevronRight, Loader2, Send } from 'lucide-react';
import { DebugStatePage } from './DebugStatePage';

/**
 * TODO 캐싱 마이그레이션 및 테스트 완료 이후 제거할 것
 */
export const DebugChatPage = () => {
    // UI 상태 관리
    const [activeTab, setActiveTab] = useState<'PLACES' | 'CHAT' | 'USER' | 'STATE'>('PLACES');
    const [selectedPlaceId, setSelectedPlaceId] = useState<string>('');
    const [selectedChannelId, setSelectedChannelId] = useState<string>('');

    // 임시 입력값 상태
    const [newPlaceName, setNewPlaceName] = useState('');
    const [newChannelName, setNewChannelName] = useState('');
    const [chatInput, setChatInput] = useState('');

    const messagesEndRef = useRef<HTMLDivElement>(null);

    // --- Hooks ---
    const { places, isLoading: isPlacesLoading, refresh: refreshPlaces } = usePlaces();
    const { makeSite, isPending: placePending } = usePlaceMutations();

    const { channels, refresh: refreshChannels } = useChannels({ placeId: selectedPlaceId, detail: true });
    const { createChannel, isPending: channelPending } = useChannelMutations();

    const { messages, refresh: _ } = useChats({ channelId: selectedChannelId });
    const { sendMessage, readMessage, isPending: chatPending } = useChatMutations();
    useChannelMembers({ channelId: selectedChannelId, detail: true });

    const { updateProfile, isPending: userPending } = useUserMutations();
    const { inviteClouds, refresh: refreshInvites } = useInviteClouds();

    // 새 메시지 수신 시 자동 스크롤
    useEffect(() => {
        if (activeTab === 'CHAT' && messagesEndRef.current) {
            messagesEndRef.current.scrollTop = messagesEndRef.current.scrollHeight;
        }
    }, [messages.length, activeTab]);

    // --- Handlers ---
    const handleMakeSite = async () => {
        if (!newPlaceName.trim()) return alert('플레이스 이름을 입력하세요.');
        try {
            await makeSite({ name: newPlaceName.trim() });
            setNewPlaceName('');
            refreshPlaces();
        } catch (e) {
            console.error(e);
        }
    };

    const handleSelectPlace = async (placeId: string) => {
        if (!placeId) return;

        const currentWssType = useWebSocketV2Store.getState().wssType;
        if (currentWssType !== 'cloud') {
            setSelectedPlaceId(placeId);
            return;
        }

        const cloudToken = cloudCore.getCloudToken();
        const uid = cloudToken?.id;
        if (!uid) return alert('로그인이 필요합니다.');

        try {
            const target = `${uid}@${placeId}`;
            const refreshed = await cloudCore.refreshToken(target);
            cloudCore.saveSelectedSiteId(placeId);

            const currentProfile = useWebCoreStore.getState().profile;
            const { Token: _token, ...cloudProfile } = refreshed;
            useWebCoreStore.getState().setProfile({
                ...currentProfile,
                ...cloudProfile,
            } as any);

            useWebSocketV2Store.getState().setIsVerified(false);
            const newToken = cloudCore.getIdentityToken();
            if (newToken) {
                getSocketSend()?.({
                    type: 'auth',
                    action: 'update',
                    payload: { token: newToken },
                });
            }

            setSelectedPlaceId(placeId);
            // 모바일 환경을 위해 Alert 대신 가벼운 Toast나 조용한 처리 권장
            console.log(`${placeId} 플레이스로 전환 완료`);
        } catch (e) {
            console.error('Failed to select place:', e);
            alert('플레이스 전환 실패');
        }
    };

    const handleCreateChannel = async () => {
        if (!selectedPlaceId) return alert('플레이스를 먼저 선택하세요.');
        if (!newChannelName.trim()) return alert('채널 이름을 입력하세요.');

        try {
            await createChannel({ name: newChannelName.trim(), stereo: 'public' } as ChatStartPayload);
            setNewChannelName('');
            refreshChannels();
        } catch (e) {
            console.error(e);
        }
    };

    const handleSendMessage = async () => {
        if (!selectedChannelId || !chatInput.trim()) return;
        try {
            const sentMessage = await sendMessage({
                channelId: selectedChannelId,
                content: chatInput.trim(),
            });
            setChatInput('');

            if (sentMessage?.chatNo) {
                await readMessage({
                    channelId: selectedChannelId,
                    chatNo: sentMessage.chatNo,
                });
            }
        } catch (e) {
            console.error('전송 또는 읽음 처리 실패:', e);
        }
    };

    return (
        <div className="flex h-screen flex-col bg-background pt-safe-top text-foreground">
            {/* Header */}
            <header className="relative flex min-h-[48px] items-center justify-center border-b border-border px-4 py-3">
                <h1 className="text-[17px] font-semibold">테스트 대시보드</h1>
            </header>

            {/* Tabs */}
            <div className="px-4 py-2">
                <div className="flex gap-1 rounded-xl bg-muted p-1">
                    {['PLACES', 'CHAT', 'USER', 'STATE'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab as any)}
                            className={`flex-1 rounded-lg py-1.5 text-[13px] font-medium transition-colors ${
                                activeTab === tab ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
                            }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto overscroll-none">
                {/* --- 탭 1: PLACES & CHANNELS --- */}
                {activeTab === 'PLACES' && (
                    <div className="flex flex-col gap-6 p-4">
                        {/* 플레이스 영역 */}
                        <section className="flex flex-col gap-3">
                            <h2 className="text-[15px] font-semibold">
                                🏢 Places{' '}
                                {isPlacesLoading && (
                                    <Loader2 size={14} className="inline animate-spin text-muted-foreground" />
                                )}
                            </h2>

                            <div className="flex gap-2">
                                <input
                                    value={newPlaceName}
                                    onChange={e => setNewPlaceName(e.target.value)}
                                    placeholder="새 플레이스 이름"
                                    className="flex-1 rounded-xl bg-muted px-4 py-2.5 text-[15px] outline-none placeholder:text-muted-foreground"
                                />
                                <button
                                    onClick={handleMakeSite}
                                    disabled={placePending['make-site']}
                                    className="rounded-xl bg-foreground px-4 py-2.5 text-[15px] font-semibold text-background disabled:opacity-50"
                                >
                                    생성
                                </button>
                            </div>

                            <ul className="flex flex-col gap-2">
                                {places.map((place, index) => (
                                    <li
                                        key={`${place.id}_${index}`}
                                        onClick={() => handleSelectPlace(place.id)}
                                        className={`flex items-center justify-between rounded-xl border p-4 transition-colors active:bg-muted ${
                                            selectedPlaceId === place.id
                                                ? 'border-foreground bg-foreground/5'
                                                : 'border-border bg-background'
                                        }`}
                                    >
                                        <div className="flex flex-col">
                                            <span className="text-[16px] font-medium">{place.name}</span>
                                            <span className="text-[12px] text-muted-foreground">{place.id}</span>
                                        </div>
                                        {selectedPlaceId === place.id && (
                                            <ChevronRight size={18} className="text-foreground" />
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </section>

                        <div className="h-[1px] w-full bg-border" />

                        {/* 채널 영역 */}
                        <section className="flex flex-col gap-3">
                            <h2 className="text-[15px] font-semibold">
                                💬 Channels
                                {!selectedPlaceId && (
                                    <span className="ml-2 text-[12px] font-normal text-destructive">
                                        (플레이스 선택 필요)
                                    </span>
                                )}
                            </h2>

                            <div className="flex gap-2">
                                <input
                                    value={newChannelName}
                                    onChange={e => setNewChannelName(e.target.value)}
                                    disabled={!selectedPlaceId}
                                    placeholder="새 채널 이름"
                                    className="flex-1 rounded-xl bg-muted px-4 py-2.5 text-[15px] outline-none placeholder:text-muted-foreground disabled:opacity-50"
                                />
                                <button
                                    onClick={handleCreateChannel}
                                    disabled={!selectedPlaceId || channelPending.start}
                                    className="rounded-xl bg-foreground px-4 py-2.5 text-[15px] font-semibold text-background disabled:opacity-50"
                                >
                                    생성
                                </button>
                            </div>

                            <ul className="flex flex-col gap-2 pb-6">
                                {channels.map((ch, index) => (
                                    <li
                                        key={`${ch.id}_${index}`}
                                        onClick={() => {
                                            setSelectedChannelId(ch.id || '');
                                            setActiveTab('CHAT');
                                        }}
                                        className={`flex items-center justify-between rounded-xl border p-4 transition-colors active:bg-muted ${
                                            selectedChannelId === ch.id
                                                ? 'border-foreground bg-foreground/5'
                                                : 'border-border bg-background'
                                        }`}
                                    >
                                        <div className="flex flex-col">
                                            <span className="text-[16px] font-medium">{ch.name || '이름 없음'}</span>
                                            <span className="text-[12px] text-muted-foreground">{ch.id}</span>
                                        </div>
                                        <ChevronRight size={18} className="text-muted-foreground" />
                                    </li>
                                ))}
                            </ul>
                        </section>
                    </div>
                )}

                {/* --- 탭 2: CHAT --- */}
                {activeTab === 'CHAT' && (
                    <div className="flex h-full flex-col">
                        {!selectedChannelId ? (
                            <div className="flex flex-1 items-center justify-center p-4">
                                <div className="text-center text-[15px] text-muted-foreground">
                                    <p>선택된 채널이 없습니다.</p>
                                    <button
                                        onClick={() => setActiveTab('PLACES')}
                                        className="mt-2 text-primary underline"
                                    >
                                        PLACES 탭에서 선택하기
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* 채팅 내역 */}
                                <div ref={messagesEndRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
                                    <div className="mb-2 text-center text-[12px] text-muted-foreground">
                                        Channel: {selectedChannelId}
                                    </div>
                                    {messages.map((msg, index) => (
                                        <div
                                            key={`${msg.id || msg.chatNo}_${index}`}
                                            className={`flex ${msg.isSystem ? 'justify-center' : ''}`}
                                        >
                                            {msg.isSystem ? (
                                                <span className="rounded-full bg-foreground/5 px-2.5 py-1.5 text-[12px] text-foreground">
                                                    {msg.content}
                                                </span>
                                            ) : (
                                                <div className="flex max-w-[85%] flex-col items-start gap-1">
                                                    <span className="text-[11px] text-muted-foreground">
                                                        {msg.ownerName}
                                                    </span>
                                                    <div className="rounded-2xl rounded-tl-sm bg-muted px-3.5 py-2 text-[15px] leading-[1.45] text-foreground">
                                                        {msg.content}
                                                    </div>
                                                    <span className="text-[10px] text-muted-foreground">
                                                        {msg.isPending ? '전송 중...' : `안읽음: ${msg.unreadCount}`}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                {/* 하단 입력창 (모바일 채팅방 스타일) */}
                                <div
                                    className="border-t border-border bg-background px-4 py-3"
                                    style={{ paddingBottom: 'calc(12px + var(--safe-bottom, 0px))' }}
                                >
                                    <div className="flex items-end gap-2 rounded-2xl bg-muted px-3 py-1.5">
                                        <textarea
                                            value={chatInput}
                                            onChange={e => setChatInput(e.target.value)}
                                            onKeyDown={e => {
                                                if (e.nativeEvent.isComposing) return;
                                                if (e.key === 'Enter' && !e.shiftKey) {
                                                    e.preventDefault();
                                                    handleSendMessage();
                                                }
                                            }}
                                            placeholder="메시지 입력..."
                                            rows={1}
                                            className="max-h-[100px] flex-1 resize-none bg-transparent py-2 text-[15px] outline-none placeholder:text-muted-foreground"
                                        />
                                        <button
                                            onClick={handleSendMessage}
                                            disabled={!chatInput.trim() || chatPending.send}
                                            className={`mb-1 flex size-8 items-center justify-center rounded-full transition-colors ${
                                                chatInput.trim()
                                                    ? 'bg-foreground text-background'
                                                    : 'bg-muted-foreground/20 text-muted-foreground'
                                            }`}
                                        >
                                            <Send size={16} />
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* --- 탭 3: USER --- */}
                {activeTab === 'USER' && (
                    <div className="flex flex-col gap-6 p-4">
                        <section className="flex flex-col gap-3">
                            <h2 className="text-[15px] font-semibold">👤 User Actions</h2>
                            <button
                                onClick={() => updateProfile({ name: `테스터_${Math.floor(Math.random() * 1000)}` })}
                                disabled={userPending['update-profile']}
                                className="w-full rounded-xl border border-border bg-background px-4 py-3.5 text-[15px] font-medium text-foreground transition-colors active:bg-muted disabled:opacity-50"
                            >
                                랜덤 닉네임으로 변경
                            </button>
                        </section>

                        <div className="h-[1px] w-full bg-border" />

                        <section className="flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <h2 className="text-[15px] font-semibold">✉️ Invites (Mobile)</h2>
                                <button onClick={refreshInvites} className="text-[13px] text-primary underline">
                                    새로고침
                                </button>
                            </div>

                            <ul className="flex flex-col gap-2">
                                {inviteClouds.map((inv, index) => (
                                    <li
                                        key={`${inv.id}_${index}`}
                                        className="rounded-xl border border-border p-4 text-[15px]"
                                    >
                                        {inv.id}
                                    </li>
                                ))}
                            </ul>
                        </section>
                    </div>
                )}
                {activeTab === 'STATE' && <DebugStatePage />}
            </div>
        </div>
    );
};
