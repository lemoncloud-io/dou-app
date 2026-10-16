import { useEffect, useMemo, useReducer, useState } from 'react';

import { useI18n } from '../i18n';
import type { MessageKey } from '../i18n/en';
import type { LogEntry, LogSource } from '../shell/logStore';
import { consoleText, lineSummary, localTime } from './logFormat';
import type { VirtualShell } from '../shell/VirtualShell';

const SOURCES: LogSource[] = ['web→shell', 'shell→web', 'console', 'tool', 'unsupported', 'lifecycle'];
const SHOWN = 400;

/**
 * The log, newest first. A request and its reply share a `refId`, so clicking either highlights both.
 * "Copy JSON" copies what the filter shows — already masked, as everything in the store is.
 */
export const LogPanel = ({ shell }: { shell: VirtualShell }) => {
    const { t } = useI18n();
    const [, tick] = useReducer((count: number) => count + 1, 0);
    const [copied, setCopied] = useState(false);
    const [sources, setSources] = useState<LogSource[]>([]);
    const [type, setType] = useState('');
    const [text, setText] = useState('');
    const [paused, setPaused] = useState(false);
    const [frozenAt, setFrozenAt] = useState(0);
    const [open, setOpen] = useState<number | null>(null);
    const [pair, setPair] = useState<string | null>(null);

    useEffect(() => shell.logs.subscribe(() => tick()), [shell]);
    useEffect(() => shell.onChange(tick), [shell]);

    // Recomputed when the log or a filter changes — not on every redraw the shell's clock causes.
    const version = shell.logs.version;
    const visible = useMemo(() => {
        const entries = shell.readLogs({
            source: sources.length ? sources : undefined,
            type: type.trim() || undefined,
            text: text.trim() || undefined,
        });
        const list = paused ? entries.filter(entry => entry.seq <= frozenAt) : entries;
        return list.slice(-SHOWN).reverse();
        // `version` stands for the log's content, which the memo cannot see otherwise.
    }, [shell, version, sources, type, text, paused, frozenAt]);

    const toggleSource = (source: LogSource) =>
        setSources(current =>
            current.includes(source) ? current.filter(item => item !== source) : [...current, source]
        );

    const copy = () =>
        void navigator.clipboard.writeText(JSON.stringify([...visible].reverse(), null, 2)).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });

    return (
        <section className="vs-logs">
            <div className="vs-log-controls">
                {SOURCES.map(source => (
                    <button
                        key={source}
                        type="button"
                        className={`vs-filter vs-filter-${source.replace('→', '-')} ${sources.includes(source) ? 'vs-filter-on' : ''}`}
                        aria-pressed={sources.includes(source)}
                        data-tip={t(`logs.source.${source}.tip` as MessageKey)}
                        onClick={() => toggleSource(source)}
                    >
                        {t(`logs.source.${source}` as MessageKey)}
                    </button>
                ))}
            </div>
            <div className="vs-log-controls">
                <input
                    aria-label={t('logs.type')}
                    placeholder={t('logs.type')}
                    value={type}
                    onChange={event => setType(event.target.value)}
                />
                <input
                    aria-label={t('logs.search')}
                    placeholder={t('logs.search')}
                    className="vs-grow"
                    value={text}
                    onChange={event => setText(event.target.value)}
                />
                <button
                    type="button"
                    className="vs-btn vs-btn-small"
                    onClick={() => {
                        setFrozenAt(shell.logs.lastSeq);
                        setPaused(!paused);
                    }}
                >
                    {paused ? t('logs.resume') : t('logs.pause')}
                </button>
                <button type="button" className="vs-btn vs-btn-small" onClick={copy}>
                    {copied ? t('logs.copied') : t('logs.copy')}
                </button>
                <button type="button" className="vs-btn vs-btn-small vs-btn-quiet" onClick={() => shell.clearLogs()}>
                    {t('logs.clear')}
                </button>
            </div>
            {!visible.length && <p className="vs-empty">{t('logs.empty')}</p>}
            <ol className="vs-log-list">
                {visible.map(entry => (
                    <LogLine
                        key={entry.seq}
                        entry={entry}
                        open={open === entry.seq}
                        paired={!!entry.refId && entry.refId === pair}
                        onClick={() => {
                            setOpen(open === entry.seq ? null : entry.seq);
                            setPair(entry.refId ?? null);
                        }}
                    />
                ))}
            </ol>
        </section>
    );
};

const LogLine = ({
    entry,
    open,
    paired,
    onClick,
}: {
    entry: LogEntry;
    open: boolean;
    paired: boolean;
    onClick: () => void;
}) => {
    const { t } = useI18n();
    const level = entry.source === 'console' ? (entry.type ?? 'log') : null;
    const summary = lineSummary(entry);
    return (
        <li
            className={`vs-log vs-log-${entry.source.replace('→', '-')} ${level ? `vs-log-level-${level}` : ''} ${
                paired ? 'vs-log-paired' : ''
            }`}
        >
            <button type="button" onClick={onClick} aria-expanded={open}>
                <span className="vs-log-head">
                    <span className="vs-log-time">{localTime(entry.at)}</span>
                    <span className="vs-log-source">{t(`logs.source.${entry.source}` as MessageKey)}</span>
                    {level ? (
                        <span className={`vs-log-level vs-log-level-badge-${level}`}>{level}</span>
                    ) : (
                        <span className="vs-log-type">{entry.type ?? ''}</span>
                    )}
                    {entry.refId && <span className="vs-log-ref">#{entry.refId.slice(0, 6)}</span>}
                    {entry.truncated && <Truncated />}
                    <span className="vs-log-seq">{entry.seq}</span>
                </span>
                {summary && !open && <span className="vs-log-summary">{summary}</span>}
            </button>
            {open && entry.data !== undefined && (
                <pre>
                    {level
                        ? consoleText(entry.data)
                        : typeof entry.data === 'string'
                          ? entry.data
                          : JSON.stringify(entry.data, null, 2)}
                </pre>
            )}
        </li>
    );
};

const Truncated = () => {
    const { t } = useI18n();
    return <span className="vs-log-ref">{t('logs.truncated')}</span>;
};
