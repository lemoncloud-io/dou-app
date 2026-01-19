import { webCore } from '@chatic/web-core';

import type { DeviceListResponse } from '../types';

const USE_MOCK_DATA = false;

const mockDeviceList: DeviceListResponse = {
    total: 10,
    limit: 10,
    page: 0,
    list: [
        {
            id: '8b340aa6-cb61-44af-b3e4-980a3300a268',
            createdAt: Date.now() - 3600000,
            updatedAt: Date.now() - 60000,
            deletedAt: 0,
            $: {},
            name: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
            status: 'green',
            tick: 0,
            platform: 'macos',
            connectedAt: Date.now() - 300000,
            disconnectedAt: 0,
            connId: 'Xa1Nac-2IE0CEYA=',
        },
        {
            id: 'da55a53e-fdb2-423c-a699-c4b431573239',
            createdAt: Date.now() - 7200000,
            updatedAt: Date.now() - 1800000,
            deletedAt: 0,
            $: {},
            name: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Whale/4.34.340.19 Safari/537.36',
            status: 'yellow',
            tick: 0,
            platform: 'macos',
            connectedAt: Date.now() - 600000,
            disconnectedAt: 0,
            connId: 'XaxESfoJoE0CFhw=',
        },
        {
            id: 'c0753e50-3d8b-4493-9971-5c56bbc04ffa',
            createdAt: Date.now() - 86400000,
            updatedAt: Date.now() - 120000,
            deletedAt: 0,
            $: {},
            name: 'TEST:c0753e50-3d8b-4493-9971-5c56bbc04ffa',
            status: 'green',
            tick: 0,
            platform: 'web',
            connectedAt: Date.now() - 120000,
            disconnectedAt: 0,
            connId: 'Xa08dc1ioE0CEeQ=',
        },
        {
            id: '60334f5e-f549-454b-a628-334a3ed4e033',
            createdAt: Date.now() - 172800000,
            updatedAt: Date.now() - 3600000,
            deletedAt: 0,
            $: {},
            name: 'TEST:60334f5e-f549-454b-a628-334a3ed4e033',
            status: 'red',
            tick: 0,
            platform: 'web',
            connectedAt: Date.now() - 7200000,
            disconnectedAt: Date.now() - 3600000,
            connId: 'XarZNdABoE0CFmg=',
        },
        {
            id: '6492b119-4e15-4d23-8811-fef2adba2545',
            createdAt: Date.now() - 259200000,
            updatedAt: Date.now() - 86400000,
            deletedAt: 0,
            $: {},
            name: '레인의 디바이스',
            status: 'red',
            tick: 0,
            platform: 'web',
            lastActiveAt: Date.now() - 90000000,
            connectedAt: Date.now() - 172800000,
            disconnectedAt: Date.now() - 86400000,
            connId: 'XaqZte_poE0CFYg=',
        },
        {
            id: 'a0a0b671-6660-45ad-80a6-6814b3d0b9ac',
            createdAt: Date.now() - 432000000,
            updatedAt: Date.now() - 30000,
            deletedAt: 0,
            $: {},
            name: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
            status: 'green',
            tick: 0,
            platform: 'ios',
            connectedAt: Date.now() - 30000,
            disconnectedAt: 0,
            connId: 'Xa08dcnJIE0Acfw=',
        },
        {
            id: 'd3e9bf80-6b8b-4d52-9cef-c7b2c48484c2',
            createdAt: Date.now() - 604800000,
            updatedAt: Date.now() - 1200000,
            deletedAt: 0,
            $: {},
            name: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
            status: 'yellow',
            tick: 0,
            platform: 'windows',
            connectedAt: Date.now() - 1800000,
            disconnectedAt: 0,
            connId: 'XaoLecaZoE0CIeg=',
        },
        {
            id: '5d9aa4c8-755b-461f-ac59-c14086034166',
            createdAt: Date.now() - 864000000,
            updatedAt: Date.now() - 7200000,
            deletedAt: 0,
            $: {},
            name: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36',
            status: 'red',
            tick: 0,
            platform: 'android',
            connectedAt: Date.now() - 14400000,
            disconnectedAt: Date.now() - 7200000,
            connId: 'XaxLRfAFoE0CFFg=',
        },
        {
            id: '685613bd-deec-4752-83c0-b614ce0935dc',
            createdAt: Date.now() - 1209600000,
            updatedAt: Date.now() - 180000,
            deletedAt: 0,
            $: {},
            name: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
            status: 'green',
            tick: 0,
            platform: 'macos',
            connectedAt: Date.now() - 180000,
            disconnectedAt: 0,
            connId: 'XRH5FeGboE0CJ8g=',
        },
        {
            id: '3d4a85ad-ca7c-49fb-8faf-f1ba8c98bccd',
            createdAt: Date.now() - 2592000000,
            updatedAt: Date.now() - 900000,
            deletedAt: 0,
            $: {},
            name: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
            status: 'yellow',
            tick: 0,
            platform: 'windows',
            lastActiveAt: Date.now() - 600000,
            connectedAt: Date.now() - 900000,
            disconnectedAt: 0,
            connId: 'XQwwFeJ_oE0CJMg=',
        },
    ],
};

const getSocketApiEndpoint = (): string => {
    const backendEndpoint = import.meta.env.VITE_BACKEND_ENDPOINT || '';
    return backendEndpoint.replace('/d1', '');
};

interface FetchDeviceListParams {
    page?: number;
    limit?: number;
    status?: 'green' | 'yellow' | 'red';
}

export const fetchDeviceList = async ({
    page = 0,
    limit = 10,
    status,
}: FetchDeviceListParams = {}): Promise<DeviceListResponse> => {
    if (USE_MOCK_DATA) {
        await new Promise(resolve => setTimeout(resolve, 500));
        return mockDeviceList;
    }

    const { data } = await webCore
        .buildSignedRequest({
            method: 'GET',
            baseURL: `${getSocketApiEndpoint()}/skt-d1/hello/device/list`,
        })
        .setParams({ page, limit, ...(status && { status }) })
        .execute<DeviceListResponse>();
    return data;
};
