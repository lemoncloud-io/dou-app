import React, { useCallback } from 'react';
import { ActivityIndicator, Alert, FlatList, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { type ProductSubscription } from 'react-native-iap';

import { Logger, useSubscriptionIap } from '../../../common';

import type { Purchase } from 'react-native-iap';

const ShopScreen = () => {
    const { products, currentPurchases, loading, handlePurchase, checkUnfinishedPurchases } = useSubscriptionIap({
        onPurchaseSuccess: async (purchase: Purchase) => {
            Logger.info('IAP', '영수증 검증 시도:', purchase);
            await new Promise(resolve => setTimeout(resolve, 1000));
            Logger.info('IAP', '영수증 검증 성공:', purchase);
        },

        onPurchaseFinish: () => {
            Alert.alert('구독 완료', '구독 처리 완료!');
        },

        onPurchaseError: error => {
            Alert.alert('구매 실패', error.message);
        },
    });

    const handleRestore = async () => {
        if (loading) return;

        Alert.alert('구매 복원', '미처리된 결제 내역을 확인하고 복구를 시도합니다.', [
            { text: '취소', style: 'cancel' },
            {
                text: '확인',
                onPress: async () => {
                    await checkUnfinishedPurchases();
                },
            },
        ]);
    };

    const getDisplayPrice = useCallback((item: ProductSubscription) => {
        const p = item as any;

        if (Platform.OS === 'android') {
            const offer = p.subscriptionOffers?.[0] || p.subscriptionOfferDetails?.[0];
            const pricingPhase = offer?.pricingPhases?.pricingPhaseList?.[0];

            if (pricingPhase?.formattedPrice) {
                return pricingPhase.formattedPrice;
            }
        }

        return p.localizedPrice || p.price || '가격 문의';
    }, []);

    const renderItem = ({ item }: { item: ProductSubscription }) => {
        const isPurchased = currentPurchases.some(p => p.productId === item.id);

        return (
            <View style={[styles.itemContainer, isPurchased && styles.purchasedItem]}>
                <View style={styles.textContainer}>
                    <Text style={styles.title}>{item.title || item.displayName}</Text>
                    <Text style={styles.desc} numberOfLines={2}>
                        {item.description}
                    </Text>
                </View>

                {isPurchased ? (
                    <View style={styles.purchasedBadge}>
                        <Text style={styles.purchasedText}>이용 중</Text>
                    </View>
                ) : (
                    <TouchableOpacity
                        style={[styles.buyButton, loading && styles.disabledButton]}
                        onPress={() => handlePurchase(item.id)}
                        disabled={loading}
                    >
                        <Text style={styles.buttonText}>{getDisplayPrice(item)} / 구매</Text>
                    </TouchableOpacity>
                )}
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <Text style={styles.header}>구독 결제</Text>

            {products.length === 0 ? (
                <View style={styles.emptyContainer}>
                    {loading ? (
                        <Text>상품 정보를 불러오는 중입니다...</Text>
                    ) : (
                        <>
                            <Text>판매 중인 상품이 없습니다.</Text>
                            <Text style={styles.subText}>(스토어 콘솔 및 .env 설정을 확인해주세요)</Text>
                        </>
                    )}
                </View>
            ) : (
                <FlatList
                    data={products}
                    keyExtractor={item => item.id ?? item.id}
                    renderItem={renderItem}
                    contentContainerStyle={{ paddingBottom: 100 }}
                />
            )}

            <View style={styles.footer}>
                <TouchableOpacity style={styles.restoreButton} onPress={handleRestore} disabled={loading}>
                    <Text style={styles.restoreText}>↺ 구매 오류 복원 / 재시도</Text>
                </TouchableOpacity>
                <Text style={styles.footerNote}>결제가 되었으나 혜택이 적용되지 않았을 경우 눌러주세요.</Text>
            </View>

            {loading && (
                <View style={styles.loadingOverlay}>
                    <View style={styles.indicatorWrapper}>
                        <ActivityIndicator size="large" color="#ffffff" />
                        <Text style={styles.loadingText}>처리 중...</Text>
                    </View>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, backgroundColor: '#fff' },
    header: { fontSize: 28, fontWeight: 'bold', marginBottom: 20, color: '#333' },

    activeSubBanner: {
        backgroundColor: '#E8F5E9',
        padding: 10,
        borderRadius: 8,
        marginBottom: 15,
        alignItems: 'center',
    },
    activeSubText: { color: '#2E7D32', fontWeight: 'bold' },

    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    subText: { fontSize: 12, color: 'gray', marginTop: 10 },

    itemContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        marginBottom: 15,
        borderRadius: 16,
        backgroundColor: '#f8f9fa',
        borderWidth: 1,
        borderColor: '#eee',
        elevation: 2,
    },
    purchasedItem: {
        backgroundColor: '#F1F8E9',
        borderColor: '#C5E1A5',
    },
    textContainer: { flex: 1, paddingRight: 10 },
    title: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 4 },
    desc: { fontSize: 13, color: '#666' },

    buyButton: {
        backgroundColor: '#4A90E2',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 12,
    },
    disabledButton: { backgroundColor: '#A0A0A0' },
    buttonText: { color: 'white', fontWeight: 'bold', fontSize: 14 },

    // 이용 중 배지
    purchasedBadge: {
        paddingVertical: 10,
        paddingHorizontal: 14,
        backgroundColor: '#4CAF50',
        borderRadius: 12,
    },
    purchasedText: { color: 'white', fontWeight: 'bold', fontSize: 12 },

    footer: {
        marginTop: 'auto',
        alignItems: 'center',
        paddingVertical: 20,
        borderTopWidth: 1,
        borderTopColor: '#eee',
    },
    restoreButton: {
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 30,
        backgroundColor: '#f0f0f0',
        borderWidth: 1,
        borderColor: '#ddd',
    },
    restoreText: {
        color: '#555',
        fontWeight: '600',
        fontSize: 14,
    },
    footerNote: {
        fontSize: 11,
        color: '#999',
        marginTop: 8,
    },

    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
    },
    indicatorWrapper: {
        padding: 20,
        backgroundColor: '#333',
        borderRadius: 10,
        alignItems: 'center',
    },
    loadingText: { color: 'white', marginTop: 10, fontWeight: '600' },
});

export default ShopScreen;
