import { useNavigate } from 'react-router-dom';

import { ChevronLeft } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';

import { getMobileAppInfo, sendWebMessage } from '@chatic/app-messages';
import { Images } from '@chatic/assets';

export const ResultPage = () => {
    const navigate = useNavigate();

    const handleBack = () => {
        const { isOnMobileApp } = getMobileAppInfo();
        if (isOnMobileApp) {
            sendWebMessage({ type: 'PopWebView' });
        } else {
            navigate(-1);
        }
    };

    const data = [
        { name: '봄 라이트', value: 12.5 },
        { name: '봄 브라이트', value: 12.5 },
        { name: '여름 라이트', value: 12.5 },
        { name: '여름 뮤트', value: 12.5 },
        { name: '가을 뮤트', value: 12.5 },
        { name: '가을 다크', value: 12.5 },
        { name: '겨울 브라이트', value: 12.5 },
        { name: '겨울 다크', value: 12.5 },
    ];

    const COLORS = ['#F8B5B8', '#FBD690', '#F7C1FF', '#AEB8DD', '#DAC6A9', '#AFD09E', '#C1AAFF', '#D695A1'];

    const products = [
        {
            id: 1,
            name: '섀도우 A',
            imageUrl: `${Images.thumb}`,
            x: 20,
            y: 20,
        },
        {
            id: 2,
            name: '립스틱 B',
            imageUrl: `${Images.thumb}`,
            x: 70,
            y: 40,
        },
        {
            id: 3,
            name: '팔레트 C',
            imageUrl: `${Images.thumb}`,
            x: 85,
            y: 85,
        },
    ];

    const ColorLegend = ({ payload }) => {
        return (
            <div className="flex flex-col space-y-1">
                {payload.map((entry, index) => (
                    <div key={index} className="flex items-center justify-between">
                        <div className="flex items-center space-x-1">
                            <div className="w-[10px] h-[10px] rounded-[2px]" style={{ backgroundColor: entry.color }} />
                            <span className="text-sm max-[320px]:text-[12px] text-[#B3B4BA]">{entry.value}</span>
                        </div>
                        <span className="text-sm max-[320px]:text-[12px] font-bold">12.5%</span>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div>
            <header className="sticky top-0 z-50 h-[56px] bg-white flex items-center">
                <button className="p-3 flex items-center justify-center" onClick={handleBack}>
                    <ChevronLeft strokeWidth={1} />
                </button>
            </header>

            <section>
                <div className="h-[509px] bg-[#DEF0FF] px-4 py-[50px] flex flex-col items-center">
                    <div className="text-[20px] text-center mb-5">
                        김엡트 님의 <div className="text-[28px] font-bold">퍼블리싱 페이지</div>
                    </div>
                    <img src={Images.pine} className="w-[225px]" alt="" />
                    <div className="w-full rounded-lg bg-white py-[30px] px-5 shadow-[0_0_12px_0_rgba(0,0,0,0.10)]">
                        <div className="text-center mb-5 text-[14px]">
                            흔들림 없이 한 길만 걷는 <div className="text-[24px] font-bold">일편단심 소나무형</div>
                        </div>
                        <p className="text-[14px] text-[#B3B4BA] text-center">
                            새로움보다는 완성된 조합과 안정적인 스타일을 선호하는 타입이에요. 조합 실패가 적고, 메이크업
                            무드가 안정적인 사람이에요.
                        </p>
                    </div>
                </div>
            </section>
            {/* <section>
                <div className="h-[509px] bg-[#F5ECDB] px-4 py-[50px] flex flex-col items-center">
                    <div className="text-[20px] text-center mb-5">
                        김엡트 님의 <div className="text-[28px] font-bold">여름 데일리 파우치</div>
                    </div>
                    <img src={Images.type2} className="w-[225px]" alt="" />
                    <div className="w-full rounded-lg bg-white py-[30px] px-5 shadow-[0_0_12px_0_rgba(0,0,0,0.10)]">
                        <div className="text-center mb-5 text-[14px]">
                            기본은 지키면서 포인트는 확실하게
                            <div className="text-[24px] font-bold">킥포인트 선인장형</div>
                        </div>
                        <p className="text-[14px] text-[#B3B4BA] text-center">
                            주로 사용하는 톤은 정해져 있지만, 그날의 기분이나 상황에 따라 가볍게 변화를 시도하는
                            타입이에요. 안정성과 개성을 균형 있게 추구하는 사람이에요.
                        </p>
                    </div>
                </div>
            </section>
            <section>
                <div className="h-[509px] bg-[#E0DBF5] px-4 py-[50px] flex flex-col items-center">
                    <div className="text-[20px] text-center mb-5">
                        김엡트 님의 <div className="text-[28px] font-bold">여름 데일리 파우치</div>
                    </div>
                    <img src={Images.type3} className="w-[225px]" alt="" />
                    <div className="w-full rounded-lg bg-white py-[30px] px-5 shadow-[0_0_12px_0_rgba(0,0,0,0.10)]">
                        <div className="text-center mb-5 text-[14px]">
                            자신만의 감각으로 색을 조화롭게 활용하는
                            <div className="text-[24px] font-bold">조화로운 도시락형</div>
                        </div>
                        <p className="text-[14px] text-[#B3B4BA] text-center">
                            여러 톤을 섞어 쓰면서 상황과 무드에 맞는 조합을 연출하는 타입이에요. 다채로운 조합 속에서도
                            나만의 스타일을 완성하는 사람이에요.
                        </p>
                    </div>
                </div>
            </section>
            <section>
                <div className="h-[509px] bg-[#E4F5DB] px-4 py-[50px] flex flex-col items-center">
                    <div className="text-[20px] text-center mb-5">
                        김엡트 님의 <div className="text-[28px] font-bold">여름 데일리 파우치</div>
                    </div>
                    <img src={Images.type4} className="w-[225px]" alt="" />
                    <div className="w-full rounded-lg bg-white py-[30px] px-5 shadow-[0_0_12px_0_rgba(0,0,0,0.10)]">
                        <div className="text-center mb-5 text-[14px]">
                            다양한 분위기를 소화하는 색조 플레이어
                            <div className="text-[24px] font-bold">알록달록 카멜레온형</div>
                        </div>
                        <p className="text-[14px] text-[#B3B4BA] text-center">
                            고정된 스타일보다는 변화와 새로움을 즐기며 다양한 제품을 시도하는 타입이에요. 틀에 박힌
                            메이크업보다는 나에게 맞는 룩을 자유롭게 선택하는 사람이에요.
                        </p>
                    </div>
                </div>
            </section>
            <section>
                <div className="h-[509px] bg-[#F5DBDB] px-4 py-[50px] flex flex-col items-center">
                    <div className="text-[20px] text-center mb-5">
                        김엡트 님의 <div className="text-[28px] font-bold">여름 데일리 파우치</div>
                    </div>
                    <img src={Images.type5} className="w-[225px]" alt="" />
                    <div className="w-full rounded-lg bg-white py-[30px] px-5 shadow-[0_0_12px_0_rgba(0,0,0,0.10)]">
                        <div className="text-center mb-5 text-[14px]">
                            가능성이 무한한 색조 탐험러<div className="text-[24px] font-bold">호기심 천국 문어형</div>
                        </div>
                        <p className="text-[14px] text-[#B3B4BA] text-center">
                            다양한 제품을 써보며 나만의 스타일을 찾는 과정을 즐기는 타입이에요. 아직 조합이 정리되진
                            않았지만, 누구보다 가능성이 많고 색조 표현의 폭이 넓은 사람이에요.
                        </p>
                    </div>
                </div>
            </section> */}

            <section className="px-4 pt-[95px]">
                <div className="font-bold mb-6">퍼스널컬러 비율</div>
                <div className="flex items-center justify-center gap-6 pb-[30px] max-[320px]:gap-4">
                    <div className="flex-1">
                        <ResponsiveContainer width={160} height={160}>
                            <PieChart>
                                <Pie
                                    data={data}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={50}
                                    outerRadius={80}
                                    startAngle={90}
                                    endAngle={450}
                                    paddingAngle={0}
                                    dataKey="value"
                                    stroke="none"
                                >
                                    {data.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="flex-1">
                        <ColorLegend
                            payload={data.map((item, index) => ({
                                value: item.name,
                                color: COLORS[index],
                            }))}
                        />
                    </div>
                </div>
            </section>
            <div className="border-b border-[#F3F3F8]"></div>
            <section className="py-[30px] px-4">
                <div className="font-bold mb-6">제품별 퍼스널컬러</div>
                <div className="flex flex-col space-y-5">
                    <div className="flex flex-col space-y-2">
                        <div className="flex items-center gap-1 text-sm font-bold">
                            <div className="w-[10px] h-[10px] bg-[#F8B5B8] rounded-[2px]"></div>봄 라이트
                            <span className="ml-1 text-[#B3B4BA] font-normal">2개</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-[60px] h-[60px] rounded-[2px] bg-[#F3F3F8] flex items-center justify-center overflow-hidden py-[7px] px-[6px] shrink-0">
                                <img className="w-full h-full object-contain" src={Images.thumb} alt="" />
                            </div>
                            <div className="overflow-hidden">
                                <div className="text-[12px] text-[#B3B4BA] truncate">베네피트</div>
                                <div className="text-[14px] font-bold truncate">블러셔</div>
                                <div className="text-[12px] truncate">단델리온</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-[60px] h-[60px] rounded-[2px] bg-[#F3F3F8] flex items-center justify-center overflow-hidden py-[7px] px-[6px] shrink-0">
                                <img className="w-full h-full object-contain" src={Images.thumb} alt="" />
                            </div>
                            <div className="overflow-hidden">
                                <div className="text-[12px] text-[#B3B4BA] truncate">베네피트</div>
                                <div className="text-[14px] font-bold truncate">블러셔</div>
                                <div className="text-[12px] truncate">단델리온</div>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col space-y-2">
                        <div className="flex items-center gap-1 text-sm font-bold">
                            <div className="w-[10px] h-[10px] bg-[#F8B5B8] rounded-[2px]"></div>봄 라이트
                            <span className="ml-1 text-[#B3B4BA] font-normal">2개</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-[60px] h-[60px] rounded-[2px] bg-[#F3F3F8] flex items-center justify-center overflow-hidden py-[7px] px-[6px] shrink-0">
                                <img className="w-full h-full object-contain" src={Images.thumb} alt="" />
                            </div>
                            <div>
                                <div className="text-[12px] text-[#B3B4BA]">베네피트</div>
                                <div className="text-[14px] font-bold">블러셔</div>
                                <div className="text-[12px]">단델리온</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-[60px] h-[60px] rounded-[2px] bg-[#F3F3F8] flex items-center justify-center overflow-hidden py-[7px] px-[6px] shrink-0">
                                <img className="w-full h-full object-contain" src={Images.thumb} alt="" />
                            </div>
                            <div>
                                <div className="text-[12px] text-[#B3B4BA]">베네피트</div>
                                <div className="text-[14px] font-bold">블러셔</div>
                                <div className="text-[12px]">단델리온</div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
            <div className="border-b border-[#F3F3F8]"></div>

            <section className="py-[30px] px-4">
                <div className="font-bold mb-6">컬러맵</div>
                <div className="relative w-full aspect-square">
                    <div className="absolute inset-0 grid grid-cols-6 grid-rows-6 z-0">
                        {Array.from({ length: 36 }).map((_, i) => (
                            <div key={i} className="border border-dashed border-[#F3F3F8]" />
                        ))}
                    </div>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 w-[calc(100%-70px)] h-px bg-[#D9D9DC] z-10" />
                    <div className="absolute left-1/2 top-1/2 -translate-y-1/2 h-[calc(100%-60px)] w-px bg-[#D9D9DC] z-10" />

                    <div className="absolute left-2 top-1/2 -translate-y-1/2 text-[12px] z-10">맑은</div>
                    <div className="absolute left-1/2 -translate-x-1/2 bottom-2 text-[12px] z-10">어두운</div>

                    <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[12px] z-10">탁한</div>
                    <div className="absolute left-1/2 top-2 -translate-x-1/2 text-[12px] z-10">밝은</div>

                    {products.map(product => (
                        <div
                            className="absolute w-[52px] h-[52px] object-contain bg-[#F3F3F8] border-[4px] border-white rounded-md z-20 overflow-hidden py-[7px] px-[6px] shrink-0"
                            style={{
                                left: `${product.x}%`,
                                top: `${product.y}%`,
                                transform: 'translate(-50%, -50%)',
                            }}
                        >
                            <img
                                className="w-ful h-full object-contain rounded-[2px]"
                                key={product.id}
                                src={product.imageUrl}
                                alt={product.name}
                            />
                        </div>
                    ))}
                </div>
            </section>
            <div className="border-b border-[#F3F3F8]"></div>

            <section className="py-[30px] px-4">
                <div className="font-bold">파우치 외 추천 제품</div>
                <div className="text-[14px] text-[#A7A7A9] mb-4">
                    파우치에 없지만 있으면 어울릴 제품을 추천해 드려요.
                </div>

                <div className="flex flex-col space-y-2 mb-6">
                    <div className="flex items-center gap-1 text-sm font-bold">
                        <div className="w-[10px] h-[10px] bg-[#F8B5B8] rounded-[2px]"></div>봄 라이트
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-[60px] h-[60px] rounded-[2px] bg-[#F3F3F8] flex items-center justify-center overflow-hidden py-[7px] px-[6px] shrink-0">
                            <img className="w-full h-full object-contain" src={Images.thumb} alt="" />
                        </div>
                        <div className="overflow-hidden">
                            <div className="text-[12px] text-[#B3B4BA] truncate">브랜드명</div>
                            <div className="text-[14px] font-bold truncate">제품명</div>
                            <div className="text-[12px] truncate">색상명</div>
                        </div>
                    </div>
                    <div className="-mx-4">
                        <div className="text-[12px] text-[#B3B4BA] pl-4">어울리는 소지 제품</div>
                        <div className="mt-1 overflow-auto flex items-center gap-2 px-4 no-scrollbar">
                            <div className="bg-[#F3F3F8] w-10 h-10 rounded-[2px] flex items-center justify-center overflow-hidden py-[7px] px-[6px] shrink-0">
                                <img className="w-full h-full object-contain" src={Images.thumb} alt="" />
                            </div>
                            <div className="bg-[#F3F3F8] w-10 h-10 rounded-[2px] flex items-center justify-center overflow-hidden py-[7px] px-[6px] shrink-0">
                                <img className="w-full h-full object-contain" src={Images.thumb} alt="" />
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
};
