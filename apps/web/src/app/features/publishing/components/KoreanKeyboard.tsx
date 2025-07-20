import React from 'react';

interface KeyProps {
    value: string;
    type?: 'default' | 'function' | 'space';
    onPress?: (value: string) => void;
    className?: string;
}

const Key: React.FC<KeyProps> = ({ value, type = 'default', onPress, className = '' }) => {
    const baseClass = 'flex items-center justify-center rounded-[4.5px] shadow-[0px_1px_1px_0px_rgba(0,0,0,0.14)]';
    const typeClass = type === 'function' ? 'bg-[#D1D1D1]' : 'bg-white';

    return (
        <button className={`${baseClass} ${typeClass} ${className}`} onClick={() => onPress?.(value)}>
            <span
                className="text-[18px] text-black"
                style={{ fontFamily: type === 'default' ? 'Noto Sans KR, sans-serif' : 'Roboto, sans-serif' }}
            >
                {value}
            </span>
        </button>
    );
};

export const KoreanKeyboard: React.FC = () => {
    const row1Numbers = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
    const row2Korean = ['ㄱ', 'ㅈ', 'ㄷ', 'ㄱ', 'ㅅ', 'ㅛ', 'ㅕ', 'ㅑ', 'ㅐ', 'ㅔ'];
    const row3Korean = ['ㅁ', 'ㄴ', 'ㅇ', 'ㄹ', 'ㅎ', 'ㅗ', 'ㅓ', 'ㅏ', 'ㅣ'];
    const row4Korean = ['ㅋ', 'ㅌ', 'ㅊ', 'ㅍ', 'ㅠ', 'ㅜ', 'ㅡ'];

    return (
        <div className="bg-[#E6E6E6] p-0 w-full">
            <div className="p-2 space-y-2">
                {/* Row 1 - Numbers */}
                <div className="flex gap-[5px] h-[34px]">
                    {row1Numbers.map(num => (
                        <Key key={num} value={num} className="flex-1" />
                    ))}
                </div>

                {/* Row 2 - Korean characters */}
                <div className="flex gap-[5px] h-[42px]">
                    {row2Korean.map((char, idx) => (
                        <Key key={idx} value={char} className="flex-1" />
                    ))}
                </div>

                {/* Row 3 - Korean characters */}
                <div className="flex gap-[5px] h-[42px] px-[17px]">
                    {row3Korean.map((char, idx) => (
                        <Key key={idx} value={char} className="flex-1" />
                    ))}
                </div>

                {/* Row 4 - Shift + Korean + Delete */}
                <div className="flex gap-[5px] h-[42px]">
                    <button className="w-[42px] h-[42px] bg-[#D1D1D1] rounded-[4.5px] shadow-[0px_1px_1px_0px_rgba(0,0,0,0.14)] flex items-center justify-center">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <path
                                d="M7 10 L12 5 L17 10 M12 5 L12 15"
                                stroke="#000"
                                strokeWidth="2"
                                strokeLinecap="round"
                            />
                        </svg>
                    </button>
                    <div className="flex-1 flex gap-[5px]">
                        {row4Korean.map((char, idx) => (
                            <Key key={idx} value={char} className="flex-1" />
                        ))}
                    </div>
                    <button className="w-[42px] h-[42px] bg-[#D1D1D1] rounded-[4.5px] shadow-[0px_1px_1px_0px_rgba(0,0,0,0.14)] flex items-center justify-center">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <path d="M8 7 L16 7 L16 17 L8 17 L4 12 Z" stroke="#000" strokeWidth="1.5" fill="none" />
                            <path d="M10 10 L14 14 M14 10 L10 14" stroke="#000" strokeWidth="1.5" />
                        </svg>
                    </button>
                </div>

                {/* Row 5 - Bottom row */}
                <div className="flex gap-[5px] h-[42px]">
                    <button className="w-[47px] bg-[#D1D1D1] rounded-[4.5px] shadow-[0px_1px_1px_0px_rgba(0,0,0,0.14)] flex items-center justify-center">
                        <span className="text-[18px] tracking-[-0.36px]" style={{ fontFamily: 'Roboto, sans-serif' }}>
                            !#1
                        </span>
                    </button>
                    <button className="w-[30px] bg-[#D1D1D1] rounded-[4.5px] shadow-[0px_1px_1px_0px_rgba(0,0,0,0.14)] flex items-center justify-center">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <text x="4" y="12" fontSize="10" fill="#000">
                                가
                            </text>
                            <text x="14" y="18" fontSize="8" fill="#000">
                                A
                            </text>
                        </svg>
                    </button>
                    <Key value="?" className="w-[30px]" />
                    <button className="flex-1 bg-white rounded-[4.5px] shadow-[0px_1px_1px_0px_rgba(0,0,0,0.14)] flex items-center justify-center">
                        <div className="w-7 h-1.5 bg-[#D1D1D1] rounded-full" />
                    </button>
                    <Key value="." className="w-[30px]" />
                    <button className="w-[47px] bg-[#D1D1D1] rounded-[4.5px] shadow-[0px_1px_1px_0px_rgba(0,0,0,0.14)] flex items-center justify-center">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <path
                                d="M15 10 L19 12 L15 14 M5 12 L19 12"
                                stroke="#000"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                            />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
};
