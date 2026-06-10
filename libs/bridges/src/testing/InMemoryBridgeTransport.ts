import type { AppMessageType, BridgeErrorResponse, WebMessageType } from '@chatic/app-messages';
import { WEB_MESSAGE_RESPONSE_TYPE } from '@chatic/app-messages';
import type { EventMessage, RequestMessage, ResponseMessage } from '../common';
import type { BridgeAdapter } from '../web/adapters';

export interface TestBridgeFailureConfig {
    code?: string;
    message?: string;
    recoverable?: boolean;
}

export interface InMemoryBridgeTransportConfig {
    /** Web -> App -> Web 왕복 지연 시간입니다. 각 방향에 절반씩 적용합니다. */
    rttDelayMs?: number;
    /** true면 App host를 거치지 않고 모든 request에 bridge-level 실패 응답을 반환합니다. */
    forceFailure?: boolean | TestBridgeFailureConfig;
    /** true면 request를 App host로 보내지 않아 WebBridgeClient timeout을 검증할 수 있습니다. */
    timeoutMode?: boolean;
    /** 0~1 사이 값. 해당 확률로 메시지를 드롭합니다. */
    dropRate?: number;
    /** true면 response type mismatch를 강제로 발생시킵니다. */
    responseTypeMismatch?: boolean | AppMessageType;
    /** true면 malformed bridge response를 강제로 발생시킵니다. */
    malformedResponse?: boolean;
    random?: () => number;
    logger?: Pick<Console, 'debug' | 'warn'>;
}

export class InMemoryBridgeTransport implements BridgeAdapter {
    private readonly handlers = new Set<(message: ResponseMessage | EventMessage) => void>();
    private readonly config: InMemoryBridgeTransportConfig;
    private sendToApp?: (message: RequestMessage) => void;

    constructor(config: InMemoryBridgeTransportConfig = {}) {
        this.config = config;
    }

    public connectApp(sendToApp: (message: RequestMessage) => void): void {
        this.sendToApp = sendToApp;
    }

    public postMessage(message: RequestMessage): void {
        if (this.shouldDrop()) {
            this.config.logger?.debug?.('[InMemoryBridgeTransport] Web -> App message dropped.', message.type);
            return;
        }

        if (this.config.timeoutMode) {
            this.config.logger?.debug?.('[InMemoryBridgeTransport] Web -> App message held for timeout.', message.type);
            return;
        }

        if (this.config.forceFailure) {
            this.schedule(() => this.emitToWeb(this.createFailureResponse(message)), this.totalDelayMs);
            return;
        }

        this.schedule(() => {
            if (!this.sendToApp) {
                this.emitToWeb(
                    this.createFailureResponse(message, {
                        code: 'NOT_FOUND',
                        message: '테스트 App host가 연결되어 있지 않습니다.',
                    })
                );
                return;
            }
            this.sendToApp(message);
        }, this.oneWayDelayMs);
    }

    public onMessage(handler: (message: ResponseMessage | EventMessage) => void): () => void {
        this.handlers.add(handler);
        return () => {
            this.handlers.delete(handler);
        };
    }

    public receiveMessageFromApp(message: ResponseMessage | EventMessage): void {
        if (this.shouldDrop()) {
            this.config.logger?.debug?.('[InMemoryBridgeTransport] App -> Web message dropped.', message.type);
            return;
        }

        this.schedule(() => this.emitToWeb(this.transformResponse(message)), this.oneWayDelayMs);
    }

    private emitToWeb(message: ResponseMessage | EventMessage): void {
        this.handlers.forEach(handler => handler(message));
    }

    private transformResponse(message: ResponseMessage | EventMessage): ResponseMessage | EventMessage {
        if (this.config.malformedResponse && 'success' in message) {
            return {
                refId: message.refId,
                version: message.version,
                type: 'ERROR',
                success: true,
            } as unknown as ResponseMessage;
        }

        if (this.config.responseTypeMismatch && 'success' in message && message.success) {
            const mismatchType =
                typeof this.config.responseTypeMismatch === 'string'
                    ? this.config.responseTypeMismatch
                    : 'OnFetchSafeArea';
            return {
                ...message,
                type: mismatchType,
            } as ResponseMessage;
        }

        return message;
    }

    private createFailureResponse(message: RequestMessage, override?: TestBridgeFailureConfig): BridgeErrorResponse {
        const config = typeof this.config.forceFailure === 'object' ? this.config.forceFailure : {};
        const failure = { ...config, ...override };
        const requestType = message.type as WebMessageType;

        return {
            type: 'ERROR',
            refId: message.refId,
            version: message.version,
            nonce: message.nonce,
            success: false,
            error: {
                code: failure.code ?? 'TEST_BRIDGE_FAILURE',
                message: failure.message ?? '테스트 브릿지 설정에 의해 요청이 실패했습니다.',
                reason: 'The in-memory test bridge was configured to fail before reaching the app host.',
                requestType,
                expectedResponseType: WEB_MESSAGE_RESPONSE_TYPE[requestType],
                protocolVersion: message.version,
                recoverable: failure.recoverable ?? true,
            },
        };
    }

    private shouldDrop(): boolean {
        const rate = this.config.dropRate ?? 0;
        if (rate <= 0) return false;
        if (rate >= 1) return true;
        return (this.config.random ?? Math.random)() < rate;
    }

    private schedule(callback: () => void, delayMs: number): void {
        if (delayMs <= 0) {
            callback();
            return;
        }
        setTimeout(callback, delayMs);
    }

    private get totalDelayMs(): number {
        return Math.max(0, this.config.rttDelayMs ?? 0);
    }

    private get oneWayDelayMs(): number {
        return this.totalDelayMs / 2;
    }
}
