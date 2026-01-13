import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: '#F5F5F5',
    },
    content: {
        padding: 20,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 4,
        color: '#333',
    },
    subtitle: {
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 24,
        color: '#666',
    },
    section: {
        backgroundColor: '#FFF',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 12,
        color: '#333',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginVertical: 8,
    },
    counterText: {
        fontSize: 48,
        fontWeight: 'bold',
        textAlign: 'center',
        marginVertical: 16,
        color: '#007AFF',
    },
    button: {
        paddingVertical: 12,
        paddingHorizontal: 32,
        borderRadius: 8,
    },
    buttonRed: {
        backgroundColor: '#FF6B6B',
    },
    buttonGreen: {
        backgroundColor: '#4ECDC4',
    },
    buttonText: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: '600',
    },
    navButton: {
        backgroundColor: '#007AFF',
        padding: 14,
        borderRadius: 8,
        alignItems: 'center',
        marginBottom: 10,
    },
    navButtonPurple: {
        backgroundColor: '#5856D6',
    },
    navButtonOrange: {
        backgroundColor: '#FF9500',
    },
    navButtonGray: {
        backgroundColor: '#8E8E93',
    },
    navButtonRed: {
        backgroundColor: '#FF3B30',
    },
    navButtonText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: '600',
    },
    colorRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    colorBox: {
        width: 50,
        height: 50,
        borderRadius: 8,
    },
    paramText: {
        fontSize: 16,
        marginBottom: 8,
        color: '#333',
    },
    input: {
        borderWidth: 1,
        borderColor: '#DDD',
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
        backgroundColor: '#FAFAFA',
    },
    inputResult: {
        marginTop: 8,
        color: '#666',
    },
    settingRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#EEE',
    },
    settingLabel: {
        fontSize: 16,
        color: '#333',
    },
    spacer: {
        height: 12,
    },
    avatar: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#007AFF',
        justifyContent: 'center',
        alignItems: 'center',
        alignSelf: 'center',
        marginBottom: 12,
    },
    avatarText: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#FFF',
    },
    profileName: {
        fontSize: 24,
        fontWeight: 'bold',
        textAlign: 'center',
        color: '#333',
    },
    profileId: {
        fontSize: 14,
        textAlign: 'center',
        color: '#666',
        marginTop: 4,
    },
    pressableButton: {
        backgroundColor: '#007AFF',
        padding: 14,
        borderRadius: 8,
        alignItems: 'center',
        marginBottom: 10,
    },
    pressableButtonSecondary: {
        backgroundColor: '#FF3B30',
    },
    pressableButtonPressed: {
        opacity: 0.7,
        transform: [{ scale: 0.98 }],
    },
    pressableButtonText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: '600',
    },
});
