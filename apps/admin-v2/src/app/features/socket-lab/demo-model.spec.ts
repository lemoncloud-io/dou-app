import { describe, expect, it } from 'vitest';
import { createShortDeviceId, toDeviceBody, toPositiveInt } from './demo-model';

describe('demo/demo-model', () => {
    it('should create a clean device body from draft input', () => {
        expect(
            toDeviceBody({
                id: ' device-A ',
                name: ' Browser ',
                platform: 'web',
                status: 'green',
                posX: '120.5',
                posY: 'x',
            })
        ).toEqual({
            id: 'device-A',
            name: 'Browser',
            platform: 'web',
            status: 'green',
            posX: 120.5,
        });
    });

    it('should keep positive integer fallbacks safe', () => {
        expect(toPositiveInt('1200', 1)).toEqual(1200);
        expect(toPositiveInt('0', 5)).toEqual(5);
        expect(toPositiveInt('abc', 5)).toEqual(5);
    });

    it('should create a short device id', () => {
        expect(createShortDeviceId()).toHaveLength(6);
    });
});
