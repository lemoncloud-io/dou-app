import type { Page, TestInfo } from '@playwright/test';

export const SHOT_PREFIX = 'evidence: ';
export const METRICS_ATTACHMENT = 'load-metrics';

export interface Metric {
    name: string;
    value: number | null;
    unit: 'ms' | 'MB' | 'count';
    note?: string;
}

export class Evidence {
    readonly metrics: Metric[] = [];
    private shots = 0;

    constructor(
        private readonly page: Page,
        private readonly testInfo: TestInfo
    ) {}

    async shot(caption: string): Promise<void> {
        this.shots += 1;
        const body = await this.page.screenshot({ animations: 'disabled', type: 'jpeg', quality: 70 });
        await this.testInfo.attach(`${SHOT_PREFIX}${String(this.shots).padStart(2, '0')} ${caption}`, {
            body,
            contentType: 'image/jpeg',
        });
    }

    metric(name: string, value: number | null, unit: Metric['unit'], missingNote?: string): void {
        if (value === null) this.metrics.push({ name, value: null, unit, note: missingNote });
        else this.metrics.push({ name, value: Math.round(value * 10) / 10, unit });
    }

    async attach(): Promise<void> {
        if (this.metrics.length === 0) return;
        await this.testInfo.attach(METRICS_ATTACHMENT, {
            body: JSON.stringify(this.metrics, null, 2),
            contentType: 'application/json',
        });
    }
}
