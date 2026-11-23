const DAY_MS = 24 * 60 * 60 * 1000;

export const WEBHOOK_EXPIRY_PRESETS = [
    { id: 'never', days: 0, labelKey: 'chat.settings.webhooks.expiryNever' },
    { id: '7', days: 7, labelKey: 'chat.settings.webhooks.expiry7' },
    { id: '30', days: 30, labelKey: 'chat.settings.webhooks.expiry30' },
    { id: '90', days: 90, labelKey: 'chat.settings.webhooks.expiry90' },
] as const;

export type WebhookExpiryPresetId = (typeof WEBHOOK_EXPIRY_PRESETS)[number]['id'];

export const expiresAtForPreset = (id: WebhookExpiryPresetId, now: number = Date.now()): number => {
    const preset = WEBHOOK_EXPIRY_PRESETS.find(p => p.id === id);
    return preset && preset.days > 0 ? now + preset.days * DAY_MS : 0;
};
