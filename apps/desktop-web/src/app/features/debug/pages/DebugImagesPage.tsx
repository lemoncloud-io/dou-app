import { useState } from 'react';

import { Button } from '@chatic/ui-kit/components/ui/button';

import { useChats, useSelectedChannelStore } from '../../../shared';
import { useChatImagesStore } from '../../chat/stores';
import { isFeedVisible, type ChatImage } from '../../chat/utils';

/** Image counts the samples cover, oldest message first: single, pair, full grid, "+n". */
const SAMPLE_COUNTS = [1, 2, 4, 10] as const;

const HUES = [96, 205, 28, 265, 340, 160, 48, 190, 0, 120];

/** A labelled gradient PNG, drawn locally so the samples need no network and no asset. */
const drawSample = (index: number, wide: boolean): Promise<string> => {
    const canvas = document.createElement('canvas');
    canvas.width = wide ? 1200 : 900;
    canvas.height = 900;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        const hue = HUES[index % HUES.length];
        const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        gradient.addColorStop(0, `hsl(${hue} 70% 62%)`);
        gradient.addColorStop(1, `hsl(${(hue + 50) % 360} 60% 30%)`);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.font = 'bold 160px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(index + 1), canvas.width / 2, canvas.height / 2);
    }
    return new Promise(resolve =>
        canvas.toBlob(blob => resolve(blob ? URL.createObjectURL(blob) : canvas.toDataURL()), 'image/png')
    );
};

const buildSamples = async (count: number, uploading: boolean): Promise<ChatImage[]> =>
    Promise.all(
        Array.from({ length: count }, async (_, i) => ({
            id: `sample-${count}-${i}-${Date.now()}`,
            name: `sample-${String(i + 1).padStart(2, '0')}.png`,
            url: await drawSample(i, i % 3 === 1),
            isUploading: uploading,
        }))
    );

/**
 * Dev-only preview of message images. The server has no upload API yet, so nothing real
 * carries images; this hangs generated samples on the open channel's latest messages
 * (1 · 2 · 4 · 10 images) so the feed grid, the hover actions and the viewer can be
 * checked in the real layout. Local to this window — nothing is sent.
 */
export const DebugImagesPage = () => {
    const channelId = useSelectedChannelStore(s => s.selectedChannelId);
    const { messages } = useChats(channelId);
    const setImages = useChatImagesStore(s => s.setImages);
    const clear = useChatImagesStore(s => s.clear);
    const attachedCount = useChatImagesStore(s => Object.keys(s.byMessage).length);
    const [uploading, setUploading] = useState(false);
    const [busy, setBusy] = useState(false);

    const targets = messages
        .filter(message => !!message.id && !message.hidden && message.stereo !== 'system' && isFeedVisible(message))
        .slice(-SAMPLE_COUNTS.length);

    const attach = async () => {
        setBusy(true);
        try {
            const sets = await Promise.all(
                targets.map((_, i) => buildSamples(SAMPLE_COUNTS[SAMPLE_COUNTS.length - targets.length + i], uploading))
            );
            targets.forEach((message, i) => message.id && setImages(message.id, sets[i]));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="mx-auto flex w-full max-w-md flex-col gap-4 p-8">
            <h1 className="text-base font-semibold text-foreground">Message images</h1>
            <p className="text-xs text-muted-foreground">
                Hangs sample images on the open channel&apos;s latest {SAMPLE_COUNTS.length} messages (
                {SAMPLE_COUNTS.join(' · ')} images). Local preview only — the upload API does not exist yet.
            </p>
            <div className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground">
                channel: {channelId ?? '—'} · eligible messages: {targets.length} · messages with images:{' '}
                {attachedCount}
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={uploading} onChange={e => setUploading(e.target.checked)} />
                Show as uploading
            </label>
            <div className="flex items-center gap-2">
                <Button size="sm" disabled={busy || targets.length === 0} onClick={() => void attach()}>
                    Attach samples
                </Button>
                <Button variant="outline" size="sm" onClick={clear}>
                    Clear
                </Button>
            </div>
        </div>
    );
};
