/**
 * `runtime/canary-smoke.ts`
 * - Canary 실 WS 연결 스모크 테스트(진단용, 임시).
 * - 어드민 토큰으로 pub/sub 2개 연결 → 채널 생성/입장 → pub 송신 → sub 수신/echo 검증.
 * - 검증 목적: 서버가 (1) 같은 유저의 다른 디바이스에 chat.sync broadcast 하는지,
 *   (2) 커스텀 data 필드(_demoSentAt)를 echo 하는지. 둘 다 되면 fan-out 실측 가능.
 */
import type { DemoConnectionDraft, DeviceDraft } from '../demo-model';
import { createClientContainer } from './client-container';

export interface SmokeLine {
    t: string;
    level: 'info' | 'warn' | 'error';
    text: string;
}

export type SmokeVerdict = 'ok' | 'no-echo' | 'no-broadcast' | 'fail';

export interface SmokeResult {
    verdict: SmokeVerdict;
    detail: string;
    pubState: string;
    subState: string;
    channelId: string | null;
    sent: number;
    subApplied: number;
    fanoutSamples: number;
    fanoutP50: number;
}

export interface SmokeOptions {
    wsUrl: string;
    token: string | null;
    onLog(line: SmokeLine): void;
}

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const ts = () => new Date().toTimeString().slice(0, 8);

/** 실 WS 2-클라이언트 연결·송수신 스모크. 검증 결과 + 라이브 로그 반환. */
export async function runCanarySmoke({ wsUrl, token, onLog }: SmokeOptions): Promise<SmokeResult> {
    const log = (level: SmokeLine['level'], text: string) => onLog({ t: ts(), level, text });

    const mk = (id: string) =>
        createClientContainer({
            id,
            deviceDraft: { id, name: id, platform: 'web' } as unknown as DeviceDraft,
            connectionDraft: { wsUrl, syncIntervalMs: 1000 } as unknown as DemoConnectionDraft,
        });
    const pub = mk('__canary_pub__');
    const sub = mk('__canary_sub__');

    let subApplied = 0;
    const unsubP = pub.subscribe(e => {
        if (e.type === 'log') log(e.entry.level, `pub · ${e.entry.label} ${e.entry.detail ?? ''}`);
    });
    const unsubS = sub.subscribe(e => {
        if (e.type === 'log') {
            if (e.entry.label === 'chat.sync.apply') subApplied += 1;
            log(e.entry.level, `sub · ${e.entry.label} ${e.entry.detail ?? ''}`);
        }
    });

    const res: SmokeResult = { verdict: 'fail', detail: '', pubState: '-', subState: '-', channelId: null, sent: 0, subApplied: 0, fanoutSamples: 0, fanoutP50: 0 };
    const finalize = (): SmokeResult => {
        res.subApplied = subApplied;
        res.pubState = pub.getState();
        res.subState = sub.getState();
        unsubP();
        unsubS();
        void pub.dispose();
        void sub.dispose();
        return res;
    };

    // dryRun: 서버가 공용 목업 세션을 로드 → 실 토큰 없이 인증 우회(검증 전용). 공용이라 다른 클라와 세션 공유 가능.
    const dryRun = true;
    /* eslint-disable @typescript-eslint/no-explicit-any */
    try {
        log('info', `WS = ${wsUrl || '(빈 URL)'} · dryRun(목업 세션)`);
        log('info', '연결 시도: pub / sub …');
        await pub.connect();
        await sub.connect();
        await wait(400);

        log('info', 'auth.update(dryRun) — 목업 세션 로드 …');
        await (pub.auth as any).update({ dryRun, token: 'dummy' }).catch((e: unknown) => log('warn', `pub auth.update: ${e}`));
        await (sub.auth as any).update({ dryRun, token: 'dummy2' }).catch((e: unknown) => log('warn', `sub auth.update: ${e}`));
        if (token) log('info', '(실 토큰도 보유 — dryRun 우선)');
        await wait(500);
        log('info', `상태: pub=${pub.getState()} / sub=${sub.getState()}`);

        log('info', '채널 생성: canary-smoke (dryRun) …');
        let chId = '';
        const created = (await (pub.channel as any).create({ stereo: 'public', name: 'canary-smoke', dryRun })) as { id?: string };
        chId = created?.id ?? '';
        if (!chId) {
            res.detail = '채널 생성 실패 (연결/인증 확인)';
            log('error', res.detail);
            return finalize();
        }
        res.channelId = chId;
        log('info', `channel = ${chId} · sub 입장(dryRun) + sync 시작`);
        await (sub.channel as any).join({ channelId: chId, dryRun }).catch((e: unknown) => log('warn', `sub join: ${e}`));
        sub.startChannelSync(chId);
        // 가설: 서버가 "viewing 중인 디바이스"에만 chat.sync 푸시 → sub가 채널 viewing 선언.
        sub.notifyViewing(chId);
        log('info', 'sub viewing 선언(device.sync viewing=channel)');
        await wait(900);

        for (let i = 1; i <= 5; i++) {
            log('info', `pub 송신 #${i} (dryRun)`);
            const embed = { _demoSentAt: performance.now(), _demoTo: performance.timeOrigin };
            await (pub.chat as any).send({ channelId: chId, content: `canary-${i}-${Date.now()}`, dryRun, ...embed }).catch((e: unknown) => log('warn', `pub send: ${e}`));
            res.sent += 1;
            await wait(1500);
        }
        await wait(900);
    /* eslint-enable @typescript-eslint/no-explicit-any */

        const sum = sub.collector.summary();
        res.fanoutSamples = sum.recvSamples;
        res.fanoutP50 = sum.recvE2eP50;
        res.subApplied = subApplied;

        if (subApplied > 0 && sum.recvSamples > 0) {
            res.verdict = 'ok';
            res.detail = `OK — sub 수신 ${subApplied}건, fan-out 샘플 ${sum.recvSamples}개(p50 ${sum.recvE2eP50}ms). broadcast + echo 동작 → fan-out 실측 가능.`;
        } else if (subApplied > 0) {
            res.verdict = 'no-echo';
            res.detail = `broadcast O / echo X — sub가 ${subApplied}건 수신했지만 _demoSentAt 미보존(fan-out 샘플 0). 서버가 커스텀 필드를 echo하도록 지원 필요.`;
        } else {
            res.verdict = 'no-broadcast';
            res.detail = 'same-user broadcast X — sub가 pub 메시지를 수신 못함(chat.sync.apply 0). 서버가 같은 유저 멀티커넥션에 broadcast 하는지 확인 필요.';
        }
        log(res.verdict === 'ok' ? 'info' : 'warn', `판정: ${res.detail}`);
        return finalize();
    } catch (err) {
        res.detail = err instanceof Error ? err.message : String(err);
        log('error', `예외: ${res.detail}`);
        return finalize();
    }
}
