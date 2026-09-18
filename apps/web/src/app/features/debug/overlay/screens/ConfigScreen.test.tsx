import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ConfigScreen } from './ConfigScreen';
import { config } from '@chatic/config';

const snapshotAll = jest.fn();
const set = jest.fn();
const clear = jest.fn();
jest.mock('@chatic/config', () => ({
    config: {
        snapshotAll: () => snapshotAll(),
        set: (key: string, value: unknown, options: unknown) => set(key, value, options),
        clear: (key: string, options: unknown) => clear(key, options),
    },
}));
// The screen copies through `CopyButton`, which awaits the real outcome so its indicator cannot
// lie — so the spy sits on `copyTextWithResult` rather than the fire-and-forget `copyText`.
const copyTextWithResult = jest.fn().mockResolvedValue(true);
jest.mock('../../lib/copyText', () => ({
    copyTextWithResult: (t: string) => copyTextWithResult(t),
    copyText: () => undefined,
}));

const snap = (over: Record<string, unknown> = {}) => ({
    key: 'log.upload.hold',
    entry: { title: '로그 업로드 보류', description: '보류한다', type: 'boolean', defaultValue: false, meta: false },
    value: true,
    origin: 'local',
    isOverridden: true,
    canWrite: ['local'],
    ...over,
});

const numberSnap = (over: Record<string, unknown> = {}) => ({
    ...snap(),
    key: 'net.retry.maxRetries',
    entry: {
        title: 'HTTP 재시도 횟수',
        description: '다시 시도하는 최대 횟수',
        type: 'number',
        defaultValue: 4,
        meta: false,
        appliesAt: 'live',
    },
    value: 4,
    isOverridden: false,
    ...over,
});

describe('ConfigScreen', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        snapshotAll.mockReturnValue([snap()]);
        set.mockReturnValue({ ok: true });
        clear.mockReturnValue({ ok: true });
    });

    // The dotted key is an implementation detail — the registry already has a human-readable name and a one-sentence description.
    it('키 대신 이름과 설명, 값과 이긴 행을 보여준다', () => {
        render(<ConfigScreen />);

        expect(screen.getByText('로그 업로드 보류')).toBeInTheDocument();
        expect(screen.getByText('보류한다')).toBeInTheDocument();
        expect(screen.getByText(/true/)).toBeInTheDocument();
        expect(screen.getByText(/· local/)).toBeInTheDocument();
        expect(screen.queryByText('log.upload.hold')).not.toBeInTheDocument();
    });

    it('오버라이드된 것을 먼저, 나머지를 따로 센다', () => {
        snapshotAll.mockReturnValue([
            snap(),
            snap({ key: 'net.relay.backend', isOverridden: false, value: 'https://a' }),
        ]);
        render(<ConfigScreen />);

        expect(screen.getByText('오버라이드됨 (1)')).toBeInTheDocument();
        expect(screen.getByText('나머지 (1)')).toBeInTheDocument();
    });

    // Prevents the circularity of the lock screen containing the lock switch itself (ADR-0080 decision 6).
    it('meta 키는 렌더하지 않는다', () => {
        snapshotAll.mockReturnValue([
            snap({ key: 'system.overridesUnlocked', entry: { ...snap().entry, meta: true } }),
        ]);
        render(<ConfigScreen />);

        expect(screen.queryByText('로그 업로드 보류')).not.toBeInTheDocument();
    });

    // It's a credential, and this screen is copyable (ADR-0079 decision 16).
    it('debug.entryCode 는 제외한다', () => {
        snapshotAll.mockReturnValue([snap({ key: 'debug.entryCode', value: '1234' })]);
        render(<ConfigScreen />);

        expect(screen.queryByText(/1234/)).not.toBeInTheDocument();
    });

    it('키나 이름으로 걸러낸다', async () => {
        snapshotAll.mockReturnValue([
            snap(),
            snap({ key: 'net.relay.backend', isOverridden: false, entry: { ...snap().entry, title: '릴레이 주소' } }),
        ]);
        render(<ConfigScreen />);

        // The key isn't shown on screen, but it still works as a search term.
        await userEvent.type(screen.getByPlaceholderText(/찾기/), 'relay');
        expect(screen.getByText('릴레이 주소')).toBeInTheDocument();

        expect(screen.queryByText('로그 업로드 보류')).not.toBeInTheDocument();
    });

    // Just showing an empty list when the registry is missing would read as "there is no configuration".
    it('레지스트리가 배선 전이면 그 사실을 말한다', () => {
        snapshotAll.mockReturnValue([]);
        render(<ConfigScreen />);

        expect(screen.getByText(/배선되지 않았습니다/)).toBeInTheDocument();
    });

    it('JSON 복사는 키·값·이긴 행을 담는다', async () => {
        render(<ConfigScreen />);

        await userEvent.click(screen.getByRole('button', { name: 'JSON 복사' }));

        expect(copyTextWithResult).toHaveBeenCalledWith(expect.stringContaining('"origin": "local"'));
    });

    // This is why a key tuned by a number, like retry count or timeout, belongs on this screen.
    it('숫자 키는 값을 입력해 로컬 레인에 쓴다', async () => {
        snapshotAll.mockReturnValue([numberSnap()]);
        render(<ConfigScreen />);

        await userEvent.click(screen.getByRole('button', { name: /HTTP 재시도 횟수/ }));
        const input = screen.getByDisplayValue('4');
        await userEvent.clear(input);
        await userEvent.type(input, '9');
        await userEvent.click(screen.getByRole('button', { name: '적용' }));

        expect(set).toHaveBeenCalledWith('net.retry.maxRetries', 9, { lane: 'local' });
    });

    it('숫자가 아닌 입력은 쓰지 않고 이유를 말한다', async () => {
        snapshotAll.mockReturnValue([numberSnap()]);
        render(<ConfigScreen />);

        await userEvent.click(screen.getByRole('button', { name: /HTTP 재시도 횟수/ }));
        const input = screen.getByDisplayValue('4');
        await userEvent.clear(input);
        await userEvent.type(input, 'abc');
        await userEvent.click(screen.getByRole('button', { name: '적용' }));

        expect(set).not.toHaveBeenCalled();
        expect(screen.getByText('숫자가 아닙니다')).toBeInTheDocument();
    });

    it('불리언 키는 눌러서 뒤집는다', async () => {
        render(<ConfigScreen />);

        await userEvent.click(screen.getByRole('button', { name: /로그 업로드 보류/ }));
        await userEvent.click(screen.getByRole('button', { name: '끄기' }));

        expect(set).toHaveBeenCalledWith('log.upload.hold', false, { lane: 'local' });
    });

    it('되돌리기는 오버라이드를 지운다', async () => {
        render(<ConfigScreen />);

        await userEvent.click(screen.getByRole('button', { name: /로그 업로드 보류/ }));
        await userEvent.click(screen.getByRole('button', { name: '되돌리기' }));

        expect(clear).toHaveBeenCalledWith('log.upload.hold', { lane: 'local' });
    });

    // A rejection arrives as a reason, not an exception — a control that did nothing must say why.
    it('거부되면 이유를 그대로 보여준다', async () => {
        set.mockReturnValue({ ok: false, reason: 'locked' });
        render(<ConfigScreen />);

        await userEvent.click(screen.getByRole('button', { name: /로그 업로드 보류/ }));
        await userEvent.click(screen.getByRole('button', { name: '끄기' }));

        expect(screen.getByText('오버라이드 잠금이 걸려 있습니다')).toBeInTheDocument();
    });

    // Rendering a control for a key that can't be written would make the person pressing it think it changed.
    it('이 기기가 못 쓰는 키는 컨트롤 대신 이유를 보여준다', async () => {
        snapshotAll.mockReturnValue([snap({ canWrite: ['shell'] })]);
        render(<ConfigScreen />);

        await userEvent.click(screen.getByRole('button', { name: /로그 업로드 보류/ }));

        expect(screen.queryByRole('button', { name: '끄기' })).not.toBeInTheDocument();
        expect(screen.getByText(/읽기 전용/)).toBeInTheDocument();
    });

    it('적용 시점을 함께 말한다', async () => {
        snapshotAll.mockReturnValue([numberSnap({ entry: { ...numberSnap().entry, appliesAt: 'restart' } })]);
        render(<ConfigScreen />);

        await userEvent.click(screen.getByRole('button', { name: /HTTP 재시도 횟수/ }));

        expect(screen.getByText(/재시작 후 적용/)).toBeInTheDocument();
    });

    it('새로고침은 다시 읽는다', async () => {
        render(<ConfigScreen />);
        const before = snapshotAll.mock.calls.length;

        await userEvent.click(screen.getByRole('button', { name: '새로고침' }));

        expect(snapshotAll.mock.calls.length).toBeGreaterThan(before);
    });
});

// Confirms the mock is actually used — references config directly so the import doesn't get dropped as dead.
it('config 파사드를 통해 읽는다', () => {
    expect(typeof config.snapshotAll).toBe('function');
});
