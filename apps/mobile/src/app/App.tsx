/**
 * Chatic React Native App
 * Navigation Test with multiple screens
 *
 * @format
 */

import { useState } from 'react';
import {
  Alert,
  Button,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

// Navigation Types
type RootStackParamList = {
  Home: undefined;
  Details: { itemId: number; title: string };
  Settings: undefined;
  Profile: { userId: string; name: string };
};

type HomeScreenProps = NativeStackScreenProps<RootStackParamList, 'Home'>;
type DetailsScreenProps = NativeStackScreenProps<RootStackParamList, 'Details'>;
type SettingsScreenProps = NativeStackScreenProps<RootStackParamList, 'Settings'>;
type ProfileScreenProps = NativeStackScreenProps<RootStackParamList, 'Profile'>;

const Stack = createNativeStackNavigator<RootStackParamList>();

// ============ HOME SCREEN ============
function HomeScreen({ navigation }: HomeScreenProps) {
  const [count, setCount] = useState(0);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Home Screen</Text>
      <Text style={styles.subtitle}>React Native 0.83 + Navigation</Text>

      {/* Counter Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Counter Test</Text>
        <Text style={styles.counterText}>{count}</Text>
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.button, styles.buttonRed]}
            onPress={() => setCount(c => c - 1)}
          >
            <Text style={styles.buttonText}>- 1</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.buttonGreen]}
            onPress={() => setCount(c => c + 1)}
          >
            <Text style={styles.buttonText}>+ 1</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Navigation Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Navigation Test</Text>

        <TouchableOpacity
          style={styles.navButton}
          onPress={() => navigation.navigate('Details', { itemId: 42, title: 'First Item' })}
        >
          <Text style={styles.navButtonText}>Go to Details (ID: 42)</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navButton}
          onPress={() => navigation.navigate('Details', { itemId: 100, title: 'Second Item' })}
        >
          <Text style={styles.navButtonText}>Go to Details (ID: 100)</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navButton, styles.navButtonPurple]}
          onPress={() => navigation.navigate('Settings')}
        >
          <Text style={styles.navButtonText}>Go to Settings</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navButton, styles.navButtonOrange]}
          onPress={() => navigation.navigate('Profile', { userId: 'user123', name: 'John Doe' })}
        >
          <Text style={styles.navButtonText}>Go to Profile</Text>
        </TouchableOpacity>
      </View>

      {/* Color Boxes */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Touch Test</Text>
        <View style={styles.colorRow}>
          {['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7'].map((color, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.colorBox, { backgroundColor: color }]}
              onPress={() => Alert.alert('Color', color)}
            />
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

// ============ DETAILS SCREEN ============
function DetailsScreen({ route, navigation }: DetailsScreenProps) {
  const { itemId, title } = route.params;
  const [inputText, setInputText] = useState('');

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Details Screen</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Received Params</Text>
        <Text style={styles.paramText}>Item ID: {itemId}</Text>
        <Text style={styles.paramText}>Title: {title}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Text Input Test</Text>
        <TextInput
          style={styles.input}
          placeholder="Type something..."
          value={inputText}
          onChangeText={setInputText}
        />
        <Text style={styles.inputResult}>You typed: {inputText}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Navigation Actions</Text>

        <TouchableOpacity
          style={styles.navButton}
          onPress={() => navigation.navigate('Details', { itemId: itemId + 1, title: 'New Item' })}
        >
          <Text style={styles.navButtonText}>Go to Next Details (ID: {itemId + 1})</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navButton, styles.navButtonGray]}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.navButtonText}>Go Back</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navButton, styles.navButtonRed]}
          onPress={() => navigation.popToTop()}
        >
          <Text style={styles.navButtonText}>Pop to Home</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// ============ SETTINGS SCREEN ============
function SettingsScreen({ navigation }: SettingsScreenProps) {
  const [notifications, setNotifications] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [autoSave, setAutoSave] = useState(true);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Settings Screen</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preferences</Text>

        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Notifications</Text>
          <Switch
            value={notifications}
            onValueChange={setNotifications}
            trackColor={{ false: '#767577', true: '#81b0ff' }}
          />
        </View>

        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Dark Mode</Text>
          <Switch
            value={darkMode}
            onValueChange={setDarkMode}
            trackColor={{ false: '#767577', true: '#81b0ff' }}
          />
        </View>

        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Auto Save</Text>
          <Switch
            value={autoSave}
            onValueChange={setAutoSave}
            trackColor={{ false: '#767577', true: '#81b0ff' }}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Actions</Text>

        <Button
          title="Show Alert"
          onPress={() => Alert.alert('Settings', 'Settings saved!')}
        />

        <View style={styles.spacer} />

        <Button
          title="Clear Cache"
          color="#FF6B6B"
          onPress={() => Alert.alert('Cache', 'Cache cleared!')}
        />
      </View>

      <View style={styles.section}>
        <TouchableOpacity
          style={[styles.navButton, styles.navButtonGray]}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.navButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// ============ PROFILE SCREEN ============
function ProfileScreen({ route, navigation }: ProfileScreenProps) {
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
          style={({ pressed }) => [
            styles.pressableButton,
            pressed && styles.pressableButtonPressed,
          ]}
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
        <TouchableOpacity
          style={[styles.navButton, styles.navButtonGray]}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.navButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// ============ MAIN APP ============
function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="Home"
          screenOptions={{
            headerStyle: { backgroundColor: '#007AFF' },
            headerTintColor: '#fff',
            headerTitleStyle: { fontWeight: 'bold' },
          }}
        >
          <Stack.Screen
            name="Home"
            component={HomeScreen}
            options={{ title: 'Chatic Home' }}
          />
          <Stack.Screen
            name="Details"
            component={DetailsScreen}
            options={({ route }) => ({ title: route.params.title })}
          />
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{ title: 'Settings' }}
          />
          <Stack.Screen
            name="Profile"
            component={ProfileScreen}
            options={({ route }) => ({ title: route.params.name })}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
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

export default App;
