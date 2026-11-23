import { NativeModules } from 'react-native';
import type {
    AttachmentMaxBytes,
    AttachmentPickSource,
    OnPickAttachmentsPayload,
    OnPrepareVideoPayload,
    OnReadAttachmentPayload,
    OnReadVideoFramePayload,
} from '@chatic/bridge-messages';

const { AttachmentPicker } = NativeModules;

const hasMethod = (name: string): boolean => typeof AttachmentPicker?.[name] === 'function';

export interface IAttachmentPickerBridge {
    readonly isAvailable: boolean;
    pick(
        source: AttachmentPickSource,
        selectionLimit: number,
        maxBytes: AttachmentMaxBytes
    ): Promise<OnPickAttachmentsPayload>;
    prepareVideo(uri: string): Promise<OnPrepareVideoPayload>;
    readAttachment(uri: string): Promise<OnReadAttachmentPayload>;
    readonly canReadVideoFrame: boolean;
    readVideoFrame(url: string, atMs: number, maxEdge: number): Promise<OnReadVideoFramePayload>;
}

const unavailable = (): Promise<never> =>
    Promise.reject(Object.assign(new Error('AttachmentPicker native module is not available'), { code: 'INTERNAL' }));

export const AttachmentPickerBridge: IAttachmentPickerBridge = {
    isAvailable: !!AttachmentPicker,
    pick: (source, selectionLimit, maxBytes) =>
        AttachmentPicker ? AttachmentPicker.pick(source, selectionLimit, maxBytes) : unavailable(),
    prepareVideo: uri => (AttachmentPicker ? AttachmentPicker.prepareVideo(uri) : unavailable()),
    readAttachment: uri => (AttachmentPicker ? AttachmentPicker.readAttachment(uri) : unavailable()),
    canReadVideoFrame: hasMethod('readVideoFrame'),
    readVideoFrame: (url, atMs, maxEdge) =>
        hasMethod('readVideoFrame') ? AttachmentPicker.readVideoFrame(url, atMs, maxEdge) : unavailable(),
};
