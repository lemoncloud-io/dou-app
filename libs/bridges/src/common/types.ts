import type { AppMessageData, AppMessageType, EventMessageType } from '@chatic/app-messages'; // 실제 경로에 맞게 수정
import type { WebMessageData, WebMessageType } from '@chatic/app-messages'; // 실제 경로에 맞게 수정

// ======================================================================
// Alias & Common
// ======================================================================
export type RequestType = WebMessageType;
export type ResponseType = AppMessageType;
export type EventType = EventMessageType;

export type PayloadMap = Record<string, unknown>;

// ======================================================================
// Pair Relation Mapping (Request <-> Response 완벽한 1:1 매칭)
// ======================================================================
export type RequestMessage = WebMessageData<WebMessageType>;
export type EventMessage = AppMessageData<EventMessageType>;
export type ResponseMessage = AppMessageData<AppMessageType>;
