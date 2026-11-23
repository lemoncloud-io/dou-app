import { renderHook } from '@testing-library/react';

import { usePermissionHandler } from './usePermissionHandler';

const permissionService = {
    check: jest.fn(async () => false),
    request: jest.fn(async () => 'DENIED'),
};
const logService = { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() };

jest.mock('../../hooks', () => ({
    useServices: () => ({ permissionService, logService }),
}));

const ask = (permission = 'CAMERA') =>
    renderHook(() => usePermissionHandler()).result.current.handleRequestPermission({
        type: 'RequestPermission',
        data: { permission },
    } as any);

describe('usePermissionHandler', () => {
    beforeEach(() => jest.clearAllMocks());

    it('reports GRANTED when the request is granted', async () => {
        permissionService.request.mockResolvedValueOnce('GRANTED');

        const res: any = await ask();

        expect(res).toEqual({
            type: 'OnRequestPermission',
            success: true,
            data: { permission: 'CAMERA', status: 'GRANTED' },
        });
    });

    it('reports DENIED when the request is denied but not blocked', async () => {
        const res: any = await ask();

        expect(res.data.status).toBe('DENIED');
    });

    it('reports BLOCKED when the OS will no longer prompt', async () => {
        permissionService.request.mockResolvedValueOnce('BLOCKED');

        const res: any = await ask();

        expect(res).toEqual({
            type: 'OnRequestPermission',
            success: true,
            data: { permission: 'CAMERA', status: 'BLOCKED' },
        });
    });
});
