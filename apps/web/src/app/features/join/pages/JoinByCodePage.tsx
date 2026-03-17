import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/shared';

import { PageHeader } from '../../../shared/components';

export const JoinByCodePage = () => {
    const navigate = useNavigateWithTransition();
    const { t } = useTranslation();
    const [code, setCode] = useState('');
    const [status, setStatus] = useState<'idle' | 'found' | 'notfound'>('idle');

    const mockResult = {
        type: 'workspace' as const,
        name: '개발자 모임',
        members: 42,
        image: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=200&h=200&fit=crop',
    };

    const handleSearch = () => {
        if (code.length >= 4) {
            setStatus('found');
        } else {
            setStatus('notfound');
        }
    };

    return (
        <div className="flex h-full flex-col bg-background pt-safe-top">
            <PageHeader title={t('join.title')} />

            <div className="flex-1 px-5 pt-8">
                <h2 className="text-2xl font-extrabold leading-tight text-foreground">{t('join.subtitle')}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{t('join.description')}</p>

                {/* Code Input */}
                <div className="mt-8">
                    <label className="text-sm font-semibold text-foreground">{t('join.codeLabel')}</label>
                    <div className="mt-2 flex gap-2">
                        <input
                            type="text"
                            value={code}
                            onChange={e => {
                                setCode(e.target.value.toUpperCase());
                                setStatus('idle');
                            }}
                            placeholder={t('join.codePlaceholder')}
                            maxLength={10}
                            className="flex-1 rounded-xl border border-border px-4 py-3.5 font-mono text-[15px] uppercase tracking-widest text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground"
                        />
                        <button
                            onClick={handleSearch}
                            disabled={code.length < 4}
                            className="rounded-xl bg-muted px-5 py-3.5 text-sm font-semibold text-muted-foreground transition-all disabled:opacity-50 enabled:bg-foreground enabled:text-background active:scale-[0.97]"
                        >
                            {t('join.confirm')}
                        </button>
                    </div>
                </div>

                {/* Result */}
                {status === 'found' && (
                    <div className="mt-8 animate-fade-in">
                        <div className="rounded-2xl border border-border p-5">
                            <div className="flex items-center gap-4">
                                <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl">
                                    <img
                                        src={mockResult.image}
                                        alt={mockResult.name}
                                        className="h-full w-full object-cover"
                                    />
                                </div>
                                <div className="flex-1">
                                    <p className="text-xs font-medium text-muted-foreground">
                                        {mockResult.type === 'workspace' ? t('join.workspace') : t('join.chatRoom')}
                                    </p>
                                    <h3 className="text-lg font-bold text-foreground">{mockResult.name}</h3>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        {t('join.memberCount', { count: mockResult.members })}
                                    </p>
                                </div>
                            </div>

                            <button
                                onClick={() => navigate('/chats')}
                                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3.5 text-[15px] font-semibold text-accent-foreground transition-transform active:scale-[0.98]"
                            >
                                <CheckCircle2 size={18} />
                                {t('join.joinButton')}
                            </button>
                        </div>
                    </div>
                )}

                {status === 'notfound' && (
                    <div className="mt-8 flex animate-fade-in flex-col items-center gap-2 py-8">
                        <AlertCircle size={40} className="text-muted-foreground" />
                        <p className="text-center text-sm text-muted-foreground">{t('join.invalidCode')}</p>
                    </div>
                )}
            </div>
        </div>
    );
};
