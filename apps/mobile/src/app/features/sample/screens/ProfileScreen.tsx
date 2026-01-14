import { Alert, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native';

import { styles } from '../common/style';

import type { ProfileScreenProps } from '../../../navigation';

export const ProfileScreen = ({ route, navigation }: ProfileScreenProps) => {
    const { userId, name } = route.params;

    return (
        <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
            <Text style={styles.title}>Profile Screen</Text>

            <View style={styles.section}>
                <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{name.charAt(0)}</Text>
                </View>
                <Text style={styles.profileName}>{name}</Text>
                <Text style={styles.profileId}>ID: {userId}</Text>
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Quick Actions</Text>

                <Pressable
                    style={({ pressed }) => [styles.pressableButton, pressed && styles.pressableButtonPressed]}
                    onPress={() => Alert.alert('Edit', 'Edit profile pressed!')}
                >
                    <Text style={styles.pressableButtonText}>Edit Profile</Text>
                </Pressable>

                <Pressable
                    style={({ pressed }) => [
                        styles.pressableButton,
                        styles.pressableButtonSecondary,
                        pressed && styles.pressableButtonPressed,
                    ]}
                    onPress={() => Alert.alert('Logout', 'Logout pressed!')}
                >
                    <Text style={styles.pressableButtonText}>Logout</Text>
                </Pressable>
            </View>

            <View style={styles.section}>
                <TouchableOpacity style={[styles.navButton, styles.navButtonGray]} onPress={() => navigation.goBack()}>
                    <Text style={styles.navButtonText}>Go Back</Text>
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
};
