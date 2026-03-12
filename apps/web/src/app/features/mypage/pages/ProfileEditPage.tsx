import { Camera, ChevronLeft } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

export const ProfileEditPage = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [name, setName] = useState('sunny');

    return (
        <div className="flex min-h-screen flex-col bg-background">
            {/* Header */}
            <header className="flex items-center justify-between px-4 pb-3 pt-3">
                <button onClick={() => navigate(-1)} className="p-1">
                    <ChevronLeft size={24} className="text-foreground" />
                </button>
                <h1 className="text-[17px] font-semibold text-foreground">{t('profileEdit.title')}</h1>
                <div className="w-8" />
            </header>

            {/* Avatar */}
            <div className="flex justify-center py-8">
                <div className="relative">
                    <div className="flex h-24 w-24 items-center justify-center rounded-full bg-muted text-4xl">
                        <span role="img" aria-label="user">
                            👤
                        </span>
                    </div>
                    <button className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full bg-accent shadow-md">
                        <Camera size={16} className="text-accent-foreground" />
                    </button>
                </div>
            </div>

            {/* Name */}
            <div className="px-5">
                <label className="text-sm font-semibold text-foreground">{t('profileEdit.nameLabel')}</label>
                <div className="relative mt-2">
                    <input
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value.slice(0, 20))}
                        className="w-full rounded-xl border border-border px-4 py-3.5 text-[15px] text-foreground outline-none transition-colors focus:border-foreground"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        {name.length}/20
                    </span>
                </div>
            </div>

            {/* Save */}
            <div className="mt-auto px-5 pb-10 pt-4">
                <button className="w-full rounded-2xl bg-accent py-4 text-[15px] font-semibold text-accent-foreground transition-transform active:scale-[0.98]">
                    {t('profileEdit.save')}
                </button>
            </div>
        </div>
    );
};
