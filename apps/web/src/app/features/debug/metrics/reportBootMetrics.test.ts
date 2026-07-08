jest.mock('@chatic/bridges', () => ({ isNative: jest.fn() }));
jest.mock('../../../bridge', () => ({ appBridge: { sendBootMetrics: jest.fn() } }));

import { isNative } from '@chatic/bridges';

import { appBridge } from '../../../bridge';
import { scheduleBootMetricsReport } from './reportBootMetrics';

const isNativeMock = isNative as jest.Mock;
const sendMock = appBridge.sendBootMetrics as jest.Mock;

describe('scheduleBootMetricsReport — 웹 부팅 스냅샷 네이티브 전송', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('네이티브 셸에서 지연 후 1회만 전송한다 (중복 호출 무시)', () => {
        isNativeMock.mockReturnValue(true);

        scheduleBootMetricsReport();
        scheduleBootMetricsReport();
        expect(sendMock).not.toHaveBeenCalled();

        jest.runAllTimers();

        expect(sendMock).toHaveBeenCalledTimes(1);
        const payload = sendMock.mock.calls[0][0];
        expect(payload).toHaveProperty('marks');
        expect(payload).toHaveProperty('assets');
    });

    it('일반 브라우저에서는 전송하지 않는다', () => {
        isNativeMock.mockReturnValue(false);
        scheduleBootMetricsReport();
        jest.runAllTimers();
        expect(sendMock).not.toHaveBeenCalled();
    });
});
