export type HapticKind = 'selection' | 'impact' | 'success' | 'warning' | 'error';

export type TriggerHapticPayload = {
    kind: HapticKind;
};

export type OnTriggerHapticPayload = {};
