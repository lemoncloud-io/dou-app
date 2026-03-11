import { X } from 'lucide-react';
import { useState } from 'react';

import { Sheet, SheetContent } from '@chatic/ui-kit/components/ui/sheet';

interface AddFriendSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const MAX = 20;

export const AddFriendSheet = ({ open, onOpenChange }: AddFriendSheetProps) => {
    const [name, setName] = useState('');

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="bottom" className="rounded-t-[20px] p-0 border-0" hideClose>
                {/* 타이틀 */}
                <div className="flex items-center justify-between px-4 py-[14px]">
                    <span className="text-[16px] font-medium leading-[1.5] tracking-[-0.02em] text-black">
                        친구 추가
                    </span>
                    <button
                        onClick={() => onOpenChange(false)}
                        className="w-6 h-6 flex items-center justify-center rounded-full bg-[#EAEAEC]"
                    >
                        <X className="w-[14px] h-[14px] text-black" />
                    </button>
                </div>

                <div className="flex flex-col gap-[26px] px-4">
                    {/* 설명 */}
                    <div className="flex flex-col gap-[2px]">
                        <span className="text-[20px] font-semibold leading-[1.35] tracking-[-0.025em] text-black">
                            채팅방에 초대할 친구의
                        </span>
                        <span className="text-[20px] font-semibold leading-[1.35] tracking-[-0.025em] text-black">
                            이름을 입력해 주세요
                        </span>
                    </div>

                    {/* 입력 필드 */}
                    <div className="flex flex-col gap-2">
                        <label className="text-[14px] font-semibold leading-[1.286] tracking-[0.005em] text-[#53555B]">
                            이름
                        </label>
                        <div className="flex items-center rounded-[10px] border border-[#EAEAEC] bg-white px-3 py-3">
                            <input
                                value={name}
                                onChange={e => setName(e.target.value.slice(0, MAX))}
                                placeholder="친구 이름을 입력해 주세요"
                                className="flex-1 text-[16px] font-normal leading-[1.45] tracking-[-0.015em] text-[#222325] placeholder:text-[#BABCC0] outline-none bg-transparent"
                            />
                            <span className="text-[13px] font-medium tracking-[0.019em] text-[#53555B] opacity-74 shrink-0">
                                {name.length}/{MAX}
                            </span>
                        </div>
                        <span className="text-[12px] font-medium leading-[1.5] text-[#84888F] pl-0.5">
                            20글자 이내로 입력해 주세요.
                        </span>
                    </div>
                </div>

                {/* 버튼 */}
                <div className="px-4 pt-5 pb-4">
                    <button
                        disabled={!name.trim()}
                        className="w-full rounded-full py-3 text-[16px] font-semibold leading-[1.375] tracking-[0.005em] text-center transition-colors
                            disabled:bg-[#EAEAEC] disabled:text-[#BABCC0]
                            enabled:bg-[#B0EA10] enabled:text-[#222325]"
                    >
                        공유하기
                    </button>
                </div>
            </SheetContent>
        </Sheet>
    );
};
