import React, { useState } from 'react';

import { BrandHeader, ChatButton, ChatInput, ChatMessage, TypingIndicator, TypingMessage } from '@lemon/ui-kit';

interface Message {
    id: number;
    text: string;
    type: 'system' | 'user' | 'button' | 'typing';
    gradient?: boolean;
    isTyping?: boolean;
}

// 타이핑 속도 상수
const TYPING_SPEED = 40; // ms per character
const TYPING_INITIAL_DELAY = 200; // ms

interface EmailVerificationPageProps {
    email: string;
}

export const EmailVerificationPage: React.FC<EmailVerificationPageProps> = ({ email }) => {
    const [isTyping, setIsTyping] = useState(false);
    const [isSystemTyping, setIsSystemTyping] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [hasInitialized, setHasInitialized] = useState(false);
    const [isInitialMessagesComplete, setIsInitialMessagesComplete] = useState(false);
    const [attemptCount, setAttemptCount] = useState(0);

    // ChatInput에 대한 ref 생성
    const chatInputRef = React.useRef<HTMLTextAreaElement>(null);
    const messagesEndRef = React.useRef<HTMLDivElement>(null);

    const validateEmail = (email: string): boolean => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    };

    const showTypingIndicator = () => {
        setIsTyping(true);
        const typingMessage: Message = {
            id: Date.now(),
            text: '',
            type: 'typing',
        };
        setMessages(prev => [...prev, typingMessage]);
    };

    const hideTypingIndicator = () => {
        setIsTyping(false);
        setMessages(prev => prev.filter(msg => msg.type !== 'typing'));
    };

    const addTypingMessage = (text: string, gradient = false, delay = 0) => {
        return new Promise<void>(resolve => {
            setTimeout(() => {
                // 기존 타이핑 인디케이터 제거
                setMessages(prev => prev.filter(msg => msg.type !== 'typing'));
                setIsSystemTyping(true);

                const messageId = Date.now() + Math.random();
                const systemMessage: Message = {
                    id: messageId,
                    text,
                    type: 'system',
                    gradient,
                    isTyping: true,
                };

                setMessages(prev => [...prev, systemMessage]);

                // 타이핑 완료 후 resolve
                const typingDuration = text.length * TYPING_SPEED + TYPING_INITIAL_DELAY;
                setTimeout(() => {
                    setMessages(prev => prev.map(msg => (msg.id === messageId ? { ...msg, isTyping: false } : msg)));
                    setIsSystemTyping(false);
                    resolve();
                }, typingDuration);
            }, delay);
        });
    };

    // 초기 메시지 애니메이션 - useRef로 중복 실행 방지
    const initRef = React.useRef(false);

    React.useEffect(() => {
        if (!initRef.current) {
            initRef.current = true;
            setHasInitialized(true);

            const initializeChat = async () => {
                // 첫 번째 메시지
                await addTypingMessage(`${email}로 인증 번호를 전송했어요 📧`, false, 500);

                // 두 번째 메시지 (그라디언트)
                await addTypingMessage('인증 번호를 입력해 주세요!', true, 800);

                // 모든 초기 메시지 완료
                setIsInitialMessagesComplete(true);

                // 입력 폼에 포커스
                setTimeout(() => {
                    chatInputRef.current?.focus();
                }, 300);
            };

            initializeChat();
        }
    }, [email]); // 빈 의존성 배열

    const handleSendMessage = async (message: string) => {
        // 사용자 메시지 추가
        const userMessage: Message = {
            id: Date.now() + Math.random(),
            text: message,
            type: 'user',
        };
        setMessages(prev => [...prev, userMessage]);

        // 타이핑 인디케이터 표시
        setTimeout(() => {
            showTypingIndicator();
        }, 300);

        // 인증번호 검증 (예시: 123456)
        setTimeout(async () => {
            if (message === '123456') {
                await addTypingMessage('인증이 완료되었습니다! 🎉', true, 0);

                // 성공 후 추가 메시지
                setTimeout(async () => {
                    await addTypingMessage('이제 비밀번호를 설정해주세요!', false, 0);
                }, 1000);
            } else {
                const newAttemptCount = attemptCount + 1;
                setAttemptCount(newAttemptCount);

                if (newAttemptCount >= 5) {
                    await addTypingMessage(
                        '인증 횟수 5번을 초과했습니다.😢 1분 뒤 다시 이메일 인증을 진행해 주세요!',
                        false,
                        0
                    );
                } else {
                    await addTypingMessage('입력한 인증번호가 정확하지 않아요 😥\n다시 확인해 주세요!', false, 0);

                    // 버튼 추가
                    setTimeout(() => {
                        const buttonMessage: Message = {
                            id: Date.now() + Math.random(),
                            text: '인증번호 재전송',
                            type: 'button',
                        };
                        setMessages(prev => [...prev, buttonMessage]);
                    }, 300);
                }
            }
        }, 800);
    };

    const handleResendCode = async () => {
        // 버튼 메시지 제거
        setMessages(prev => prev.filter(msg => msg.type !== 'button'));

        // 재전송 메시지 표시
        setTimeout(() => {
            showTypingIndicator();
        }, 300);

        setTimeout(async () => {
            await addTypingMessage('인증번호를 다시 전송했어요! 📧', false, 0);
        }, 800);
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    // 메시지가 변경될 때마다 자동 스크롤
    React.useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const getPlaceholder = (): string => {
        return '인증번호를 입력해 주세요';
    };

    return (
        <div className="flex flex-col h-screen mx-auto bg-background">
            {/* Header */}
            <BrandHeader showBorder={false} />

            {/* Chat Messages Area */}
            <div className="flex-1 overflow-y-auto px-4 pb-32 pt-[80px]">
                <div className="space-y-1">
                    {messages.map(message => {
                        if (message.type === 'button') {
                            return (
                                <div key={message.id} className="flex justify-center !mt-8">
                                    <ChatButton onClick={handleResendCode}>{message.text}</ChatButton>
                                </div>
                            );
                        }
                        if (message.type === 'typing') {
                            return (
                                <div key={message.id} className="flex justify-start">
                                    <TypingIndicator size="default" />
                                </div>
                            );
                        }
                        return message.isTyping ? (
                            <TypingMessage
                                key={message.id}
                                text={message.text}
                                type={message.type as 'system' | 'user'}
                                gradient={message.gradient}
                                typingSpeed={TYPING_SPEED}
                            />
                        ) : (
                            <ChatMessage
                                key={message.id}
                                message={message.text}
                                type={message.type as 'system' | 'user'}
                                gradient={message.gradient}
                            />
                        );
                    })}
                    <div ref={messagesEndRef} />
                </div>
            </div>

            {/* Chat Input */}
            <div className="fixed bottom-0 left-0 right-0 bg-background">
                <ChatInput
                    ref={chatInputRef}
                    placeholder={getPlaceholder()}
                    onSend={handleSendMessage}
                    disabled={isSystemTyping || !isInitialMessagesComplete}
                />
            </div>
        </div>
    );
};
