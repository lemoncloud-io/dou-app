import { Navigation, Pagination } from 'swiper/modules';
import { Swiper, SwiperSlide } from 'swiper/react';

import { Images } from '@lemon/assets';
import { ChatButton } from '@lemon/ui-kit/components/ui/chat-button';

export const OnboardingPage = () => {
    return (
        <div className="bg-white text-chatic-text-700">
            <button className="font-medium absolute top-3 right-4 text-chatic-text-800" aria-label="온보딩 건너뛰기">
                SKIP
            </button>
            <Swiper
                modules={[Navigation, Pagination]}
                pagination={{
                    clickable: true,
                    el: '.custom-pagination',
                }}
                className="h-screen relative"
            >
                <SwiperSlide className="flex items-center justify-center h-screen mt-12">
                    <div className="flex flex-col h-full">
                        <div className="pt-[13px] px-[18px]">
                            <div className="text-[19px] font-semibold text-chatic-text-primary">
                                ISFJ? 친절한 조력자?
                                <br />
                                나만의 AI 에이전트를 만들어 보세요!
                            </div>
                            <div className="mt-2 text-sm">
                                닉네임, 나이, 성격, 스타일을 입력하고
                                <br />
                                당신만을 위한 에이전트를 만들 수 있어요
                            </div>
                        </div>
                        <div className="mt-auto flex justify-center px-[27px]">
                            <div className="relative">
                                <div
                                    className="absolute top-4 left-0 w-full h-10 pointer-events-none"
                                    style={{
                                        background:
                                            'linear-gradient(0deg, rgba(255, 255, 255, 0.01) 0%, rgba(255, 255, 255, 0.48) 29.37%, rgba(255, 255, 255, 0.80) 58.93%, #FFF 100%)',
                                    }}
                                />
                                <img
                                    src={Images.onboarding_1}
                                    className="w-full"
                                    alt="나만의 AI 에이전트를 만드는 예시 이미지"
                                />
                            </div>
                        </div>
                    </div>
                </SwiperSlide>
                <SwiperSlide className="flex items-center justify-center h-screen mt-12">
                    <div className="flex flex-col h-full">
                        <div className="pt-[13px] px-[18px]">
                            <div className="text-[19px] font-semibold text-chatic-text-primary">
                                친구와 함께 대화 목적에 딱 맞는
                                <br />
                                공간을 만들어 보세요!
                            </div>
                            <div className="mt-2 text-sm">
                                방 이름을 정하고 여행계획, 게임, 커플 채팅 등<br />
                                어떤 용도로 쓸지 선택해 보세요
                            </div>
                        </div>
                        <div className="mt-auto flex justify-center px-[27px]">
                            <div className="relative">
                                <div
                                    className="absolute top-0 left-0 w-full h-10 pointer-events-none"
                                    style={{
                                        background:
                                            'linear-gradient(0deg, rgba(255, 255, 255, 0.01) 0%, rgba(255, 255, 255, 0.48) 29.37%, rgba(255, 255, 255, 0.80) 58.93%, #FFF 100%)',
                                    }}
                                />
                                <img src={Images.onboarding_2} className="w-full" alt="" />
                            </div>
                        </div>
                    </div>
                </SwiperSlide>
                <SwiperSlide className="flex items-center justify-center h-screen mt-12">
                    <div className="flex flex-col h-full">
                        <div className="pt-[13px] px-[18px]">
                            <div className="text-[19px] font-semibold text-chatic-text-primary">
                                친구와 대화 중, 필요한 순간에
                                <br />
                                AI 에이전트의 도움을 받아보세요
                            </div>
                            <div className="mt-2 text-sm">
                                여행, 일정, 정보 등 바로 알려줘서
                                <br />
                                대화가 더 편해집니다!
                            </div>
                        </div>
                        <div className="mt-auto flex justify-center px-[27px]">
                            <div className="relative">
                                <div
                                    className="absolute top-0 left-0 w-full h-10 pointer-events-none"
                                    style={{
                                        background:
                                            'linear-gradient(0deg, rgba(255, 255, 255, 0.01) 0%, rgba(255, 255, 255, 0.48) 29.37%, rgba(255, 255, 255, 0.80) 58.93%, #FFF 100%)',
                                    }}
                                />
                                <img src={Images.onboarding_3} className="w-full" alt="" />
                            </div>
                        </div>
                    </div>
                </SwiperSlide>
                <SwiperSlide className="flex items-center justify-center h-screen mt-12">
                    <div className="flex flex-col h-full">
                        <div className="pt-[13px] px-[18px]">
                            <div className="text-[19px] font-semibold text-chatic-text-primary">
                                나만의 채팅, 나만의 에이전트
                                <br />
                                혼잣말도 OK! 기록도 OK!
                            </div>
                            <div className="mt-2 text-sm">
                                일상, 생각, 계획 등 자유롭게 남겨보세요
                                <br />
                                AI 에이전트가 그 내용을 바탕으로 정확하게 도와줘요!
                            </div>
                        </div>
                        <div className="mt-auto flex justify-center px-[27px]">
                            <div className="relative">
                                <div
                                    className="absolute top-0 left-0 w-full h-10 pointer-events-none"
                                    style={{
                                        background:
                                            'linear-gradient(0deg, rgba(255, 255, 255, 0.01) 0%, rgba(255, 255, 255, 0.48) 29.37%, rgba(255, 255, 255, 0.80) 58.93%, #FFF 100%)',
                                    }}
                                />
                                <img src={Images.onboarding_4} className="w-full" alt="" />
                            </div>
                        </div>
                    </div>
                </SwiperSlide>
                <SwiperSlide className="flex items-center justify-center h-screen mt-12">
                    <div className="flex flex-col h-full">
                        <div className="pt-[13px] px-[18px]">
                            <div className="text-[19px] font-semibold text-chatic-text-primary">
                                이제 채틱을
                                <br />
                                시작해 볼까요?
                            </div>
                        </div>
                        <div className="flex justify-center mt-[34px]">
                            <ChatButton aria-label="온보딩 시작하기">시작</ChatButton>
                        </div>
                    </div>
                </SwiperSlide>
                <div
                    className="custom-pagination h-fit !left-4 !top-5 absolute z-10 flex gap-[5px]"
                    aria-hidden="true"
                ></div>
            </Swiper>
        </div>
    );
};
