import { logger } from '@chatic/app-messages';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** ChatSyncScheduler가 사용하는 chatRepository 최소 인터페이스 */
export interface ChatSyncRepository {
    fetchChat(
        payload: { channelId: string; limit?: number; cursorNo?: number },
        options?: { cachePolicy?: string }
    ): Promise<{
        list: Array<{ chatNo?: number; [key: string]: unknown }>;
        meta?: { cursorNo?: number; [key: string]: unknown };
    }>;
    subscribeList(
        channelId: string,
        callback: (result: { list: Array<{ chatNo?: number }> } | null) => void
    ): () => void;
}

export interface SyncTarget {
    channelId: string;
    serverChatNo: number;
}

export type ChannelSyncStatus = 'pending' | 'syncing' | 'synced' | 'error';

export interface ChannelSyncState {
    status: ChannelSyncStatus;
    serverChatNo: number;
    localMaxChatNo: number;
    fetchedCount: number;
    totalGap: number;
}

export interface ChatSyncSchedulerOptions {
    /** 페이지당 fetch 수 (기본 200) */
    limit?: number;
    /** 상태 변경 콜백 */
    onStateChange?: (channelId: string, state: ChannelSyncState) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FETCH_LIMIT = 200;

const abortableDelay = (ms: number, signal: AbortSignal): Promise<void> =>
    new Promise((resolve, reject) => {
        if (signal.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
            return;
        }
        const timer = setTimeout(resolve, ms);
        const onAbort = () => {
            clearTimeout(timer);
            reject(new DOMException('Aborted', 'AbortError'));
        };
        signal.addEventListener('abort', onAbort, { once: true });
    });

// ---------------------------------------------------------------------------
// ChatSyncScheduler
// ---------------------------------------------------------------------------

export class ChatSyncScheduler {
    private queue: SyncTarget[] = [];
    private states = new Map<string, ChannelSyncState>();
    private abortController: AbortController | null = null;
    private isPaused = false;
    private isRunning = false;
    private resumeResolver: (() => void) | null = null;
    private readonly limit: number;
    private readonly onStateChange?: (channelId: string, state: ChannelSyncState) => void;

    constructor(
        private readonly chatRepository: ChatSyncRepository,
        options?: ChatSyncSchedulerOptions
    ) {
        this.limit = options?.limit ?? FETCH_LIMIT;
        this.onStateChange = options?.onStateChange;
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /** gap이 있는 채널들을 큐에 등록. 이미 synced인 채널은 skip. */
    enqueue(targets: SyncTarget[]): void {
        const added: string[] = [];
        const skipped: string[] = [];
        const updated: string[] = [];

        for (const target of targets) {
            const existing = this.states.get(target.channelId);
            if (existing?.status === 'syncing') {
                skipped.push(target.channelId);
                continue;
            }
            // synced이지만 serverChatNo가 증가했다면 → 새 메시지 존재 → 재등록
            if (existing?.status === 'synced' && target.serverChatNo <= existing.serverChatNo) {
                skipped.push(target.channelId);
                continue;
            }
            // 이미 큐에 있으면 serverChatNo만 갱신
            const inQueue = this.queue.find(t => t.channelId === target.channelId);
            if (inQueue) {
                inQueue.serverChatNo = Math.max(inQueue.serverChatNo, target.serverChatNo);
                updated.push(target.channelId);
            } else {
                this.queue.push(target);
                this.updateState(target.channelId, {
                    status: 'pending',
                    serverChatNo: target.serverChatNo,
                    localMaxChatNo: 0,
                    fetchedCount: 0,
                    totalGap: 0,
                });
                added.push(`${target.channelId}(chatNo=${target.serverChatNo})`);
            }
        }

        logger.info(
            'SYNC',
            `[ChatSync] enqueue: added=${added.length}, skipped=${skipped.length}, updated=${updated.length}, queueSize=${this.queue.length}`,
            {
                added,
                skipped,
                updated,
            }
        );
    }

    /** 스케줄러 시작 — 큐가 빌 때까지 순차 처리 */
    start(): void {
        if (this.isRunning) {
            logger.debug('SYNC', `[ChatSync] start() ignored — already running`);
            return;
        }
        logger.info('SYNC', `[ChatSync] start — queueSize=${this.queue.length}`);
        void this.runLoop();
    }

    /** 스케줄러 중단 — 진행 중 sync abort */
    stop(): void {
        logger.info('SYNC', `[ChatSync] stop — wasRunning=${this.isRunning}, queueSize=${this.queue.length}`);
        this.abortController?.abort();
        this.abortController = null;
        this.isRunning = false;
        this.isPaused = false;
        this.resumeResolver?.();
        this.resumeResolver = null;
    }

    /** 백그라운드 탭 → pause */
    pause(): void {
        logger.debug('SYNC', `[ChatSync] pause`);
        this.isPaused = true;
    }

    /** 포그라운드 복귀 → resume */
    resume(): void {
        logger.debug('SYNC', `[ChatSync] resume`);
        this.isPaused = false;
        this.resumeResolver?.();
        this.resumeResolver = null;
    }

    /** 채널별 sync 상태 조회 */
    getState(channelId: string): ChannelSyncState | undefined {
        return this.states.get(channelId);
    }

    /** 전체 상태 스냅샷 */
    getAllStates(): ReadonlyMap<string, ChannelSyncState> {
        return this.states;
    }

    /** 큐 길이 (테스트용) */
    get queueLength(): number {
        return this.queue.length;
    }

    /** 실행 중 여부 (테스트용) */
    get running(): boolean {
        return this.isRunning;
    }

    // -----------------------------------------------------------------------
    // Internal
    // -----------------------------------------------------------------------

    private updateState(channelId: string, patch: Partial<ChannelSyncState>): void {
        const prev = this.states.get(channelId) ?? {
            status: 'pending' as const,
            serverChatNo: 0,
            localMaxChatNo: 0,
            fetchedCount: 0,
            totalGap: 0,
        };
        const next = { ...prev, ...patch };
        this.states.set(channelId, next);
        this.onStateChange?.(channelId, next);
    }

    private async getLocalMaxChatNo(channelId: string): Promise<number> {
        return new Promise<number>(resolve => {
            let unsub: (() => void) | null = null;
            unsub = this.chatRepository.subscribeList(
                channelId,
                (result: { list: Array<{ chatNo?: number }> } | null) => {
                    // Defer unsubscribe to avoid TDZ when callback is called synchronously
                    if (unsub) unsub();
                    else queueMicrotask(() => unsub?.());
                    if (!result || result.list.length === 0) {
                        resolve(0);
                        return;
                    }
                    const maxNo = Math.max(...result.list.map((m: { chatNo?: number }) => m.chatNo ?? 0));
                    resolve(maxNo);
                }
            );
        });
    }

    private waitForResume(): Promise<void> {
        return new Promise(resolve => {
            this.resumeResolver = resolve;
        });
    }

    private async syncOne(target: SyncTarget, signal: AbortSignal): Promise<void> {
        const { channelId, serverChatNo } = target;
        let localMax = await this.getLocalMaxChatNo(channelId);
        const totalGap = serverChatNo - localMax;

        if (totalGap <= 0) {
            logger.debug(
                'SYNC',
                `[ChatSync] ${channelId} — already synced (localMax=${localMax}, serverChatNo=${serverChatNo})`
            );
            this.updateState(channelId, { status: 'synced', localMaxChatNo: localMax, totalGap: 0 });
            return;
        }

        logger.info(
            'SYNC',
            `[ChatSync] ${channelId} — syncing start: localMax=${localMax}, serverChatNo=${serverChatNo}, gap=${totalGap}`
        );

        this.updateState(channelId, {
            status: 'syncing',
            totalGap,
            localMaxChatNo: localMax,
            serverChatNo,
            fetchedCount: 0,
        });

        // Phase 1: page 0 — cursor 없이 최신 메시지 fetch
        const page0Result = await this.chatRepository.fetchChat(
            { channelId, limit: this.limit },
            { cachePolicy: 'network-only' }
        );

        if (signal.aborted) return;

        let fetchedCount = page0Result.list.length;
        this.updateState(channelId, { fetchedCount });

        logger.debug('SYNC', `[ChatSync] ${channelId} — page 1/?: fetched=${page0Result.list.length}, cursor=none`);

        // Defense: page 0 응답의 실제 max chatNo로 stale serverChatNo 보정
        const actualMaxChatNo = page0Result.list.length > 0 ? Math.max(...page0Result.list.map(m => m.chatNo ?? 0)) : 0;

        const effectiveServerChatNo =
            actualMaxChatNo > 0 && actualMaxChatNo < serverChatNo ? actualMaxChatNo : serverChatNo;

        if (effectiveServerChatNo < serverChatNo) {
            logger.warn(
                'SYNC',
                `[ChatSync] ${channelId} — stale serverChatNo corrected: target=${serverChatNo}, actual=${effectiveServerChatNo}`
            );
        }

        // Phase 2: page 0 이후 남은 gap 재계산
        localMax = await this.getLocalMaxChatNo(channelId);
        const remainingGap = effectiveServerChatNo - localMax;

        if (remainingGap <= 0 || page0Result.list.length < this.limit) {
            this.updateState(channelId, { status: 'synced', localMaxChatNo: localMax, fetchedCount });
            logger.info('SYNC', `[ChatSync] ${channelId} — synced (single page): fetched=${fetchedCount}`);
            return;
        }

        // Phase 3: 나머지 페이지 cursor 계산 (effectiveServerChatNo 기준, cursorNo > chatNo 방지)
        const remainingPageCount = Math.ceil(remainingGap / this.limit);
        const cursors: number[] = [];
        for (let i = 1; i <= remainingPageCount; i++) {
            const cursor = effectiveServerChatNo - i * this.limit + 1;
            if (cursor > 0 && cursor > localMax) {
                cursors.push(cursor);
            }
        }

        if (cursors.length === 0) {
            this.updateState(channelId, { status: 'synced', localMaxChatNo: localMax, fetchedCount });
            logger.info('SYNC', `[ChatSync] ${channelId} — synced (no remaining cursors): fetched=${fetchedCount}`);
            return;
        }

        // Phase 4: 나머지 페이지 병렬 fetch
        const results = await Promise.all(
            cursors.map(async (cursor, i) => {
                if (signal.aborted) return null;
                const result = await this.chatRepository.fetchChat(
                    { channelId, limit: this.limit, cursorNo: cursor },
                    { cachePolicy: 'network-only' }
                );
                fetchedCount += result.list.length;
                this.updateState(channelId, { fetchedCount });
                logger.debug(
                    'SYNC',
                    `[ChatSync] ${channelId} — page ${i + 2}/${cursors.length + 1}: fetched=${result.list.length}, cursor=${cursor}`
                );
                return result;
            })
        );

        if (!signal.aborted) {
            localMax = await this.getLocalMaxChatNo(channelId);
            this.updateState(channelId, { status: 'synced', localMaxChatNo: localMax, fetchedCount });
            logger.info(
                'SYNC',
                `[ChatSync] ${channelId} — synced: fetched=${fetchedCount}, pages=${cursors.length + 1}`
            );
        }
    }

    private async runLoop(): Promise<void> {
        this.isRunning = true;
        logger.info('SYNC', `[ChatSync] runLoop started — queueSize=${this.queue.length}`);

        while (this.queue.length > 0) {
            if (this.isPaused) {
                logger.debug('SYNC', `[ChatSync] runLoop paused — waiting for resume`);
                await this.waitForResume();
                // stop()이 호출되었을 수 있음
                if (!this.isRunning) {
                    logger.debug('SYNC', `[ChatSync] runLoop stopped during pause`);
                    break;
                }
                logger.debug('SYNC', `[ChatSync] runLoop resumed — remaining=${this.queue.length}`);
            }

            const target = this.queue.shift();
            if (!target) break;

            const state = this.states.get(target.channelId);
            if (state?.status === 'synced') {
                logger.debug('SYNC', `[ChatSync] ${target.channelId} — skip (already synced)`);
                continue;
            }

            this.abortController = new AbortController();

            try {
                await this.syncOne(target, this.abortController.signal);
            } catch (error) {
                if (error instanceof DOMException && error.name === 'AbortError') {
                    // stop()에 의해 abort → 채널을 큐에 다시 넣지 않음
                    logger.debug('SYNC', `[ChatSync] ${target.channelId} aborted`);
                } else {
                    logger.error('SYNC', `[ChatSync] ${target.channelId} failed`, { error });
                    this.updateState(target.channelId, { status: 'error' });
                }
            }
        }

        this.isRunning = false;
        logger.info('SYNC', `[ChatSync] runLoop finished`);
    }
}
