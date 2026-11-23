export type RuntimeWireValue =
    | null
    | boolean
    | number
    | string
    | RuntimeWireValue[]
    | { [key: string]: RuntimeWireValue };

export type RuntimeOffer = {
    sessionOwner: 'native';
    contracts: number[];
    held?: boolean;
};

export type RuntimeHelloPayload = {
    contracts: number[];
};

export type OnRuntimeHelloPayload =
    | { sessionOwner: 'web' }
    | {
          sessionOwner: 'native';
          contract: number;
          seq: number;
          session: RuntimeWireValue;
      };

export type RuntimeCallPayload = {
    target: string;
    method: string;
    args: RuntimeWireValue[];
};

export type OnRuntimeCallPayload = {
    value: RuntimeWireValue;
};

export type RuntimeSubscribePayload = {
    subscriptionId: string;
    target: string;
    topic: string;
    args: RuntimeWireValue[];
};

export type OnRuntimeSubscribePayload = Record<string, never>;

export type RuntimeUnsubscribePayload = {
    subscriptionId: string;
};

export type OnRuntimeUnsubscribePayload = Record<string, never>;

export type OnRuntimeEventPayload = {
    subscriptionId: string;
    seq: number;
    event: RuntimeWireValue;
};

export type OnRuntimeSessionChangedPayload = {
    seq: number;
    signals: string[];
    session: RuntimeWireValue;
};
