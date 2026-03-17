import { Camera, HelpCircle, Image } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/shared';

import { PageHeader } from '../../../shared/components';
import { InviteCodeCard, VisibilityToggle } from '../components';

interface CreateWorkspaceSuccessProps {
    name: string;
    visibility: 'public' | 'private';
    inviteCode: string;
    onClose: () => void;
    onConfirm: () => void;
    t: (key: string, options?: Record<string, unknown>) => string;
}

const CreateWorkspaceSuccess = ({
    name,
    visibility,
    inviteCode,
    onClose,
    onConfirm,
    t,
}: CreateWorkspaceSuccessProps) => {
    return (
        <div className="flex h-full flex-col bg-background">
            <PageHeader title={t('workspace.create.successTitle')} onBack={onClose} />

            <div className="flex-1 space-y-6 px-5 pt-8">
                <div className="text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent">
                        <span className="text-2xl">🎉</span>
                    </div>
                    <h2 className="text-xl font-bold text-foreground">
                        "{name}" {t('workspace.create.created')}
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground">{t('workspace.create.shareCode')}</p>
                </div>

                <InviteCodeCard code={inviteCode} label={t('workspace.settings.inviteCode')} />

                <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-4 py-3">
                    <span className="text-sm text-muted-foreground">
                        {visibility === 'public'
                            ? `🌐 ${t('workspace.create.visibilityPublic')}`
                            : `🔒 ${t('workspace.create.visibilityPrivate')}`}
                    </span>
                </div>
            </div>

            <div className="px-5 pb-10 pt-4">
                <button
                    onClick={onConfirm}
                    className="w-full rounded-2xl bg-accent py-4 text-[15px] font-semibold text-accent-foreground transition-transform active:scale-[0.98]"
                >
                    {t('workspace.create.confirm')}
                </button>
            </div>
        </div>
    );
};

export const CreateWorkspacePage = () => {
    const navigate = useNavigateWithTransition();
    const { t } = useTranslation();
    const [name, setName] = useState('');
    const [visibility, setVisibility] = useState<'public' | 'private'>('private');
    const [created, setCreated] = useState(false);
    const inviteCode = 'WS7X9K';

    const handleCreate = () => {
        if (name.length > 0) setCreated(true);
    };

    if (created) {
        return (
            <CreateWorkspaceSuccess
                name={name}
                visibility={visibility}
                inviteCode={inviteCode}
                onClose={() => navigate('/chats')}
                onConfirm={() => navigate('/chats')}
                t={t}
            />
        );
    }

    return (
        <div className="flex h-full flex-col bg-background">
            <PageHeader title={t('workspace.create.title')} />

            <div className="flex-1 px-5 pt-4">
                <h2 className="text-2xl font-extrabold leading-tight text-foreground">
                    {t('workspace.create.subtitle')}
                </h2>
                <div className="mt-2 flex items-center gap-1.5">
                    <HelpCircle size={16} className="text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">{t('workspace.create.hint')}</span>
                </div>

                <div className="mt-8">
                    <label className="text-sm font-semibold text-foreground">{t('workspace.create.nameLabel')}</label>
                    <div className="relative mt-2">
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value.slice(0, 20))}
                            placeholder={t('workspace.create.namePlaceholder')}
                            className="w-full rounded-xl border border-border px-4 py-3.5 text-[15px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                            {name.length}/20
                        </span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{t('workspace.create.nameHint')}</p>
                </div>

                <div className="mt-8">
                    <label className="text-sm font-semibold text-foreground">
                        {t('workspace.create.photoLabel')}{' '}
                        <span className="font-normal text-muted-foreground">{t('workspace.create.photoOptional')}</span>
                    </label>
                    <div className="relative mt-3 h-28 w-28">
                        <div className="flex h-full w-full items-center justify-center rounded-xl bg-muted">
                            <Image size={32} className="text-muted-foreground" />
                        </div>
                        <button className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full bg-accent shadow-md">
                            <Camera size={16} className="text-accent-foreground" />
                        </button>
                    </div>
                </div>

                <div className="mt-8">
                    <label className="text-sm font-semibold text-foreground">
                        {t('workspace.create.visibilityLabel')}
                    </label>
                    <div className="mt-2">
                        <VisibilityToggle value={visibility} onChange={setVisibility} />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                        {visibility === 'public' ? t('workspace.create.publicHint') : t('workspace.create.privateHint')}
                    </p>
                </div>
            </div>

            <div className="px-5 pb-10 pt-4">
                <button
                    disabled={name.length === 0}
                    onClick={handleCreate}
                    className="w-full rounded-2xl bg-muted py-4 text-[15px] font-semibold text-muted-foreground transition-all disabled:opacity-100 enabled:bg-accent enabled:text-accent-foreground active:scale-[0.98]"
                >
                    {t('workspace.create.done')}
                </button>
            </div>
        </div>
    );
};
