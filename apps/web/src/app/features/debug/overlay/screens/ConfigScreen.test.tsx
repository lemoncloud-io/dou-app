import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ConfigScreen } from './ConfigScreen';
import { setDebugLanguageForTests } from '../../i18n';
import { runtime } from '@chatic/runtime';

const snapshotAll = jest.fn();
const set = jest.fn();
const clear = jest.fn();
jest.mock('@chatic/runtime', () =>
    require('@chatic/runtime/testing').fakeRuntimeModule({
        settings: {
            snapshotAll: () => snapshotAll(),
            set: (key: string, value: unknown, options: unknown) => set(key, value, options),
            clear: (key: string, options: unknown) => clear(key, options),
        },
    })
);
jest.mock('../../../../runtime/checkoutOptions', () => ({
    readCheckoutOptions: () => [
        { id: 'checkout.host', supported: true },
        { id: 'checkout.store', supported: true },
        { id: 'checkout.web', supported: false },
        { id: 'checkout.none', supported: true },
    ],
}));
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
    let restoreLanguage: () => void;

    beforeEach(() => {
        restoreLanguage = setDebugLanguageForTests('en');
        jest.clearAllMocks();
        snapshotAll.mockReturnValue([snap()]);
        set.mockReturnValue({ ok: true });
        clear.mockReturnValue({ ok: true });
    });

    afterEach(() => restoreLanguage());

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

        expect(screen.getByText('Overridden (1)')).toBeInTheDocument();
        expect(screen.getByText('Rest (1)')).toBeInTheDocument();
    });

    it('meta 키는 렌더하지 않는다', () => {
        snapshotAll.mockReturnValue([
            snap({ key: 'system.overridesUnlocked', entry: { ...snap().entry, meta: true } }),
        ]);
        render(<ConfigScreen />);

        expect(screen.queryByText('로그 업로드 보류')).not.toBeInTheDocument();
    });

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

        await userEvent.type(screen.getByPlaceholderText(/Search/), 'relay');
        expect(screen.getByText('릴레이 주소')).toBeInTheDocument();

        expect(screen.queryByText('로그 업로드 보류')).not.toBeInTheDocument();
    });

    it('레지스트리가 배선 전이면 그 사실을 말한다', () => {
        snapshotAll.mockReturnValue([]);
        render(<ConfigScreen />);

        expect(screen.getByText(/isn't wired up yet/)).toBeInTheDocument();
    });

    it('JSON 복사는 키·값·이긴 행을 담는다', async () => {
        render(<ConfigScreen />);

        await userEvent.click(screen.getByRole('button', { name: 'Copy JSON' }));

        expect(copyTextWithResult).toHaveBeenCalledWith(expect.stringContaining('"origin": "local"'));
    });

    it('숫자 키는 값을 입력해 로컬 레인에 쓴다', async () => {
        snapshotAll.mockReturnValue([numberSnap()]);
        render(<ConfigScreen />);

        await userEvent.click(screen.getByRole('button', { name: /HTTP 재시도 횟수/ }));
        const input = screen.getByDisplayValue('4');
        await userEvent.clear(input);
        await userEvent.type(input, '9');
        await userEvent.click(screen.getByRole('button', { name: 'Apply' }));

        expect(set).toHaveBeenCalledWith('net.retry.maxRetries', 9, { lane: 'local' });
    });

    it('숫자가 아닌 입력은 쓰지 않고 이유를 말한다', async () => {
        snapshotAll.mockReturnValue([numberSnap()]);
        render(<ConfigScreen />);

        await userEvent.click(screen.getByRole('button', { name: /HTTP 재시도 횟수/ }));
        const input = screen.getByDisplayValue('4');
        await userEvent.clear(input);
        await userEvent.type(input, 'abc');
        await userEvent.click(screen.getByRole('button', { name: 'Apply' }));

        expect(set).not.toHaveBeenCalled();
        expect(screen.getByText('Not a number')).toBeInTheDocument();
    });

    it('불리언 키는 눌러서 뒤집는다', async () => {
        render(<ConfigScreen />);

        await userEvent.click(screen.getByRole('button', { name: /로그 업로드 보류/ }));
        await userEvent.click(screen.getByRole('button', { name: 'Off' }));

        expect(set).toHaveBeenCalledWith('log.upload.hold', false, { lane: 'local' });
    });

    it('되돌리기는 오버라이드를 지운다', async () => {
        render(<ConfigScreen />);

        await userEvent.click(screen.getByRole('button', { name: /로그 업로드 보류/ }));
        await userEvent.click(screen.getByRole('button', { name: 'Revert' }));

        expect(clear).toHaveBeenCalledWith('log.upload.hold', { lane: 'local' });
    });

    it('거부되면 이유를 그대로 보여준다', async () => {
        set.mockReturnValue({ ok: false, reason: 'locked' });
        render(<ConfigScreen />);

        await userEvent.click(screen.getByRole('button', { name: /로그 업로드 보류/ }));
        await userEvent.click(screen.getByRole('button', { name: 'Off' }));

        expect(screen.getByText('Override lock is on')).toBeInTheDocument();
    });

    it('이 기기가 못 쓰는 키는 컨트롤 대신 이유를 보여준다', async () => {
        snapshotAll.mockReturnValue([snap({ canWrite: ['shell'] })]);
        render(<ConfigScreen />);

        await userEvent.click(screen.getByRole('button', { name: /로그 업로드 보류/ }));

        expect(screen.queryByRole('button', { name: 'Off' })).not.toBeInTheDocument();
        expect(screen.getByText(/Read-only/)).toBeInTheDocument();
    });

    it('적용 시점을 함께 말한다', async () => {
        snapshotAll.mockReturnValue([numberSnap({ entry: { ...numberSnap().entry, appliesAt: 'restart' } })]);
        render(<ConfigScreen />);

        await userEvent.click(screen.getByRole('button', { name: /HTTP 재시도 횟수/ }));

        expect(screen.getByText(/Applies after restart/)).toBeInTheDocument();
    });

    it('새로고침은 다시 읽는다', async () => {
        render(<ConfigScreen />);
        const before = snapshotAll.mock.calls.length;

        await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));

        expect(snapshotAll.mock.calls.length).toBeGreaterThan(before);
    });
});

it('config 파사드를 통해 읽는다', () => {
    expect(typeof runtime.settings.snapshotAll).toBe('function');
});

describe('ConfigScreen — the checkout keys', () => {
    beforeEach(() => {
        setDebugLanguageForTests('en');
        jest.clearAllMocks();
        set.mockReturnValue({ ok: true });
    });

    const checkoutSnap = snap({
        key: 'port.checkout',
        entry: {
            title: 'Checkout adapter',
            description: 'Who sells',
            type: 'string',
            defaultValue: '',
            meta: false,
        },
        value: '',
        isOverridden: false,
    });

    it("offers the runtime's checkout candidates in a list, the ones this host does not offer disabled", async () => {
        snapshotAll.mockReturnValue([checkoutSnap]);
        render(<ConfigScreen />);
        await userEvent.click(screen.getByText('Checkout adapter'));

        const list = screen.getByRole('combobox', { name: 'Checkout adapter' });
        expect(screen.getByRole('option', { name: /checkout\.web/ })).toBeDisabled();
        expect(screen.getByRole('option', { name: 'checkout.none' })).toBeEnabled();

        await userEvent.selectOptions(list, 'checkout.none');
        expect(set).toHaveBeenCalledWith('port.checkout', 'checkout.none', { lane: 'local' });
    });
});
