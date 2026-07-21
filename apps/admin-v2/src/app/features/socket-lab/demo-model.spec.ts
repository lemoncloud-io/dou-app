import { describe, expect, it } from 'vitest';
import {
    buildDefaultWsUrl,
    createAutoDeviceDraft,
    createDefaultChannelDraft,
    createDefaultConnectionDraft,
    createDemoPanel,
    createShortDeviceId,
    formatChannelMemberEvent,
    formatChannelSummary,
    formatChatSummary,
    formatDeviceSummary,
    formatSyncTargetKey,
    toDeviceBody,
    toPositiveInt,
} from './demo-model';

describe('demo/demo-model', () => {
    it('should prefer explicit wsUrl query parameter', () => {
        expect(buildDefaultWsUrl({ search: '?wsUrl=wss://demo.example/ws?v2' })).toEqual('wss://demo.example/ws?v2');
    });

    it('should append ?v2 to a custom ws query parameter', () => {
        expect(buildDefaultWsUrl({ search: '?ws=wss://demo.example/socket?v2' })).toEqual(
            'wss://demo.example/socket?v2'
        );
    });

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

    it('should format target keys and device summaries', () => {
        expect(formatSyncTargetKey()).toEqual('device:current');
        expect(formatSyncTargetKey('device-A')).toEqual('device:device-A');
        expect(formatDeviceSummary({ id: 'device-A', tick: 3, status: 'green', posX: 10, posY: 20 })).toContain(
            'id=device-A'
        );
    });

    it('should build a full default connection draft', () => {
        expect(createDefaultConnectionDraft('?wsUrl=wss://demo.example/ws?v2')).toMatchObject({
            wsUrl: 'wss://demo.example/ws?v2',
            syncIntervalMs: '2000',
            keepAliveIntervalMs: '10000',
        });
    });

    it('should create a panel descriptor from a seed draft', () => {
        const panel = createDemoPanel(2, createDefaultConnectionDraft('?wsUrl=wss://demo.example/ws?v2'));
        expect(panel.title).toEqual('Client 2');
        expect(panel.seed.wsUrl).toEqual('wss://demo.example/ws?v2');
        expect(panel.device.id).toHaveLength(6);
    });

    it('should keep positive integer fallbacks safe', () => {
        expect(toPositiveInt('1200', 1)).toEqual(1200);
        expect(toPositiveInt('0', 5)).toEqual(5);
        expect(toPositiveInt('abc', 5)).toEqual(5);
    });

    it('should create auto device draft with short id and default name', () => {
        expect(createShortDeviceId()).toHaveLength(6);
        const draft = createAutoDeviceDraft();
        expect(draft.id).toHaveLength(6);
        expect(draft.name).toContain(draft.id);
        expect(draft.platform).toBeTruthy();
    });

    it('should create channel defaults and summarize channel/chat views', () => {
        expect(createDefaultChannelDraft()).toEqual({
            stereo: 'public',
            name: 'demo-room',
            channelId: '',
            message: 'hello from demo',
            feedLimit: '10',
        });
        expect(
            formatChannelSummary({
                id: 'ch-1',
                name: 'General',
                stereo: 'public',
                chatNo: 3,
                memberIds: ['dev-a', 'dev-b'],
            })
        ).toEqual('id=ch-1 stereo=public chatNo=3 members=2 name=General');
        expect(formatChatSummary({ chatNo: 2, ownerId: 'dev-a', content: 'hello' })).toEqual('#2 dev-a: hello');
    });

    it('should format channel member events for demo logs', () => {
        expect(
            formatChannelMemberEvent({
                channelId: 'ch-1',
                memberId: 'dev-b',
                actorDeviceId: 'dev-a',
                reason: 'kick',
            })
        ).toEqual('kick member=dev-b actor=dev-a channel=ch-1');
    });
});
