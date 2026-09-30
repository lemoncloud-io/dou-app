/**
 * The feel of a haptic, not the gesture that asks for it — each shell maps these onto its own
 * platform's feedback so the web never names an OS constant.
 * - `selection` — the lightest tick, for a control snapping to a new position.
 * - `impact` — a short, firmer tap, for a threshold that commits an action on release.
 */
export type HapticKind = 'selection' | 'impact';

/** [Request] Play one short haptic. The shell honours the device's own touch-feedback setting. */
export type TriggerHapticPayload = {
    kind: HapticKind;
};

/** [Response] The haptic was handed to the OS. Whether the device actually buzzed is not observable. */
export type OnTriggerHapticPayload = {
    // Empty object type, reserved for future extension (optional fields, etc.).
};
