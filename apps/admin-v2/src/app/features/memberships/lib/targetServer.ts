/**
 * `lib/memberships/targetServer.ts`
 * - Which relay the console is pointed at.
 *
 * This screen writes, and admin-v2 is not deployed — every operator runs it locally against
 * whatever their own `.env` names, which in practice is production. So the target is shown on the
 * screen and again in the confirmation dialog. It is not switchable here: the gateway resolves one
 * relay endpoint from config, and threading a per-call base through three shared layers to make it
 * switchable would push a console-only idea into all of them (ADR-0082).
 */
export interface TargetServer {
    endpoint: string;
    isProd: boolean;
    label: string;
}

/**
 * Stage is read off the endpoint's trailing segment — `/v1` is production, `/d1` is dev, matching
 * how socket-lab and report-logs name their stages. An endpoint that follows neither convention is
 * reported as unknown rather than guessed at, because guessing "dev" on a production URL is the
 * expensive direction to be wrong in.
 */
export const describeTargetServer = (endpoint: string | undefined): TargetServer => {
    const url = (endpoint ?? '').trim().replace(/\/+$/, '');

    if (!url) {
        return { endpoint: '(미설정)', isProd: false, label: '알 수 없음' };
    }

    const stage = url.split('/').pop() ?? '';

    if (stage === 'v1') {
        return { endpoint: url, isProd: true, label: '운영' };
    }

    if (stage === 'd1') {
        return { endpoint: url, isProd: false, label: '개발' };
    }

    return { endpoint: url, isProd: false, label: '알 수 없음' };
};

export const currentTargetServer = (): TargetServer => describeTargetServer(import.meta.env.VITE_BACKEND_ENDPOINT);
