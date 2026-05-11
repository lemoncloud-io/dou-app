import type { SocketGateway } from '../types';
import { MockSocketClient } from '../../__mocks__/MockSocketClient';
import type { DeviceBody, DeviceView } from '@lemoncloud/chatic-sockets-api';

/**
 * DeviceGateway의 목업 구현체입니다.
 * 실제 SocketClient 없이도 동작하며, 테스트에서 반환 값을 제어할 수 있습니다.
 */
export class MockDeviceGateway implements SocketGateway {
    readonly domain = 'device';
    readonly client = new MockSocketClient(); // 내부적으로 MockSocketClient를 가질 수 있음

    // 메서드 호출 추적
    readDevice = jest.fn<Promise<DeviceView>, [string]>();
    saveDevice = jest.fn<Promise<DeviceView>, [string, DeviceBody]>();

    constructor() {
        // 기본 반환 값 설정
        this.readDevice.mockResolvedValue({ id: 'mock-id', name: 'Mock Device', lastSeen: Date.now(), tick: 1 });
        this.saveDevice.mockImplementation(async (id, body) => ({
            id,
            name: body.name || 'Mock Device',
            lastSeen: Date.now(),
            tick: 2,
        }));
    }

    // --- 테스트용 헬퍼 메서드 ---

    /**
     * readDevice 메서드의 목업 반환 값을 설정합니다.
     * @param device 반환할 DeviceView 객체
     */
    _setMockReadDeviceResponse(device: DeviceView) {
        this.readDevice.mockResolvedValue(device);
    }
}
