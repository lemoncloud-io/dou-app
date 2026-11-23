import type { MouseEvent, PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { DefaultAvatar, ImageAvatar } from '@chatic/web-ui-kit';

import type { MentionCandidate } from '../utils/mentionInput';

const AVATAR_SIZE = 32;

interface MentionSuggestionsProps {
    candidates: readonly MentionCandidate[];
    onPick: (candidate: MentionCandidate) => void;
}

const keepFieldFocus = (event: MouseEvent<HTMLDivElement>) => event.preventDefault();
const keepFieldFocusForMouse = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse') event.preventDefault();
};

export const MentionSuggestions = ({ candidates, onPick }: MentionSuggestionsProps) => {
    const { t } = useTranslation();
    if (candidates.length === 0) return null;

    return (
        <div
            role="listbox"
            aria-label={t('chat.mention.listLabel')}
            onPointerDown={keepFieldFocusForMouse}
            onMouseDown={keepFieldFocus}
            className="mb-2 max-h-[232px] overflow-y-auto overscroll-contain rounded-2xl border border-hairline bg-surface py-1 shadow-[0px_0px_8px_0px_rgba(0,0,0,0.08)]"
        >
            {candidates.map(candidate => (
                <button
                    key={candidate.id}
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => onPick(candidate)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left active:bg-muted/50"
                >
                    {candidate.everyone ? (
                        <DefaultAvatar size={AVATAR_SIZE} variant="group" />
                    ) : candidate.thumbnail ? (
                        <ImageAvatar src={candidate.thumbnail} size={AVATAR_SIZE} />
                    ) : (
                        <DefaultAvatar size={AVATAR_SIZE} />
                    )}
                    <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] leading-[1.4] text-foreground">
                            {candidate.everyone ? t('chat.mention.everyone') : candidate.label}
                        </span>
                        {candidate.everyone && (
                            <span className="block truncate text-[13px] leading-[1.4] text-description">
                                {`@${candidate.label} · ${t('chat.mention.everyoneHint')}`}
                            </span>
                        )}
                    </span>
                </button>
            ))}
        </div>
    );
};
