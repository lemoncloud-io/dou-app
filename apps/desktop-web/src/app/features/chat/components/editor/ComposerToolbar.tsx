import { useTranslation } from 'react-i18next';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { Bold, Code, Italic, SquareCode, Strikethrough } from 'lucide-react';
import { FORMAT_TEXT_COMMAND, type LexicalEditor, type TextFormatType } from 'lexical';

import { toggleCodeBlock } from './composerPlugins';

const textFormat =
    (format: TextFormatType) =>
    (editor: LexicalEditor): void => {
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
    };

// Keyboard equivalents live in FormatShortcutsPlugin (Slack's bindings).
const FORMATS = [
    { key: 'bold', icon: Bold, apply: textFormat('bold') },
    { key: 'italic', icon: Italic, apply: textFormat('italic') },
    { key: 'strike', icon: Strikethrough, apply: textFormat('strikethrough') },
    { key: 'code', icon: Code, apply: textFormat('code') },
    { key: 'codeBlock', icon: SquareCode, apply: toggleCodeBlock },
] as const;

/** Formatting row above the input — applies live formats to the selection. */
export const ComposerToolbar = ({ disabled }: { disabled: boolean }) => {
    const { t } = useTranslation();
    const [editor] = useLexicalComposerContext();
    return (
        <div className="flex items-center gap-0.5" role="toolbar" aria-label={t('chat.composer.formatting')}>
            {FORMATS.map(({ key, icon: Icon, apply }) => (
                <button
                    key={key}
                    type="button"
                    disabled={disabled}
                    title={t(`chat.composer.format.${key}`)}
                    aria-label={t(`chat.composer.format.${key}`)}
                    // mousedown (not click) so the editor keeps focus + selection.
                    onMouseDown={e => {
                        e.preventDefault();
                        apply(editor);
                    }}
                    className="focus-ring tactile flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors ease-tactile hover:bg-accent hover:text-foreground disabled:opacity-50"
                >
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                </button>
            ))}
        </div>
    );
};
