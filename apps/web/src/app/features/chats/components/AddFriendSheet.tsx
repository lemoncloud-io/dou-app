import { X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Sheet, SheetContent } from '@chatic/ui-kit/components/ui/sheet';

interface AddFriendSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const MAX = 20;

export const AddFriendSheet = ({ open, onOpenChange }: AddFriendSheetProps) => {
    const { t } = useTranslation();
    const [name, setName] = useState('');

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="bottom" className="rounded-t-[20px] p-0 border-0" hideClose>
                <div className="flex items-center justify-between px-4 py-[14px]">
                    <span className="text-[16px] font-medium leading-[1.5] tracking-[-0.02em] text-black">
                        {t('addFriend.title')}
                    </span>
                    <button
                        onClick={() => onOpenChange(false)}
                        className="w-6 h-6 flex items-center justify-center rounded-full bg-[#EAEAEC]"
                    >
                        <X className="w-[14px] h-[14px] text-black" />
                    </button>
                </div>

                <div className="flex flex-col gap-[26px] px-4">
                    <div className="flex flex-col gap-[2px]">
                        <span className="text-[20px] font-semibold leading-[1.35] tracking-[-0.025em] text-black">
                            {t('addFriend.subtitle1')}
                        </span>
                        <span className="text-[20px] font-semibold leading-[1.35] tracking-[-0.025em] text-black">
                            {t('addFriend.subtitle2')}
                        </span>
                    </div>

                    <div className="flex flex-col gap-2">
                        <label className="text-[14px] font-semibold leading-[1.286] tracking-[0.005em] text-[#53555B]">
                            {t('addFriend.nameLabel')}
                        </label>
                        <div className="flex items-center rounded-[10px] border border-[#EAEAEC] bg-white px-3 py-3">
                            <input
                                value={name}
                                onChange={e => setName(e.target.value.slice(0, MAX))}
                                placeholder={t('addFriend.namePlaceholder')}
                                className="flex-1 text-[16px] font-normal leading-[1.45] tracking-[-0.015em] text-[#222325] placeholder:text-[#BABCC0] outline-none bg-transparent"
                            />
                            <span className="text-[13px] font-medium tracking-[0.019em] text-[#53555B] opacity-74 shrink-0">
                                {name.length}/{MAX}
                            </span>
                        </div>
                        <span className="text-[12px] font-medium leading-[1.5] text-[#84888F] pl-0.5">
                            {t('addFriend.nameHint')}
                        </span>
                    </div>
                </div>

                <div className="px-4 pt-5 pb-4">
                    <button
                        disabled={!name.trim()}
                        className="w-full rounded-full py-3 text-[16px] font-semibold leading-[1.375] tracking-[0.005em] text-center transition-colors
                            disabled:bg-[#EAEAEC] disabled:text-[#BABCC0]
                            enabled:bg-[#B0EA10] enabled:text-[#222325]"
                    >
                        {t('addFriend.share')}
                    </button>
                </div>
            </SheetContent>
        </Sheet>
    );
};
