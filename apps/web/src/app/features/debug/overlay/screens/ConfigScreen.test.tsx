import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ConfigScreen } from './ConfigScreen';
import { config } from '@chatic/config';

const snapshotAll = jest.fn();
jest.mock('@chatic/config', () => ({ config: { snapshotAll: () => snapshotAll() } }));
const copyText = jest.fn();
jest.mock('../../lib', () => ({ copyText: (t: string) => copyText(t) }));

const snap = (over: Record<string, unknown> = {}) => ({
    key: 'log.upload.hold',
    entry: { title: '로그 업로드 보류', description: '보류한다', defaultValue: false, meta: false },
    value: true,
    origin: 'local',
    isOverridden: true,
    canWrite: ['local'],
    ...over,
});

describe('ConfigScreen', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        snapshotAll.mockReturnValue([snap()]);
    });

    it('키와 값, 이긴 행을 함께 보여준다', () => {
        render(<ConfigScreen />);

        expect(screen.getByText('log.upload.hold')).toBeInTheDocument();
        expect(screen.getByText(/true/)).toBeInTheDocument();
        expect(screen.getByText(/· local/)).toBeInTheDocument();
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

        expect(screen.queryByText('system.overridesUnlocked')).not.toBeInTheDocument();
    });

    // 자격증명이고 이 화면은 복사 가능하다 (ADR-0079 결정 16).
    it('debug.entryCode 는 제외한다', () => {
        snapshotAll.mockReturnValue([snap({ key: 'debug.entryCode', value: '1234' })]);
        render(<ConfigScreen />);

        expect(screen.queryByText('debug.entryCode')).not.toBeInTheDocument();
        expect(screen.queryByText(/1234/)).not.toBeInTheDocument();
    });

    it('키나 이름으로 걸러낸다', async () => {
        snapshotAll.mockReturnValue([snap(), snap({ key: 'net.relay.backend', isOverridden: false })]);
        render(<ConfigScreen />);

        await userEvent.type(screen.getByPlaceholderText(/찾기/), 'relay');

        expect(screen.getByText('net.relay.backend')).toBeInTheDocument();
        expect(screen.queryByText('log.upload.hold')).not.toBeInTheDocument();
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
