const DAY_MS = 24 * 60 * 60 * 1000;

/** The expiry choices the UI offers. `days: 0` is "never expires" — what the server reads as `expiresAt: 0`. */
export const WEBHOOK_EXPIRY_PRESETS = [
    { id: 'never', days: 0, labelKey: 'channels.webhooks.expiryNever' },
    { id: '7', days: 7, labelKey: 'channels.webhooks.expiry7' },
    { id: '30', days: 30, labelKey: 'channels.webhooks.expiry30' },
    { id: '90', days: 90, labelKey: 'channels.webhooks.expiry90' },
] as const;

export type WebhookExpiryPresetId = (typeof WEBHOOK_EXPIRY_PRESETS)[number]['id'];

/** The `expiresAt` (epoch ms) a preset means when picked at `now`; 0 = never. */
export const expiresAtForPreset = (id: WebhookExpiryPresetId, now: number = Date.now()): number => {
    const preset = WEBHOOK_EXPIRY_PRESETS.find(p => p.id === id);
    return preset && preset.days > 0 ? now + preset.days * DAY_MS : 0;
};
