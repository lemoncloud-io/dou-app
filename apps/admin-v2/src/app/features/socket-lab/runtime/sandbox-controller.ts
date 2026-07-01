/**
 * `runtime/sandbox-controller.ts`
 * - Gateway Sandbox 클라 1개의 상태 컨트롤러(React 밖). 실 ClientContainer를 래핑해 sim→real.
 * - 상태머신 idle→connecting→connected→verified/error, 게이트웨이 호출, 클라별 로그/지표(collector), recv E2E.
 * - 로그는 액션마다 자체 기록(디자인 logFrame 패턴), 지표는 container.collector.summary()(실측).
 */
import type { DemoConnectionDraft, DeviceDraft } from '../demo-model';
import { createClientContainer, encodeE2eMarker, type ClientContainer } from './client-container';

export type ClientStatus = 'idle' | 'connecting' | 'connected' | 'verified' | 'error' | 'reconnecting';

export interface LogRow {
    key: string;
    t: string;
    dir: 'tx' | 'rx';
    type: string;
    level: 'info' | 'warn' | 'error';
    latency: number | null;
    label: string;
}

export interface Pctl {
    p50: number;
    p95: number;
}
export interface ClientMetricsView {
    rtt: Pctl | null;
    send: Pctl | null;
    recv: Pctl | null;
    handshake: number | null;
}

export interface ClientSnapshot {
    id: string;
    letter: string;
    color: string;
    name: string;
    status: ClientStatus;
    token: string;
    userId: string | null;
    deviceId: string | null;
    err: string | null;
    channels: string[];
    activeChannel: string | null;
    syncOn: boolean;
    paused: boolean;
    channelInput: string;
    chatInput: string;
    log: LogRow[];
    metrics: ClientMetricsView;
    tx: number;
    rx: number;
    lossCount: number;
}

export interface SandboxControllerOptions {
    id: string;
    letter: string;
    color: string;
    wsUrl: string;
    /** cross-client 매트릭스 갱신용(수신 시 from→this.letter). */
    onRecv?: (from: string, to: string, latencyMs: number) => void;
}

const ts = () => new Date().toTimeString().slice(0, 8);

export class SandboxController {
    readonly id: string;
    readonly letter: string;
    readonly color: string;
    private readonly container: ClientContainer;
    private readonly onRecv?: SandboxControllerOptions['onRecv'];
    private readonly listeners = new Set<() => void>();

    name: string;
    token = '';
    channelInput = '__canary__';
    chatInput = 'ping';
    private status: ClientStatus = 'idle';
    private userId: string | null = null;
    private deviceId: string | null = null;
    private err: string | null = null;
    private channels: string[] = [];
    private activeChannel: string | null = null;
    private syncOn = true;
    private paused = false;
    private log: LogRow[] = [];
    private tx = 0;
    private rx = 0;
    private lossCount = 0;
    private seq = 0;
    private handshakeMs: number | null = null;
    private logSeq = 0;
    private readonly lastSeqFrom: Record<string, number> = {};

    constructor(opts: SandboxControllerOptions) {
        this.id = opts.id;
        this.letter = opts.letter;
        this.color = opts.color;
        this.name = `Client ${opts.letter}`;
        this.onRecv = opts.onRecv;
        this.container = createClientContainer({
            id: opts.id,
            deviceDraft: {
                id: crypto.randomUUID(),
                name: `Client ${opts.letter}`,
                platform: 'web',
            } as unknown as DeviceDraft,
            connectionDraft: { wsUrl: opts.wsUrl, syncIntervalMs: 1000 } as unknown as DemoConnectionDraft,
        });
        this.container.subscribe(ev => {
            if (ev.type === 'recv') this.onRecvFrame(ev.from, ev.seq, ev.latencyMs);
        });
        // collector 샘플(rAF 배치) 도착 시 지표 갱신 통지
        this.container.collector.subscribe(() => this.notify());
    }

    subscribe(fn: () => void): () => void {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }
    private notify() {
        this.listeners.forEach(fn => fn());
    }

    private logRow(dir: 'tx' | 'rx', type: string, level: LogRow['level'], latency: number | null, label = '') {
        if (this.paused) return;
        const row: LogRow = {
            key: `f${(this.logSeq += 1)}`,
            t: ts(),
            dir,
            type,
            level,
            latency: latency != null ? Math.round(latency) : null,
            label,
        };
        this.log = [row, ...this.log];
        if (this.log.length > 40) this.log.length = 40;
    }

    private onRecvFrame(from: string, seq: number, latencyMs: number) {
        this.rx += 1;
        const last = this.lastSeqFrom[from] ?? 0;
        if (last !== 0 && seq > last + 1) this.lossCount += seq - last - 1;
        this.lastSeqFrom[from] = Math.max(last, seq);
        this.logRow('rx', 'chat.sync', 'info', latencyMs, `from ${from} · seq ${seq}`);
        this.onRecv?.(from, this.letter, latencyMs);
        this.notify();
    }

    // ---- setters (입력) ----
    setName(v: string) {
        this.name = v;
        this.notify();
    }
    setToken(v: string) {
        this.token = v;
        this.notify();
    }
    setChannelInput(v: string) {
        this.channelInput = v;
        this.notify();
    }
    setChatInput(v: string) {
        this.chatInput = v;
        this.notify();
    }
    togglePause() {
        this.paused = !this.paused;
        this.notify();
    }
    setActiveChannel(ch: string) {
        this.activeChannel = ch;
        this.notify();
    }

    // ---- lifecycle ----
    /** WS 연결만(device.save 포함). 인증은 별도(authenticate) — 토큰 불필요. */
    async connectWs() {
        if (this.status === 'connecting' || this.status === 'connected' || this.status === 'verified') return;
        const t0 = performance.now();
        this.status = 'connecting';
        this.err = null;
        this.logRow('tx', 'ws.connect', 'info', null, 'handshake 시작');
        this.notify();
        try {
            await this.container.connect();
            if (this.container.getState() !== 'connected') throw new Error(`socket ${this.container.getState()}`);
            this.handshakeMs = performance.now() - t0;
            this.deviceId = this.container.deviceId;
            this.status = 'connected';
            this.logRow('rx', 'device.save:ok', 'info', this.handshakeMs, this.deviceId);
        } catch (e) {
            this.status = 'error';
            this.err = e instanceof Error ? e.message : `${e}`;
            this.logRow('rx', 'connect:err', 'error', null, this.err);
        }
        this.notify();
    }

    /** 선택적 인증 — 연결 후 토큰으로 auth.update. 실패해도 연결은 유지(재시도 가능). */
    async authenticate() {
        if (this.status !== 'connected' && this.status !== 'verified') return;
        if (!this.token.trim()) return;
        const t0 = performance.now();
        this.logRow('tx', 'auth.update', 'info', null, '');
        this.notify();
        const res = await this.container.updateAuth(this.token.trim());
        if (res?.state === 'authenticated') {
            this.status = 'verified';
            this.err = null;
            this.userId = `${res.memberId ?? res.member$?.id ?? ''}` || null;
            this.deviceId = res.deviceId ?? this.deviceId;
            this.logRow('rx', 'auth.update:ok', 'info', performance.now() - t0, 'verified');
        } else {
            // 인증 실패 시 연결은 유지(토큰 고쳐 재시도) — status는 connected 유지, 에러만 표시.
            this.status = 'connected';
            this.err = res?.error || `auth ${res?.state ?? 'failed'}`;
            this.logRow('rx', 'auth.update:err', 'error', null, this.err);
        }
        this.notify();
    }

    async disconnect() {
        this.logRow('tx', 'ws.close', 'info', null, '');
        await this.container.disconnect().catch(() => undefined);
        this.status = 'idle';
        this.userId = null;
        this.deviceId = null;
        this.channels = [];
        this.activeChannel = null;
        this.err = null;
        this.notify();
    }

    // ---- gateway actions ----
    private async gwCall<T>(type: string, fn: () => Promise<T>, label = ''): Promise<T | undefined> {
        if (this.status !== 'verified') return undefined;
        const t0 = performance.now();
        this.tx += 1;
        this.logRow('tx', type, 'info', null, label);
        this.notify();
        try {
            const r = await fn();
            this.logRow('rx', `${type}:ok`, 'info', performance.now() - t0, '');
            this.notify();
            return r;
        } catch (e) {
            this.logRow('rx', `${type}:err`, 'error', null, e instanceof Error ? e.message : `${e}`);
            this.notify();
            return undefined;
        }
    }
    private joinLocal(ch: string) {
        if (!this.channels.includes(ch)) this.channels = [...this.channels, ch];
        this.activeChannel = ch;
        if (this.syncOn) this.container.startChannelSync(ch);
    }
    async create() {
        const ch = this.channelInput.trim();
        if (!ch) return;
        const view = await this.gwCall('channel.create', () => this.container.channelCreate('public', ch), ch);
        if (view?.id) this.joinLocal(view.id);
        this.notify();
    }
    async join() {
        const ch = this.channelInput.trim();
        if (!ch) return;
        const view = await this.gwCall('channel.join', () => this.container.channelJoin(ch), ch);
        this.joinLocal(view?.id || ch);
        this.notify();
    }
    async leave(ch: string) {
        await this.gwCall('channel.leave', () => this.container.channelLeave(ch), ch);
        this.container.stopChannelSync(ch);
        this.channels = this.channels.filter(x => x !== ch);
        if (this.activeChannel === ch) this.activeChannel = this.channels[0] ?? null;
        this.notify();
    }
    toggleSync() {
        this.syncOn = !this.syncOn;
        for (const ch of this.channels) {
            if (this.syncOn) this.container.startChannelSync(ch);
            else this.container.stopChannelSync(ch);
        }
        this.notify();
    }
    async send() {
        const ch = this.activeChannel;
        if (!ch || this.status !== 'verified') return;
        this.seq += 1;
        const seq = this.seq;
        this.tx += 1;
        const content = `${this.chatInput || ''}${encodeE2eMarker(performance.now(), performance.timeOrigin, this.letter, seq)}`;
        this.logRow('tx', 'chat.send', 'info', null, `${ch} · "${this.chatInput || ''}"`);
        this.notify();
        const t0 = performance.now();
        const view = await this.container.sendChat(ch, content);
        if (view) this.logRow('rx', 'chat.send:ack', 'info', performance.now() - t0, `seq ${seq}`);
        else this.logRow('rx', 'chat.send:err', 'error', null, '');
        this.notify();
    }
    saveDevice() {
        void this.gwCall('device.save', () => this.container.saveDevice({ id: this.deviceId ?? undefined } as never));
    }
    presence() {
        void this.gwCall('device.presence', () => this.container.readDevice());
    }
    viewing() {
        if (this.status !== 'verified') return;
        this.container.notifyViewing(this.activeChannel);
        this.logRow('tx', 'device.viewing', 'info', null, this.activeChannel || '—');
        this.notify();
    }

    dispose() {
        this.listeners.clear();
        void this.container.dispose();
    }

    snapshot(): ClientSnapshot {
        const s = this.container.collector.summary();
        return {
            id: this.id,
            letter: this.letter,
            color: this.color,
            name: this.name,
            status: this.status,
            token: this.token,
            userId: this.userId,
            deviceId: this.deviceId,
            err: this.err,
            channels: this.channels,
            activeChannel: this.activeChannel,
            syncOn: this.syncOn,
            paused: this.paused,
            channelInput: this.channelInput,
            chatInput: this.chatInput,
            log: this.log,
            metrics: {
                rtt: s.rttSamples ? { p50: s.rttP50, p95: s.rttP95 } : null,
                send: s.sendSamples ? { p50: s.sendE2eP50, p95: s.sendE2eP95 } : null,
                recv: s.recvSamples ? { p50: s.recvE2eP50, p95: s.recvE2eP95 } : null,
                handshake: this.handshakeMs != null ? Math.round(this.handshakeMs) : null,
            },
            tx: this.tx,
            rx: this.rx,
            lossCount: this.lossCount,
        };
    }
}
