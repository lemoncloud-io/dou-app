import type { AppMessageData, AppMessageType } from '@chatic/app-messages';
import type { WebMessageData, WebMessageType } from '@chatic/app-messages';

export type RequestMessage = WebMessageData<WebMessageType>;
export type EventMessage = AppMessageData<AppMessageType>;
export type ResponseMessage = AppMessageData<AppMessageType>;
