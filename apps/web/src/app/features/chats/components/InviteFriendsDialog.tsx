import { X, Search } from 'lucide-react';

import { Dialog, DialogContent } from '@chatic/ui-kit/components/ui/dialog';

interface InviteFriendsDialogProps {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}

export const InviteFriendsDialog = ({ open, onOpenChange }: InviteFriendsDialogProps) => {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="h-screen max-w-full w-full m-0 p-0 rounded-none" hideClose>
                <div className="flex flex-col h-full bg-white">
                    {/* Top Bar */}
                    <div className="flex items-center justify-between px-1.5 py-3 bg-white">
                        <div className="w-11 h-11" />
                        <h1 className="text-[16px] font-semibold leading-[1.625] tracking-[0.005em] text-[#222325]">
                            친구 초대
                        </h1>
                        <button
                            onClick={() => onOpenChange?.(false)}
                            className="w-11 h-11 flex items-center justify-center"
                        >
                            <X className="w-6 h-6 text-[#3A3C40]" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex flex-col gap-3 pt-3">
                        {/* Search */}
                        <div className="px-4">
                            <div className="flex items-center gap-2 px-4 py-3 bg-white border border-[#EAEAEC] rounded-[30px]">
                                <input
                                    type="text"
                                    placeholder="친구 검색"
                                    className="flex-1 bg-transparent border-0 outline-none text-[15px] font-normal leading-[1.193] tracking-[-0.015em] text-[#9FA2A7] placeholder:text-[#9FA2A7]"
                                />
                                <Search className="w-5 h-5 text-[#3A3C40]" />
                            </div>
                        </div>

                        {/* Friends List */}
                        <div className="flex flex-col gap-3 px-4">
                            {[1, 2, 3, 4].map(i => (
                                <div key={i} className="flex items-center gap-2">
                                    <div className="w-10 h-10 rounded-full bg-[#F4F5F5] border border-[#F4F5F5]" />
                                    <div className="flex-1 flex items-center justify-between">
                                        <span className="text-[16px] font-medium leading-[1.375] tracking-[0.005em] text-[#222325]">
                                            김두유
                                        </span>
                                        <button className="text-[14px] font-semibold leading-[1.571] tracking-[0.005em] text-[#102346]">
                                            초대하기
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
