/**
 * `runtime/client-container.ts`
 * - 클라 1개의 React 밖 상태 컨테이너: client + runtime + gateways + store 3종 + collector
 */
import {
    ChannelSyncPlan,
    ChatSyncPlan,
    createAuthGateway,
    createChannelGateway,
    createChatGateway,
    createClientSocketV2,
    createDeviceRuntime,
    type AuthGateway,
    type ChannelGateway,
    type ChatGateway,
    type ClientSocketState,
    type DeviceGateway,
    type DeviceSocketRuntime,
    type DeviceSyncTarget,
    type DeviceView,
    type SyncTargetDescriptor,
} from '@lemoncloud/chatic-sockets-lib';
import type { DeviceBody } from '@lemoncloud/chatic-sockets-lib';
import type { AuthUpdateResponseData } from '@lemoncloud/chatic-sockets-lib';
import type { SocketMessage } from '@lemoncloud/chatic-sockets-lib';
import {
    pushLogEntry,
    toDeviceBody,
    toDeviceSeed,
    toPositiveInt,
    type DemoChannelStereo,
    type DemoChannelView,
    type DemoChatView,
    type DemoConnectionDraft,
    type DemoLogEntry,
    type DeviceDraft,
} from '../demo-model';
import { E2ECollector } from '../metrics/e2e-collector';
import {
    applyChatMessages,
    createChannelStore,
    createChatStore,
    createDeviceStore,
    type ChannelSnap,
    type ChatSnap,
    type DeviceSnap,
} from '../store/domain-stores';
import type { Store } from '../store/store';

export type ContainerEvent =
    | { type: 'state'; state: ClientSocketState }
    | { type: 'log'; entry: DemoLogEntry }
    | { type: 'sync-targets'; targets: SyncTargetDescriptor[] }
    | { type: 'recv'; from: string; seq: number; latencyMs: number };

export interface ClientContainerOptions {
    id: string;
    deviceDraft: DeviceDraft;
    connectionDraft: DemoConnectionDraft;
}

/**
 * The lab's slice of the SDK `AuthGateway` — deliberately NOT the whole thing.
 *
 * `refresh` is excluded: refresh execution belongs to `ClientSocketAuth` alone (ADR-0070 결정 2
 * 불변조건 1), and the raw gateway packet bypasses everything that makes it safe — the epoch
 * serialization, the controller's own `_token`, the refresh timer rearm, and the `onTokenRefresh`
 * writeback that re-mints the AWS credentials. Same Pick policy as `AuthSocketDomainGateway`
 * (libs/data/src/data/remote/gateways/socket.ts): leaving an action out of the Pick is what keeps a
 * caller from reaching it. `switch`/`logout` are out for the same reason — they move session state
 * the lab does not own.
 */
type LabAuthGateway = Pick<AuthGateway, 'update' | 'linkAccount'>;

export interface ClientContainer {
    readonly id: string;
    readonly deviceId: string;
    readonly wsUrl: string;
    readonly deviceStore: Store<DeviceSnap>;
    readonly channelStore: Store<ChannelSnap>;
    readonly chatStore: Store<ChatSnap>;
    readonly collector: E2ECollector;
    readonly device: DeviceGateway;
    readonly channel: ChannelGateway;
    readonly chat: ChatGateway;
    readonly auth: LabAuthGateway;
    getState(): ClientSocketState;
    setEndpoint(wsUrl: string): void;
    subscribe(listener: (event: ContainerEvent) => void): () => void;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    dispose(): Promise<void>;
    saveDevice(body: DeviceBody): Promise<DeviceView | undefined>;
    readDevice(id?: string): Promise<DeviceView | undefined>;
    updateAuth(token: string): Promise<AuthUpdateResponseData | undefined>;
    sendChat(channelId: string, content: string): Promise<DemoChatView | undefined>;
    channelCreate(stereo: DemoChannelStereo, name: string): Promise<DemoChannelView | undefined>;
    channelJoin(channelId: string): Promise<DemoChannelView | undefined>;
    channelLeave(channelId: string): Promise<void>;
    channelMine(): Promise<DemoChannelView[]>;
    channelGetSelf(): Promise<DemoChannelView | undefined>;
    chatFeed(channelId: string, limit: number): Promise<DemoChatView[]>;
    startChannelSync(channelId: string): void;
    stopChannelSync(channelId: string): void;
    startSync(target: SyncTargetDescriptor): void;
    stopSync(target: SyncTargetDescriptor): void;
    listSyncTargets(): SyncTargetDescriptor[];
    observeDevice(deviceId: string): void;
    notifyViewing(channelId: string | null): void;
    savePointer(posX: number, posY: number): Promise<void>;
    armGapDrop(count?: number): void;
}

/**
 * recv E2E 마커 — 서버가 custom field(_demoSentAt)를 echo하지 않으므로(검증 완료), 항상 전달되는
 * content 끝에 송신 시각+송신자+seq를 임베드해 수신측이 파싱. 같은 브라우저(timeOrigin 동일)에서만 시계 비교 유효.
 * 포맷: `⟦E2E <sentAt> <origin> <from> <seq>⟧`. from/seq는 cross-client 매트릭스·유실 검출용.
 */
const E2E_RE = /⟦E2E ([\d.]+) ([\d.]+) (\S+) (\d+)⟧/;
export const encodeE2eMarker = (sentAt: number, origin: number, from = '-', seq = 0): string =>
    ` ⟦E2E ${sentAt} ${origin} ${from || '-'} ${seq}⟧`;
export const stripE2eMarker = (content: unknown): string => `${content ?? ''}`.replace(E2E_RE, '').trimEnd();
const parseE2eMarker = (content: unknown): { sentAt: number; origin: number; from: string; seq: number } | null => {
    if (typeof content !== 'string') return null;
    const m = E2E_RE.exec(content);
    if (!m) return null;
    const sentAt = Number(m[1]);
    const origin = Number(m[2]);
    const seq = Number(m[4]);
    return Number.isFinite(sentAt) && Number.isFinite(origin) ? { sentAt, origin, from: m[3], seq } : null;
};

const mapChannelView = (view: unknown): DemoChannelView => {
    const v = (view ?? {}) as Record<string, unknown>;
    return {
        id: v.id as string | undefined,
        name: v.name as string | undefined,
        stereo: v.stereo as DemoChannelView['stereo'],
        desc: v.desc as string | undefined,
        ownerId: v.ownerId as string | undefined,
        chatNo: v.chatNo as number | undefined,
        memberIds: Array.isArray(v.memberIds) ? (v.memberIds as string[]) : undefined,
    };
};

export const createClientContainer = (opts: ClientContainerOptions): ClientContainer => {
    const { id, deviceDraft, connectionDraft } = opts;
    const deviceId = `${deviceDraft.id ?? ''}`.trim();

    const deviceStore = createDeviceStore();
    const channelStore = createChannelStore();
    const chatStore = createChatStore();
    const collector = new E2ECollector();

    const listeners = new Set<(event: ContainerEvent) => void>();
    const emit = (event: ContainerEvent) => listeners.forEach(fn => fn(event));
    const log = (level: DemoLogEntry['level'], label: string, detail?: string) => {
        const entry = pushLogEntry([], level, label, detail)[0];
        emit({ type: 'log', entry });
    };

    let runtime: DeviceSocketRuntime | null = null;
    let state: ClientSocketState = 'idle';
    let endpoint = connectionDraft.wsUrl;
    const cleanups: Array<() => void> = [];
    let gapDropCounter = 0;

    const deviceKey = (target?: DeviceSyncTarget, view?: DeviceView): string =>
        `${view?.id ?? target?.id ?? deviceId ?? 'current'}`;

    const upsertDevice = (target: DeviceSyncTarget | undefined, view: DeviceView) => {
        const viewing = view?.viewingType && view?.viewingId ? `${view.viewingType}:${view.viewingId}` : undefined;
        deviceStore.upsert(deviceKey(target, view), {
            id: view?.id,
            tick: view?.tick,
            status: view?.status ? `${view.status}` : undefined,
            viewing,
            view,
        });
    };

    const refreshSyncTargets = () => {
        emit({ type: 'sync-targets', targets: runtime ? runtime.listSyncTargets() : [] });
    };

    // 수신 메시지 content 마커 파싱 → recv 이벤트(중복 chatNo 방지)
    const recvSeen = new Set<string>();
    const emitRecvForMessages = (channelId: string, msgs: Array<Record<string, unknown>>) => {
        for (const m of msgs) {
            const chatNo = typeof m?.chatNo === 'number' ? m.chatNo : undefined;
            const key = `${channelId}:${chatNo ?? ''}`;
            if (chatNo !== undefined) {
                if (recvSeen.has(key)) continue;
                recvSeen.add(key);
            }
            const field = parseE2eMarker(m?.content);
            if (!field) continue;
            const originOk = Math.abs(field.origin - performance.timeOrigin) < 1;
            collector.markReceive(field.sentAt, originOk);
            if (originOk) {
                emit({
                    type: 'recv',
                    from: field.from,
                    seq: field.seq,
                    latencyMs: Math.max(0, performance.now() - field.sentAt),
                });
            }
        }
    };

    // 채널 sync가 chatNo 증가를 감지하면 chat.feed로 당겨오는 브릿지 —
    // 서버가 chat.sync를 push하지 않는 환경에서도 수신되도록(지연 ≈ 채널 폴링 주기).
    const pulledChatNo = new Map<string, number>();
    const pullChatIfNew = (channelId: string, chatNo?: number) => {
        if (!runtime || !channelId || !chatNo) return;
        const last = pulledChatNo.get(channelId) ?? 0;
        if (chatNo <= last) return;
        pulledChatNo.set(channelId, chatNo);
        void createChatGateway(runtime.client)
            .feed({ channelId, limit: 20 } as never)
            .then(result => {
                const list = ((result as { list?: DemoChatView[] })?.list ?? []).filter(m => (m.chatNo ?? 0) > last);
                if (!list.length) return;
                applyChatMessages(chatStore, channelId, list, chatNo);
                log('info', 'chat.sync.apply', `${channelId} +${list.length} chatNo=${chatNo}`);
                emitRecvForMessages(channelId, list as unknown as Array<Record<string, unknown>>);
            })
            .catch(() => undefined);
    };

    const buildClient = () => {
        const client = createClientSocketV2({
            url: endpoint.trim(),
            requestTimeoutMs: 5000,
            device: toDeviceSeed(deviceDraft),
            shouldHandleMessage: ({ message }) => {
                if (message?.type === 'chat.sync' && gapDropCounter > 0) {
                    gapDropCounter -= 1;
                    collector.incGap();
                    log('warn', 'sim.gap.drop', `dropped chat.sync (남은 ${gapDropCounter})`);
                    return false;
                }
                return true;
            },
            keepAlive: false,
            reconnect: false,
        });

        const $request = client.request.bind(client);
        client.request = (async (type: unknown, data?: unknown, options?: unknown) => {
            const startedAt = performance.now();
            const typeName = typeof type === 'string' ? type : `${(type as { type?: string })?.type ?? 'unknown'}`;
            try {
                const result = await $request(type as never, data as never, options as never);
                const elapsed = performance.now() - startedAt;
                collector.markRtt(elapsed);
                log('info', 'request.ok', `${typeName} ${Math.round(elapsed)}ms`);
                return result;
            } catch (error) {
                log('warn', 'request.fail', `${typeName} — ${error instanceof Error ? error.message : `${error}`}`);
                throw error;
            }
        }) as typeof client.request;

        return client;
    };

    const connect = async (): Promise<void> => {
        if (runtime) return;
        log('info', 'connect.start', endpoint);
        try {
            const client = buildClient();

            const next = createDeviceRuntime({
                client,
                keepAliveOptions: {
                    intervalMs: toPositiveInt(connectionDraft.keepAliveIntervalMs, 30000),
                    timeoutMs: 5000,
                },
                reconnectOptions: {
                    minDelayMs: toPositiveInt(connectionDraft.reconnectMinDelayMs, 500),
                    maxDelayMs: toPositiveInt(connectionDraft.reconnectMaxDelayMs, 10000),
                },
                rotationOptions: {
                    maxLifetimeMs: toPositiveInt(connectionDraft.rotationLifetimeMinutes, 110) * 60 * 1000,
                    refreshBeforeMs: toPositiveInt(connectionDraft.rotationRefreshMinutes, 10) * 60 * 1000,
                },
                devicePlanOptions: {
                    intervalMs: toPositiveInt(connectionDraft.syncIntervalMs, 2000),
                    sendSyncHint: false,
                    onUpdate: (target: DeviceSyncTarget, view: DeviceView) => {
                        upsertDevice(target, view);
                        log('info', 'device.sync.update', `${deviceKey(target, view)} tick=${view?.tick ?? '-'}`);
                    },
                },
                extraSyncPlans: [
                    new ChannelSyncPlan({
                        intervalMs: toPositiveInt(connectionDraft.syncIntervalMs, 2000),
                        onUpdate: (_target, view) => {
                            const next = mapChannelView(view);
                            if (!next.id) return;
                            channelStore.upsert(next.id, {
                                id: next.id,
                                chatNo: next.chatNo,
                                memberIds: next.memberIds,
                                view: next,
                            });
                            log('info', 'channel.sync.update', next.id);
                            pullChatIfNew(next.id, next.chatNo);
                        },
                        onRemove: target => {
                            const cid = `${target.id ?? ''}`.trim();
                            if (cid) channelStore.remove(cid);
                            refreshSyncTargets();
                        },
                    }),
                    new ChatSyncPlan({
                        onApply: (target, applied, snapshot) => {
                            if (!applied.length) return;
                            const channelId = `${target.id ?? ''}`.trim();
                            applyChatMessages(
                                chatStore,
                                channelId,
                                applied as unknown as DemoChatView[],
                                snapshot.lastNo
                            );
                            log('info', 'chat.sync.apply', `${channelId} +${applied.length} lastNo=${snapshot.lastNo}`);
                            if (channelId) {
                                pulledChatNo.set(
                                    channelId,
                                    Math.max(pulledChatNo.get(channelId) ?? 0, snapshot.lastNo)
                                );
                            }
                            emitRecvForMessages(channelId, applied as unknown as Array<Record<string, unknown>>);
                        },
                    }),
                ],
            });

            cleanups.push(
                client.onState(event => {
                    state = event.next;
                    emit({ type: 'state', state });
                    log('info', 'socket.state', `${event.prev} -> ${event.next}`);
                    refreshSyncTargets();
                }),
                client.onError(event => {
                    log(
                        'error',
                        `socket.${event.phase}`,
                        event.error instanceof Error ? event.error.message : `${event.error}`
                    );
                })
            );

            runtime = next;
            await next.start();
            state = client.state;
            emit({ type: 'state', state });
            log('info', 'connect.ready', 'runtime started');
            try {
                const view = await next.device.save(toDeviceBody(deviceDraft));
                next.updateLocalSnapshot({ type: 'device' }, { tick: view?.tick, lastAppliedTick: view?.tick, view });
                upsertDevice({ type: 'device' }, view);
                log('info', 'device.save.ok', `${view?.id ?? '-'} tick=${view?.tick ?? '-'}`);
            } catch (error) {
                log('warn', 'device.save.fail', `${error instanceof Error ? error.message : error}`);
            }
            next.startSync({ type: 'device', intervalMs: toPositiveInt(connectionDraft.syncIntervalMs, 2000) });
        } catch (error) {
            log('error', 'connect.fail', error instanceof Error ? error.message : `${error}`);
            await disconnect();
        } finally {
            refreshSyncTargets();
        }
    };

    const disconnect = async (): Promise<void> => {
        const current = runtime;
        runtime = null;
        cleanups.splice(0).forEach(unsub => unsub());
        if (current) {
            await current.stop().catch(error => log('warn', 'runtime.stop', `${error}`));
        }
        state = 'closed';
        emit({ type: 'state', state });
        refreshSyncTargets();
    };

    const requireRuntime = (label: string): DeviceSocketRuntime | null => {
        if (!runtime) {
            log('warn', `${label}.skipped`, 'runtime not connected');
            return null;
        }
        return runtime;
    };

    const ensureDevice = async (rt: DeviceSocketRuntime): Promise<void> => {
        try {
            const view = await rt.device.save(toDeviceBody(deviceDraft));
            rt.updateLocalSnapshot({ type: 'device' }, { tick: view?.tick, lastAppliedTick: view?.tick, view });
            upsertDevice({ type: 'device' }, view);
        } catch (error) {
            log('warn', 'device.ensure.fail', `${error instanceof Error ? error.message : error}`);
        }
    };

    return {
        id,
        deviceId,
        get wsUrl() {
            return endpoint;
        },
        deviceStore,
        channelStore,
        chatStore,
        collector,
        get device() {
            return runtime ? runtime.device : createDeviceGatewayStub();
        },
        get channel() {
            return runtime ? createChannelGateway(runtime.client) : (undefined as unknown as ChannelGateway);
        },
        get chat() {
            return runtime ? createChatGateway(runtime.client) : (undefined as unknown as ChatGateway);
        },
        get auth() {
            return runtime ? createAuthGateway(runtime.client) : (undefined as unknown as LabAuthGateway);
        },
        getState: () => state,
        setEndpoint: url => {
            if (!runtime) endpoint = url;
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        connect,
        disconnect,
        dispose: async () => {
            await disconnect();
        },
        saveDevice: async body => {
            const rt = requireRuntime('device.save');
            if (!rt) return undefined;
            try {
                const view = await rt.device.save(body);
                rt.updateLocalSnapshot(body.id ? { type: 'device', id: body.id } : { type: 'device' }, {
                    tick: view?.tick,
                    lastAppliedTick: view?.tick,
                    view,
                });
                upsertDevice(body.id ? { type: 'device', id: body.id } : { type: 'device' }, view);
                log('info', 'device.save.ok', `${view?.id ?? '-'} tick=${view?.tick ?? '-'}`);
                return view;
            } catch (error) {
                log('error', 'device.save.fail', `${error instanceof Error ? error.message : error}`);
                return undefined;
            }
        },
        readDevice: async id => {
            const rt = requireRuntime('device.read');
            if (!rt) return undefined;
            try {
                const view = await rt.device.read(id ? { id } : null);
                rt.updateLocalSnapshot(id ? { type: 'device', id } : { type: 'device' }, {
                    tick: view?.tick,
                    lastAppliedTick: view?.tick,
                    view,
                });
                upsertDevice(id ? { type: 'device', id } : { type: 'device' }, view);
                log('info', 'device.read.ok', `${view?.id ?? '-'} tick=${view?.tick ?? '-'}`);
                return view;
            } catch (error) {
                log('error', 'device.read.fail', `${error instanceof Error ? error.message : error}`);
                return undefined;
            }
        },
        updateAuth: async token => {
            const rt = requireRuntime('auth.update');
            if (!rt) return undefined;
            await ensureDevice(rt);
            try {
                const res = await createAuthGateway(rt.client).update({ token });
                log(
                    res?.state === 'authenticated' ? 'info' : 'warn',
                    'auth.update.ok',
                    `authId=${res?.authId ?? '-'} state=${res?.state ?? '-'}${res?.error ? ` error=${res.error}` : ''}`
                );
                return res;
            } catch (error) {
                log('error', 'auth.update.fail', `${error instanceof Error ? error.message : error}`);
                return undefined;
            }
        },
        sendChat: async (channelId, content) => {
            const rt = requireRuntime('chat.send');
            if (!rt || !channelId.trim() || !content.trim()) return undefined;
            await ensureDevice(rt);
            const token = collector.markSend(); // t0
            try {
                const embed = { _demoSentAt: performance.now(), _demoTo: performance.timeOrigin };
                const view = (await createChatGateway(rt.client).send({
                    channelId,
                    content,
                    ...embed,
                } as never)) as DemoChatView;
                collector.markSendAck(token); // t1 = 응답 resolve, rAF로 t2
                applyChatMessages(chatStore, channelId, [view], view.chatNo ?? 0);
                log('info', 'chat.send.ok', `${channelId} chatNo=${view.chatNo ?? '-'}`);
                return view;
            } catch (error) {
                log('error', 'chat.send.fail', `${error instanceof Error ? error.message : error}`);
                return undefined;
            }
        },
        channelCreate: async (stereo, name) => {
            const rt = requireRuntime('channel.create');
            if (!rt) return undefined;
            await ensureDevice(rt);
            try {
                const view = mapChannelView(await createChannelGateway(rt.client).create({ stereo, name } as never));
                if (view.id) {
                    channelStore.upsert(view.id, { id: view.id, chatNo: view.chatNo, memberIds: view.memberIds, view });
                }
                log('info', 'channel.create.ok', `${view.id ?? '-'}`);
                return view;
            } catch (error) {
                log('error', 'channel.create.fail', `${error instanceof Error ? error.message : error}`);
                return undefined;
            }
        },
        channelJoin: async channelId => {
            const rt = requireRuntime('channel.join');
            if (!rt || !channelId.trim()) return undefined;
            await ensureDevice(rt);
            try {
                const view = mapChannelView(await createChannelGateway(rt.client).join({ channelId } as never));
                const normalized = { ...view, id: view.id || channelId };
                channelStore.upsert(normalized.id, {
                    id: normalized.id,
                    chatNo: normalized.chatNo,
                    memberIds: normalized.memberIds,
                    view: normalized,
                });
                log('info', 'channel.join.ok', normalized.id);
                return normalized;
            } catch (error) {
                log('error', 'channel.join.fail', `${error instanceof Error ? error.message : error}`);
                return undefined;
            }
        },
        channelLeave: async channelId => {
            const rt = requireRuntime('channel.leave');
            if (!rt || !channelId.trim()) return;
            await ensureDevice(rt);
            try {
                await createChannelGateway(rt.client).leave({ channelId } as never);
                rt.stopSync({ type: 'channel', id: channelId });
                rt.stopSync({ type: 'chat', id: channelId });
                channelStore.remove(channelId);
                log('info', 'channel.leave.ok', channelId);
                refreshSyncTargets();
            } catch (error) {
                log('error', 'channel.leave.fail', `${error instanceof Error ? error.message : error}`);
            }
        },
        channelMine: async () => {
            const rt = requireRuntime('channel.mine');
            if (!rt) return [];
            await ensureDevice(rt);
            try {
                const result = (await createChannelGateway(rt.client).mine({ limit: 20 } as never)) as {
                    list?: unknown[];
                };
                const views = (result?.list ?? []).map(mapChannelView).filter(v => !!v.id);
                views.forEach(v =>
                    channelStore.upsert(v.id as string, { id: v.id, chatNo: v.chatNo, memberIds: v.memberIds, view: v })
                );
                log('info', 'channel.mine.ok', `count=${views.length}`);
                return views;
            } catch (error) {
                log('error', 'channel.mine.fail', `${error instanceof Error ? error.message : error}`);
                return [];
            }
        },
        channelGetSelf: async () => {
            const rt = requireRuntime('channel.get-self');
            if (!rt) return undefined;
            await ensureDevice(rt);
            try {
                const view = mapChannelView(await createChannelGateway(rt.client).getSelf());
                if (view.id) {
                    channelStore.upsert(view.id, { id: view.id, chatNo: view.chatNo, memberIds: view.memberIds, view });
                }
                log('info', 'channel.get-self.ok', `${view.id ?? '-'}`);
                return view;
            } catch (error) {
                log('error', 'channel.get-self.fail', `${error instanceof Error ? error.message : error}`);
                return undefined;
            }
        },
        chatFeed: async (channelId, limit) => {
            const rt = requireRuntime('chat.feed');
            if (!rt || !channelId.trim()) return [];
            await ensureDevice(rt);
            try {
                const result = (await createChatGateway(rt.client).feed({ channelId, limit } as never)) as {
                    list?: DemoChatView[];
                    total?: number;
                };
                const list = result?.list ?? [];
                applyChatMessages(chatStore, channelId, list, result?.total ?? 0);
                log('info', 'chat.feed.ok', `${channelId} count=${list.length}`);
                return list;
            } catch (error) {
                log('error', 'chat.feed.fail', `${error instanceof Error ? error.message : error}`);
                return [];
            }
        },
        startChannelSync: channelId => {
            const rt = requireRuntime('channel.sync.start');
            const cid = `${channelId ?? ''}`.trim();
            if (!rt || !cid) return;
            rt.startSync({ type: 'channel', id: cid });
            rt.startSync({ type: 'chat', id: cid });
            log('info', 'channel.sync.start', cid);
            refreshSyncTargets();
        },
        stopChannelSync: channelId => {
            const rt = requireRuntime('channel.sync.stop');
            const cid = `${channelId ?? ''}`.trim();
            if (!rt || !cid) return;
            rt.stopSync({ type: 'channel', id: cid });
            rt.stopSync({ type: 'chat', id: cid });
            log('info', 'channel.sync.stop', cid);
            refreshSyncTargets();
        },
        startSync: target => {
            requireRuntime('sync.start')?.startSync(target);
            refreshSyncTargets();
        },
        stopSync: target => {
            requireRuntime('sync.stop')?.stopSync(target);
            refreshSyncTargets();
        },
        listSyncTargets: () => (runtime ? runtime.listSyncTargets() : []),
        observeDevice: targetId => {
            const rt = requireRuntime('device.observe');
            const tid = `${targetId ?? ''}`.trim();
            if (!rt || !tid) return;
            rt.startDeviceSync(tid, toPositiveInt(connectionDraft.syncIntervalMs, 2000));
            void rt.device.read({ id: tid }).then(view => upsertDevice({ type: 'device', id: tid }, view));
            log('info', 'device.observe', tid);
            refreshSyncTargets();
        },
        notifyViewing: channelId => {
            const rt = requireRuntime('device.sync.viewing');
            if (!rt) return;
            const cid = `${channelId ?? ''}`.trim();
            rt.device.sync({ viewingType: cid ? 'channel' : '', viewingId: cid });
            log('info', 'device.sync.viewing', cid ? `channel:${cid}` : 'clear');
        },
        savePointer: async (posX, posY) => {
            const rt = requireRuntime('device.pointer');
            if (!rt) return;
            const view = await rt.device.save({ ...toDeviceSeed(deviceDraft), posX, posY }).catch(() => undefined);
            if (view) {
                rt.updateLocalSnapshot({ type: 'device' }, { tick: view.tick, lastAppliedTick: view.tick, view });
                upsertDevice({ type: 'device' }, view);
            }
        },
        armGapDrop: (count = 1) => {
            gapDropCounter += count;
            log('info', 'sim.gap.arm', `다음 chat.sync ${gapDropCounter}건 유실 예약`);
        },
    };
};

const createDeviceGatewayStub = (): DeviceGateway =>
    ({
        save: async () => undefined as unknown as DeviceView,
        read: async () => undefined as unknown as DeviceView,
        sync: () => void 0,
    }) as unknown as DeviceGateway;

export type { SocketMessage, Store };
