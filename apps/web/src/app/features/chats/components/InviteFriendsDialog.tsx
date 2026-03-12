import { Search, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Dialog, DialogContent } from '@chatic/ui-kit/components/ui/dialog';
import { AddFriendSheet } from './AddFriendSheet';

interface InviteFriendsDialogProps {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    channelId?: string;
}

const QUICK_ACTIONS = [
    { labelKey: 'inviteFriends.copyLink', icon: '/assets/icons/icon-link.svg', actionKey: 'copyLink' },
    { labelKey: 'inviteFriends.addFriend', icon: '/assets/icons/icon-user-plus.svg', actionKey: 'addFriend' },
    { labelKey: 'inviteFriends.qrCode', icon: '/assets/icons/icon-qr.svg', actionKey: 'qrCode' },
] as const;

export const InviteFriendsDialog = ({ open, onOpenChange }: InviteFriendsDialogProps) => {
    const { t } = useTranslation();
    const [search, setSearch] = useState('');
    const [addFriendOpen, setAddFriendOpen] = useState(false);

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-full w-full m-0 rounded-none" hideClose variant="fullscreen">
                    <div className="flex flex-col h-full bg-white">
                        {/* Top Bar */}
                        <div className="flex items-center justify-between px-1.5 py-3">
                            <div className="w-11 h-11" />
                            <h1 className="text-[16px] font-semibold leading-[1.625] tracking-[0.005em] text-[#222325]">
                                {t('inviteFriends.title')}
                            </h1>
                            <button
                                onClick={() => onOpenChange?.(false)}
                                className="w-11 h-11 flex items-center justify-center"
                            >
                                <X className="w-6 h-6 text-[#3A3C40]" />
                            </button>
                        </div>

                        {/* Quick Actions */}
                        <div className="px-4 pt-5">
                            <div
                                className="flex items-center justify-center gap-[42px] rounded-[20px] py-4 px-[18px]"
                                style={{ boxShadow: '0px 1px 8px 0px rgba(0,0,0,0.08)' }}
                            >
                                {QUICK_ACTIONS.map(({ labelKey, icon, actionKey }) => (
                                    <button
                                        key={actionKey}
                                        className="flex flex-col items-center gap-2"
                                        onClick={() => actionKey === 'addFriend' && setAddFriendOpen(true)}
                                    >
                                        <div
                                            className="w-[42px] h-[42px] rounded-[28px] flex items-center justify-center"
                                            style={{ background: 'rgba(0,43,126,0.06)' }}
                                        >
                                            <img src={icon} alt={t(labelKey)} className="w-[42px] h-[42px]" />
                                        </div>
                                        <span className="text-[15px] font-medium text-black w-16 text-center leading-[1.19] tracking-[-0.02em]">
                                            {t(labelKey)}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Search */}
                        <div className="px-4 py-[10px]">
                            <div
                                className="flex items-center gap-[9px] rounded-full px-[14px] py-3"
                                style={{ background: 'rgba(0,43,126,0.03)', border: '1px solid rgba(0,43,126,0.01)' }}
                            >
                                <Search size={18} className="text-[#3A3C40] shrink-0" />
                                <input
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder={t('inviteFriends.searchPlaceholder')}
                                    className="flex-1 bg-transparent text-[16px] text-[#222325] placeholder:text-[#84888F] outline-none leading-[1.19] tracking-[-0.015em]"
                                />
                            </div>
                        </div>

                        {/* Contact List */}
                        <div className="flex-1 overflow-y-auto px-4 flex flex-col gap-3 pt-2" />
                    </div>
                </DialogContent>
            </Dialog>

            <AddFriendSheet open={addFriendOpen} onOpenChange={setAddFriendOpen} />
        </>
    );
};
