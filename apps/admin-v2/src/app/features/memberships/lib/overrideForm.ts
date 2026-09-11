/**
 * `lib/memberships/overrideForm.ts`
 * - Turns the override form's state into a request body, a verdict on whether it may be sent, and
 *   the sentences the confirmation dialog shows.
 *
 * Kept out of the component so all three are testable. The `adminStatus`/`adminUntil` checks mirror
 * rules the relay also enforces (subscription-admin SPEC §5.1), so they only refuse what the server
 * would refuse anyway. The mandatory reason is the exception: the relay accepts an empty
 * `adminReason`, and this console is the only thing requiring one — so it is a house rule, not a
 * guarantee. Anything writing to the endpoint directly can still land an override without a why.
 */
import type { MembershipBody, MembershipView } from '@lemoncloud/chatic-backend-api';

/** What the operator is doing. One axis, three moves — there is no priority rule to reason about. */
export type OverrideMode = 'grant' | 'block' | 'release';

/** The statuses that count as a block. `active` is a grant; anything else the relay refuses. */
export type BlockStatus = 'expired' | 'canceled';

export interface OverrideFormState {
    mode: OverrideMode;
    blockStatus: BlockStatus;
    /** `YYYY-MM-DD` from a date input. Empty means indefinite — there is no "forever" value. */
    until: string;
    /** Empty leaves the grade alone. */
    productId: string;
    reason: string;
    /** Provision clouds up to the raised quota immediately. */
    auto: boolean;
}

export const emptyOverrideForm = (): OverrideFormState => ({
    mode: 'grant',
    blockStatus: 'expired',
    until: '',
    productId: '',
    reason: '',
    auto: false,
});

/**
 * End of the chosen day, local time.
 *
 * A grant "until 2026-12-31" should still be in force during that day, so the instant stored is
 * its last millisecond rather than its midnight. Picking today therefore yields a future time and
 * passes the relay's "no past `adminUntil`" rule instead of being refused.
 */
export const toEpochEndOfDay = (date: string): number | undefined => {
    if (!date) {
        return undefined;
    }

    const [year, month, day] = date.split('-').map(Number);
    if (!year || !month || !day) {
        return undefined;
    }

    // `new Date(2026, 12, 40)` silently rolls into the next year rather than failing, so the parts
    // are read back off the result. Unreachable through `<input type="date">`, but this is the one
    // place the expiry instant is built and a rolled-over date would be stored as if chosen.
    const at = new Date(year, month - 1, day, 23, 59, 59, 999);
    if (at.getFullYear() !== year || at.getMonth() !== month - 1 || at.getDate() !== day) {
        return undefined;
    }

    return at.getTime();
};

const formatDay = (epoch: number): string => new Date(epoch).toLocaleDateString();

/**
 * Reasons the form cannot be submitted, in the order they should be read. Empty means it can.
 */
export const validateOverrideForm = (form: OverrideFormState, now: number): string[] => {
    const errors: string[] = [];

    // The API treats the reason as optional; this console does not (ADR-0082 결정 6). Who changed
    // what and why is the whole audit trail — the relay only keeps the most recent one.
    if (!form.reason.trim()) {
        errors.push('사유를 입력해 주세요.');
    }

    if (form.mode !== 'release' && form.until) {
        const until = toEpochEndOfDay(form.until);
        if (until === undefined) {
            errors.push('만료일 형식이 올바르지 않습니다.');
        } else if (until <= now) {
            errors.push('만료일은 오늘 이후여야 합니다.');
        }
    }

    return errors;
};

/** The request body for `PUT /memberships/{userId}/admin`. */
export const buildOverrideBody = (form: OverrideFormState): MembershipBody => {
    const reason = form.reason.trim();

    // Release is a single empty status. The relay clears `adminUntil` and `adminProductId` itself,
    // so sending them would only be a second way to say the same thing.
    if (form.mode === 'release') {
        return { adminStatus: '', adminReason: reason };
    }

    const until = toEpochEndOfDay(form.until);

    return {
        adminStatus: form.mode === 'grant' ? 'active' : form.blockStatus,
        adminReason: reason,
        // Absent means indefinite. Never substitute a far-future date for it.
        ...(until !== undefined ? { adminUntil: until } : {}),
        // A block does not carry a grade — it takes entitlement away, and a tier would be noise.
        ...(form.mode === 'grant' && form.productId ? { adminProductId: form.productId } : {}),
    };
};

/** `auto` only means anything when a grant could raise the quota. */
export const shouldSendAuto = (form: OverrideFormState): boolean => form.mode === 'grant' && form.auto;

export interface OverrideSummary {
    title: string;
    /** What changes, in the order it matters. Rendered as separate lines. */
    lines: string[];
}

/**
 * What the confirmation dialog says. The wording carries the consequences the operator cannot see
 * on this screen: a block suspends clouds while the store keeps charging, and `auto` creates them.
 */
export const describeOverride = (form: OverrideFormState, membership: MembershipView | undefined): OverrideSummary => {
    const userId = membership?.userId || '이 유저';

    if (form.mode === 'release') {
        return {
            title: '관리자 오버라이드를 해제합니다',
            lines: [
                `${userId}의 구독 판정이 즉시 영수증 기준으로 돌아갑니다.`,
                '부여했던 기간과 등급이 함께 풀립니다.',
                '누가·언제·왜 조작했는지의 기록은 남습니다.',
            ],
        };
    }

    if (form.mode === 'block') {
        const until = toEpochEndOfDay(form.until);

        return {
            title: '이 유저의 구독을 차단합니다',
            lines: [
                `${userId}의 구독이 무효가 됩니다 (${form.blockStatus}).`,
                '이 유저의 Cloud가 보류·회수 대상이 됩니다. 표시만 바뀌는 것이 아닙니다.',
                '스토어 결제는 계속 나갑니다. 앱에서는 "만료"가 아니라 이용 제한으로 보입니다.',
                until !== undefined
                    ? `${formatDay(until)}이 지나면 차단이 저절로 풀립니다.`
                    : '해제하기 전까지 유지됩니다.',
            ],
        };
    }

    const until = toEpochEndOfDay(form.until);
    const lines = [
        until !== undefined
            ? `${userId}의 구독을 ${formatDay(until)}까지 유효로 만듭니다.`
            : `${userId}의 구독을 기한 없이 유효로 만듭니다. 해제하기 전까지 유지됩니다.`,
        '보류돼 있던 Cloud가 복원됩니다.',
    ];

    if (form.productId) {
        lines.push(`등급이 ${form.productId}로 바뀌어 보유 한도가 그 상품 기준이 됩니다.`);
    }

    lines.push(
        form.auto
            ? '한도가 늘어 모자란 만큼 Cloud 생성 요청이 바로 큐에 들어갑니다.'
            : '한도만 늘고 Cloud 생성은 유저가 직접 합니다.'
    );

    return { title: '이 유저에게 구독을 부여합니다', lines };
};
