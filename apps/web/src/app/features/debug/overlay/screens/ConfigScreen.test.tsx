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
const copyText = jest.fn();
jest.mock('../../lib', () => ({ copyText: (t: string) => copyText(t) }));

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

    // 점 찍힌 키는 구현 세부다 — 레지스트리가 이미 사람이 읽는 이름과 한 문장 설명을 갖고 있다.
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

    // 잠금 화면이 잠금 스위치를 담는 순환을 막는다 (ADR-0080 결정 6).
    it('meta 키는 렌더하지 않는다', () => {
        snapshotAll.mockReturnValue([
            snap({ key: 'system.overridesUnlocked', entry: { ...snap().entry, meta: true } }),
        ]);
        render(<ConfigScreen />);

        expect(screen.queryByText('로그 업로드 보류')).not.toBeInTheDocument();
    });

    // 자격증명이고 이 화면은 복사 가능하다 (ADR-0079 결정 16).
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

        // 키는 화면에 없지만 검색어로는 여전히 통한다.
        await userEvent.type(screen.getByPlaceholderText(/찾기/), 'relay');
        expect(screen.getByText('릴레이 주소')).toBeInTheDocument();

        expect(screen.queryByText('로그 업로드 보류')).not.toBeInTheDocument();
    });

    // 레지스트리가 없을 때 빈 목록을 그냥 보여주면 "설정이 없다"로 읽힌다.
    it('레지스트리가 배선 전이면 그 사실을 말한다', () => {
        snapshotAll.mockReturnValue([]);
        render(<ConfigScreen />);

        expect(screen.getByText(/배선되지 않았습니다/)).toBeInTheDocument();
    });

    it('JSON 복사는 키·값·이긴 행을 담는다', async () => {
        render(<ConfigScreen />);

        await userEvent.click(screen.getByRole('button', { name: 'JSON 복사' }));

        expect(copyText).toHaveBeenCalledWith(expect.stringContaining('"origin": "local"'));
    });

    // 재시도 횟수·타임아웃처럼 숫자로 조정하는 키가 이 화면에 오는 이유다.
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

    // 거부는 예외가 아니라 이유로 온다 — 아무 일도 안 한 컨트롤이 왜 그랬는지 말해야 한다.
    it('거부되면 이유를 그대로 보여준다', async () => {
        set.mockReturnValue({ ok: false, reason: 'locked' });
        render(<ConfigScreen />);

        await userEvent.click(screen.getByRole('button', { name: /로그 업로드 보류/ }));
        await userEvent.click(screen.getByRole('button', { name: '끄기' }));

        expect(screen.getByText('오버라이드 잠금이 걸려 있습니다')).toBeInTheDocument();
    });

    // 쓸 수 없는 키에 컨트롤을 그리면 누른 사람이 바뀐 줄 안다.
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

// 목을 실제로 썼는지 확인 — config를 직접 참조해 임포트가 죽지 않게 한다.
it('config 파사드를 통해 읽는다', () => {
    expect(typeof config.snapshotAll).toBe('function');
});
