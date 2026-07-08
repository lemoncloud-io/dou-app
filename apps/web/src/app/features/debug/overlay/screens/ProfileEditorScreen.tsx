import { useEffect, useRef, useState } from 'react';

import { useGlobalSession, useSessionIdentity } from '@chatic/web-core';
import { useRuntimeRepositories } from '@chatic/app-runtime';
import type { DataRepositoriesV2, DomainProfile } from '@chatic/data';

import { Row } from '../../components/Row';
import { Section } from '../../components/Section';

// Edits the current user's site profile (nick/thumbnail) for the active place. Writes via
// repos.profile.setMyProfile (optimistic cache + profile.set), which uses the live sid/uid.
export const ProfileEditorScreen = () => {
    const repos = useRuntimeRepositories() as unknown as DataRepositoriesV2;
    const { activeServer } = useGlobalSession();
    const identity = useSessionIdentity();
    const sid = activeServer.siteId ?? '';
    const uid = identity.userId ?? '';
    const profileId = sid && uid ? `${sid}@${uid}` : '';

    const [current, setCurrent] = useState<DomainProfile | null>(null);
    const [nick, setNick] = useState('');
    const [thumbnail, setThumbnail] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    const prefilledRef = useRef(false);

    // Observe the current profile so the form reflects synced changes.
    useEffect(() => {
        if (!profileId) {
            setCurrent(null);
            return;
        }
        return repos.profile.observeItem(profileId, setCurrent);
    }, [repos.profile, profileId]);

    // Prefill inputs once per profile (don't clobber in-progress edits on later emits).
    useEffect(() => {
        prefilledRef.current = false;
    }, [profileId]);
    useEffect(() => {
        if (current && !prefilledRef.current) {
            prefilledRef.current = true;
            setNick(current.nick ?? '');
            setThumbnail(current.thumbnail ?? '');
        }
    }, [current]);

    const handleSave = async () => {
        setError(null);
        setSaved(false);
        setSaving(true);
        try {
            await repos.profile.setMyProfile({
                nick: nick.trim(),
                ...(thumbnail.trim() ? { thumbnail: thumbnail.trim() } : {}),
            });
            setSaved(true);
        } catch (e: any) {
            setError(e?.message ?? String(e));
        } finally {
            setSaving(false);
        }
    };

    if (!sid || !uid) {
        return (
            <p className="p-6 text-xs text-muted-foreground">
                사이트(플레이스)를 먼저 선택해야 내 프로필을 설정할 수 있습니다.
            </p>
        );
    }

    return (
        <div className="space-y-3 p-4">
            <Section title="내 프로필">
                <Row label="profileId" value={profileId} />
                <Row label="현재 nick" value={current?.nick ?? '—'} />
            </Section>

            <div className="space-y-2">
                <div className="flex flex-col gap-0.5">
                    <label className="text-[10px] text-muted-foreground">nick</label>
                    <input
                        value={nick}
                        onChange={e => setNick(e.target.value)}
                        placeholder="표시 이름"
                        className="border border-border bg-background rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                </div>
                <div className="flex flex-col gap-0.5">
                    <label className="text-[10px] text-muted-foreground">thumbnail (URL 또는 base64)</label>
                    <input
                        value={thumbnail}
                        onChange={e => setThumbnail(e.target.value)}
                        placeholder="https://... 또는 data:image/..."
                        className="border border-border bg-background rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                </div>
                {thumbnail.trim() && (
                    <img
                        src={thumbnail}
                        alt="preview"
                        className="w-12 h-12 rounded-full object-cover border border-border"
                    />
                )}
                {error && <p className="text-xs text-destructive">{error}</p>}
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => void handleSave()}
                        disabled={saving}
                        className="px-3 py-1 text-xs rounded bg-primary text-primary-foreground disabled:opacity-50 hover:opacity-80"
                    >
                        {saving ? '저장 중...' : '저장'}
                    </button>
                    {saved && <span className="text-xs text-muted-foreground">저장됨 ✓</span>}
                </div>
            </div>
        </div>
    );
};
