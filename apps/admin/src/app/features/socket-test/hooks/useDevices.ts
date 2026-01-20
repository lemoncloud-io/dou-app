import { useEffect } from 'react';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useWebSocketStore } from '@chatic/socket';

import { fetchDeviceList } from '../api/deviceApi';

import type { DeviceListResponse, DevicePayload, DeviceView, WSSEnvelope } from '../types';

interface UseDevicesOptions {
    page?: number;
    limit?: number;
    status?: 'green' | 'yellow' | 'red';
}

const isDeviceUpdateMessage = (data: unknown): data is WSSEnvelope<DevicePayload> => {
    if (!data || typeof data !== 'object') return false;
    if (!('type' in data) || data.type !== 'system') return false;
    if (!('action' in data) || data.action !== 'updated') return false;
    if (!('payload' in data) || !data.payload || typeof data.payload !== 'object') return false;
    if (!('type' in data.payload) || data.payload.type !== 'device') return false;
    return true;
};

const mapPayloadToDeviceView = (payload: DevicePayload): DeviceView => ({
    id: payload.id,
    name: payload.name,
    status: payload.status,
    platform: payload.platform,
    connId: payload.connId,
    tick: payload.tick,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
    deletedAt: payload.deletedAt,
    connectedAt: payload.connectedAt,
    disconnectedAt: payload.disconnectedAt,
    lastActiveAt: payload.lastActiveAt,
    $: payload.$,
});

export const useDevices = ({ page = 0, limit = 10, status }: UseDevicesOptions = {}) => {
    const queryClient = useQueryClient();
    const subscribe = useWebSocketStore(state => state.subscribe);

    useEffect(() => {
        const unsubscribe = subscribe(message => {
            if (isDeviceUpdateMessage(message.data)) {
                const updatedDevice = mapPayloadToDeviceView(message.data.payload);

                queryClient.setQueriesData<DeviceListResponse>({ queryKey: ['admin', 'devices'] }, oldData => {
                    if (!oldData) return oldData;

                    const deviceIndex = oldData.list.findIndex(d => d.id === updatedDevice.id);
                    if (deviceIndex === -1) return oldData;

                    const oldDevice = oldData.list[deviceIndex];
                    const newList = [...oldData.list];
                    newList[deviceIndex] = updatedDevice;

                    let newAggr = oldData.aggr;
                    if (oldDevice.status !== updatedDevice.status && oldData.aggr?.status) {
                        const oldStatus = oldData.aggr.status;
                        newAggr = {
                            status: {
                                ...oldStatus,
                                [oldDevice.status]: (oldStatus[oldDevice.status] ?? 1) - 1,
                                [updatedDevice.status]: (oldStatus[updatedDevice.status] ?? 0) + 1,
                            },
                        };
                    }

                    return {
                        ...oldData,
                        list: newList,
                        aggr: newAggr,
                    };
                });
            }
        });

        return unsubscribe;
    }, [subscribe, queryClient]);

    return useQuery({
        queryKey: ['admin', 'devices', { page, limit, status }],
        queryFn: () => fetchDeviceList({ page, limit, status }),
        gcTime: 0,
    });
};
