import React, { useEffect, useState } from 'react';
import {
    Alert,
    FlatList,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    UIManager,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StorageService } from '../../../common';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface StorageItem {
    key: string;
    value: any;
}

export const StorageTestScreen = () => {
    const insets = useSafeAreaInsets();
    const [items, setItems] = useState<StorageItem[]>([]);
    const [filter, setFilter] = useState('');
    const [selectedKey, setSelectedKey] = useState<string | null>(null);

    const loadAllKeys = () => {
        const keys = StorageService.getAllKeys();
        const loadedItems = keys.map(key => {
            const value = StorageService.get(key);
            return { key, value };
        });
        setItems(loadedItems);
        setSelectedKey(null);
    };

    useEffect(() => {
        loadAllKeys();
    }, []);

    const handleDelete = (key: string) => {
        Alert.alert('삭제 확인', `정말 '${key}' 데이터를 삭제하시겠습니까?`, [
            { text: '취소', style: 'cancel' },
            {
                text: '삭제',
                style: 'destructive',
                onPress: () => {
                    StorageService.remove(key);
                    loadAllKeys();
                },
            },
        ]);
    };

    const handleClearAll = () => {
        Alert.alert('전체 삭제 확인', '모든 캐시 데이터를 삭제하시겠습니까?', [
            { text: '취소', style: 'cancel' },
            {
                text: '삭제',
                style: 'destructive',
                onPress: () => {
                    StorageService.clearAll();
                    loadAllKeys();
                },
            },
        ]);
    };

    const filteredItems = items.filter(item => item.key.toLowerCase().includes(filter.toLowerCase()));

    const renderItem = ({ item }: { item: StorageItem }) => {
        const isSelected = selectedKey === item.key;
        return (
            <TouchableOpacity
                style={[styles.itemContainer, isSelected && styles.itemSelected]}
                onPress={() => setSelectedKey(isSelected ? null : item.key)}
            >
                <View style={styles.itemHeader}>
                    <Text style={styles.itemKey} numberOfLines={1}>
                        {item.key}
                    </Text>
                    <TouchableOpacity
                        style={styles.deleteButton}
                        onPress={() => handleDelete(item.key)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <Text style={styles.deleteText}>삭제</Text>
                    </TouchableOpacity>
                </View>
                {isSelected && (
                    <View style={styles.itemValueContainer}>
                        <Text style={styles.itemValue}>{JSON.stringify(item.value, null, 2)}</Text>
                    </View>
                )}
            </TouchableOpacity>
        );
    };

    return (
        <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
            <View style={styles.header}>
                <Text style={styles.title}>Storage Viewer</Text>
                <TouchableOpacity style={styles.refreshButton} onPress={loadAllKeys}>
                    <Text style={styles.buttonText}>새로고침</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.searchContainer}>
                <TextInput
                    style={styles.searchInput}
                    placeholder="키 검색 (예: channel, chat)"
                    placeholderTextColor="#666"
                    value={filter}
                    onChangeText={setFilter}
                />
            </View>

            <View style={styles.listHeader}>
                <Text style={styles.countText}>
                    Total: {items.length} (Filtered: {filteredItems.length})
                </Text>
                <TouchableOpacity onPress={handleClearAll}>
                    <Text style={styles.clearAllText}>전체 삭제</Text>
                </TouchableOpacity>
            </View>

            <FlatList
                data={filteredItems}
                keyExtractor={item => item.key}
                renderItem={renderItem}
                style={styles.list}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={<Text style={styles.emptyText}>데이터가 없습니다.</Text>}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: '#121212',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#333',
        backgroundColor: '#1E1E1E',
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#FFFFFF',
    },
    refreshButton: {
        backgroundColor: '#4A90E2',
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 6,
    },
    buttonText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: 12,
    },
    searchContainer: {
        padding: 12,
        backgroundColor: '#1E1E1E',
        borderBottomWidth: 1,
        borderBottomColor: '#333',
    },
    searchInput: {
        backgroundColor: '#333',
        borderRadius: 8,
        padding: 10,
        color: '#FFFFFF',
        fontSize: 14,
    },
    listHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: '#252525',
    },
    countText: {
        color: '#888',
        fontSize: 12,
    },
    clearAllText: {
        color: '#FF5A5F',
        fontSize: 12,
        fontWeight: 'bold',
    },
    list: {
        flex: 1,
    },
    listContent: {
        padding: 16,
    },
    itemContainer: {
        backgroundColor: '#1E1E1E',
        borderRadius: 8,
        padding: 12,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#333',
    },
    itemSelected: {
        borderColor: '#4A90E2',
    },
    itemHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    itemKey: {
        color: '#50E3C2',
        fontWeight: 'bold',
        fontSize: 14,
        flex: 1,
        marginRight: 8,
    },
    deleteButton: {
        padding: 4,
    },
    deleteText: {
        color: '#FF5A5F',
        fontSize: 12,
    },
    itemValueContainer: {
        marginTop: 8,
        backgroundColor: '#000',
        padding: 8,
        borderRadius: 4,
    },
    itemValue: {
        color: '#DDD',
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        fontSize: 11,
    },
    emptyText: {
        color: '#666',
        textAlign: 'center',
        marginTop: 20,
    },
});
