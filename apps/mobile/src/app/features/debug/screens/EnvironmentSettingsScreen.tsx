import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { getDefaultWebviewBaseUrl, useDebugRuntimeStore, useDebugSettingsStore } from '../../../stores';
import { useDebugTheme } from '../theme';

const isValidHttpUrl = (value: string): boolean => {
    try {
        const parsed = new URL(value);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
};

interface EnvironmentSettingsScreenProps {
    onCloseAfterWebViewReload?: () => void;
}

export const EnvironmentSettingsScreen = ({ onCloseAfterWebViewReload }: EnvironmentSettingsScreenProps) => {
    const colors = useDebugTheme();
    const defaultBaseUrl = getDefaultWebviewBaseUrl();
    const { webviewBaseUrlOverride, setWebviewBaseUrlOverride, resetDebugSettings, getResolvedWebviewBaseUrl } =
        useDebugSettingsStore();
    const requestWebViewReload = useDebugRuntimeStore(state => state.requestWebViewReload);

    const [baseUrlInput, setBaseUrlInput] = useState(webviewBaseUrlOverride ?? '');
    const [message, setMessage] = useState<string | null>(null);

    useEffect(() => {
        setBaseUrlInput(webviewBaseUrlOverride ?? '');
    }, [webviewBaseUrlOverride]);

    const resolvedBaseUrl = getResolvedWebviewBaseUrl();

    const baseUrlError = useMemo(() => {
        if (!baseUrlInput.trim()) return null;
        return isValidHttpUrl(baseUrlInput.trim()) ? null : 'http 또는 https URL만 사용할 수 있습니다.';
    }, [baseUrlInput]);

    const saveBaseUrl = () => {
        if (baseUrlError) {
            setMessage(baseUrlError);
            return;
        }
        setWebviewBaseUrlOverride(baseUrlInput);
        setMessage('BASE_URL 설정을 저장했습니다.');
    };

    const resetAll = () => {
        resetDebugSettings();
        setMessage('환경설정을 기본값으로 복원했습니다.');
    };

    const applyWebViewReload = () => {
        requestWebViewReload();
        setMessage('웹뷰 재시작을 요청했습니다.');
        onCloseAfterWebViewReload?.();
    };

    return (
        <ScrollView
            style={[styles.screen, { backgroundColor: colors.background }]}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
        >
            <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.title, { color: colors.text }]}>BASE_URL</Text>
                <Text style={[styles.label, { color: colors.subtleText }]}>기본값</Text>
                <Text style={[styles.mono, { color: colors.mutedText }]}>{defaultBaseUrl || '-'}</Text>
                <Text style={[styles.label, { color: colors.subtleText }]}>현재 적용 대상</Text>
                <Text style={[styles.mono, { color: colors.mutedText }]}>{resolvedBaseUrl || '-'}</Text>
                <TextInput
                    value={baseUrlInput}
                    onChangeText={setBaseUrlInput}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="https://example.com/"
                    placeholderTextColor={colors.subtleText}
                    style={[
                        styles.input,
                        { color: colors.text, borderColor: baseUrlError ? '#EF4444' : colors.border },
                    ]}
                />
                {baseUrlError && <Text style={styles.errorText}>{baseUrlError}</Text>}
                <View style={styles.actions}>
                    <TouchableOpacity style={styles.primaryButton} onPress={saveBaseUrl}>
                        <Text style={styles.primaryButtonText}>저장</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.secondaryButton, { borderColor: colors.border }]}
                        onPress={() => {
                            setBaseUrlInput('');
                            setWebviewBaseUrlOverride(null);
                            setMessage('BASE_URL override를 제거했습니다.');
                        }}
                    >
                        <Text style={[styles.secondaryButtonText, { color: colors.text }]}>기본값 사용</Text>
                    </TouchableOpacity>
                </View>
                <TouchableOpacity style={styles.warningButton} onPress={applyWebViewReload}>
                    <Text style={styles.warningButtonText}>적용 후 웹뷰 재시작</Text>
                </TouchableOpacity>
            </View>

            <TouchableOpacity style={[styles.secondaryButton, { borderColor: colors.border }]} onPress={resetAll}>
                <Text style={[styles.secondaryButtonText, { color: colors.text }]}>환경설정 전체 초기화</Text>
            </TouchableOpacity>

            {message && <Text style={[styles.message, { color: colors.mutedText }]}>{message}</Text>}
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    screen: {
        flex: 1,
    },
    content: {
        padding: 16,
        paddingBottom: 32,
        gap: 16,
    },
    panel: {
        borderWidth: 1,
        borderRadius: 8,
        padding: 16,
        gap: 10,
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
    },
    label: {
        fontSize: 12,
        textTransform: 'uppercase',
    },
    mono: {
        fontFamily: 'monospace',
        fontSize: 13,
    },
    input: {
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 15,
    },
    errorText: {
        color: '#EF4444',
        fontSize: 12,
    },
    actions: {
        flexDirection: 'row',
        gap: 10,
    },
    primaryButton: {
        backgroundColor: '#2563EB',
        borderRadius: 8,
        paddingHorizontal: 14,
        paddingVertical: 12,
        alignItems: 'center',
    },
    primaryButtonText: {
        color: '#FFFFFF',
        fontWeight: '700',
    },
    secondaryButton: {
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 14,
        paddingVertical: 12,
        alignItems: 'center',
    },
    secondaryButtonText: {
        fontWeight: '700',
    },
    warningButton: {
        backgroundColor: '#F59E0B',
        borderRadius: 8,
        paddingHorizontal: 14,
        paddingVertical: 12,
        alignItems: 'center',
    },
    warningButtonText: {
        color: '#111827',
        fontWeight: '800',
    },
    message: {
        fontSize: 13,
    },
});
