import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
    $getSelection,
    $isRangeSelection,
    FORMAT_TEXT_COMMAND,
    type LexicalEditor,
    type TextFormatType,
} from 'lexical';

import { cn } from '@chatic/lib/utils';

const textFormat =
    (format: TextFormatType) =>
    (editor: LexicalEditor): void => {
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
    };

// Figma draws the formats as bare glyphs (B · I · S · </>). Keyboard equivalents live in
// FormatShortcutsPlugin (Slack's bindings) — the code block keeps its shortcut and the
// ``` markdown trigger, it just has no button of its own in this row.
const FORMATS = [
    { key: 'bold', glyph: 'B', glyphClass: '', apply: textFormat('bold') },
    { key: 'italic', glyph: 'I', glyphClass: 'italic', apply: textFormat('italic') },
    { key: 'strike', glyph: 'S', glyphClass: 'line-through', apply: textFormat('strikethrough') },
    { key: 'code', glyph: '</>', glyphClass: 'text-[14px]', apply: textFormat('code') },
] as const;

type FormatKey = (typeof FORMATS)[number]['key'];
type ActiveFormats = Partial<Record<FormatKey, boolean>>;

/** Which formats the current selection carries, so the row can light them up. */
const readActiveFormats = (): ActiveFormats => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return {};
    return {
        bold: selection.hasFormat('bold'),
        italic: selection.hasFormat('italic'),
        strike: selection.hasFormat('strikethrough'),
        code: selection.hasFormat('code'),
    };
};

/** Formatting row above the input — applies live formats and highlights the selection's active ones. */
export const ComposerToolbar = () => {
    const { t } = useTranslation();
    const [editor] = useLexicalComposerContext();
    const [active, setActive] = useState<ActiveFormats>({});

    // Mirror the selection's formats onto the row (Slack-style active highlight),
    // so ⌘B and the buttons both reflect the caret's current state.
    useEffect(
        () =>
            editor.registerUpdateListener(({ editorState }) => {
                editorState.read(() => setActive(readActiveFormats()));
            }),
        [editor]
    );

    return (
        <div className="flex items-center gap-2" role="toolbar" aria-label={t('chat.composer.formatting')}>
            {FORMATS.map(({ key, glyph, glyphClass, apply }) => (
                <button
                    key={key}
                    type="button"
                    aria-pressed={!!active[key]}
                    title={t(`chat.composer.format.${key}`)}
                    aria-label={t(`chat.composer.format.${key}`)}
                    // mousedown (not click) so the editor keeps focus + selection.
                    onMouseDown={e => {
                        e.preventDefault();
                        apply(editor);
                    }}
                    className={cn(
                        'focus-ring tactile flex h-[26px] min-w-[26px] items-center justify-center rounded-md text-[15px] font-semibold transition-colors ease-tactile disabled:opacity-50',
                        active[key] ? 'bg-accent text-foreground' : 'text-label hover:bg-accent hover:text-foreground'
                    )}
                >
                    <span aria-hidden className={glyphClass}>
                        {glyph}
                    </span>
                </button>
            ))}
        </div>
    );
};
