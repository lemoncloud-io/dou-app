import { ExternalLink } from 'lucide-react';
import { useMemo, useState } from 'react';

import { buildInviteRedirectUrl, DEFAULT_INVITE_REDIRECT_BASE } from '../../lib';

/**
 * Debug tool: paste a share link (…/s?code=…&api=…&stage=…), preview the converted invite
 * redirect URL, and navigate to it. The redirect base is editable so any environment can be targeted.
 */
export const InviteRedirectScreen = () => {
    const [input, setInput] = useState('');
    const [baseUrl, setBaseUrl] = useState(DEFAULT_INVITE_REDIRECT_BASE);

    // Recompute on every edit; surface a parse/validation error instead of throwing.
    const { url, error } = useMemo(() => {
        if (!input.trim()) return { url: '', error: '' };
        try {
            return { url: buildInviteRedirectUrl(input, baseUrl), error: '' };
        } catch (e) {
            return { url: '', error: e instanceof Error ? e.message : '변환에 실패했습니다.' };
        }
    }, [input, baseUrl]);

    const handleRedirect = () => {
        if (url) window.location.href = url;
    };

    return (
        <div className="flex h-full flex-col bg-background">
            <div className="flex-1 px-4">
                <div className="mb-6 mt-6">
                    <h1 className="text-[20px] font-semibold leading-[1.35]">초대 링크 변환</h1>
                    <p className="mt-1 text-[13px] text-muted-foreground">
                        공유 링크(…/s?code=…&api=…&stage=…)를 초대 링크로 변환해 이동합니다.
                    </p>
                </div>

                <div className="flex flex-col gap-5">
                    {/* Source share link */}
                    <label className="flex flex-col gap-1.5">
                        <span className="text-[14px] font-semibold text-foreground">입력 링크</span>
                        <textarea
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            rows={4}
                            placeholder="https://app-dev.chatic.io/s?code=…&api=…&stage=…"
                            className="w-full resize-none break-all rounded-xl border border-border bg-background px-4 py-3 text-[13px] text-foreground outline-none transition-colors focus:border-foreground"
                        />
                    </label>

                    {/* Editable redirect base */}
                    <label className="flex flex-col gap-1.5">
                        <span className="text-[14px] font-semibold text-foreground">리다이렉트 도메인</span>
                        <input
                            type="text"
                            value={baseUrl}
                            onChange={e => setBaseUrl(e.target.value)}
                            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-[13px] text-foreground outline-none transition-colors focus:border-foreground"
                        />
                    </label>

                    {/* Result / error */}
                    {error && <p className="text-[13px] text-destructive">{error}</p>}
                    {url && (
                        <div className="flex flex-col gap-1.5">
                            <span className="text-[14px] font-semibold text-foreground">변환 결과</span>
                            <p className="break-all rounded-xl bg-muted px-4 py-3 text-[12px] text-muted-foreground">
                                {url}
                            </p>
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={handleRedirect}
                        disabled={!url}
                        className="flex items-center justify-center gap-1.5 rounded-2xl bg-[#B0EA10] py-4 text-[15px] font-semibold text-foreground transition-all active:scale-[0.98] disabled:bg-muted disabled:text-muted-foreground disabled:active:scale-100"
                    >
                        <ExternalLink size={18} />
                        <span>변환 후 이동</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
