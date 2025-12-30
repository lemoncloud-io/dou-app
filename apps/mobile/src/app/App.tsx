/**
 * Chatic React Native App
 * Test Screen with various components
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
import {
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <SafeAreaView style={styles.container}>
        <TestScreen />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function TestScreen() {
  const [count, setCount] = useState(0);
  const [text, setText] = useState('');
  const [isEnabled, setIsEnabled] = useState(false);

  const handlePress = (buttonName: string) => {
    Alert.alert('Button Pressed', `You pressed: ${buttonName}`);
  };

  return (
    <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Chatic Test Screen</Text>
      <Text style={styles.subtitle}>React Native 0.83</Text>

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
        <Button title="Reset" onPress={() => setCount(0)} />
      </View>

      {/* Text Input Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Text Input Test</Text>
        <TextInput
          style={styles.input}
          placeholder="Type something..."
          value={text}
          onChangeText={setText}
        />
        <Text style={styles.inputResult}>You typed: {text}</Text>
      </View>

      {/* Switch Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Switch Test</Text>
        <View style={styles.row}>
          <Text>Toggle: {isEnabled ? 'ON' : 'OFF'}</Text>
          <Switch
            value={isEnabled}
            onValueChange={setIsEnabled}
            trackColor={{ false: '#767577', true: '#81b0ff' }}
            thumbColor={isEnabled ? '#007AFF' : '#f4f3f4'}
          />
        </View>
      </View>

      {/* Button Types Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Button Types</Text>

        <TouchableOpacity
          style={styles.touchableButton}
          onPress={() => handlePress('TouchableOpacity')}
        >
          <Text style={styles.touchableButtonText}>TouchableOpacity</Text>
        </TouchableOpacity>

        <Pressable
          style={({ pressed }) => [
            styles.pressableButton,
            pressed && styles.pressableButtonPressed,
          ]}
          onPress={() => handlePress('Pressable')}
        >
          <Text style={styles.pressableButtonText}>Pressable</Text>
        </Pressable>

        <Button
          title="Native Button"
          onPress={() => handlePress('Native Button')}
        />

        <View style={styles.spacer} />

        <Button
          title="Show Alert"
          color="#FF6B6B"
          onPress={() => {
            Alert.alert(
              'Alert Title',
              'This is an alert message!',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'OK', onPress: () => console.log('OK Pressed') },
              ]
            );
          }}
        />
      </View>

      {/* Colors Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Color Boxes</Text>
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

      <View style={styles.footer}>
        <Text style={styles.footerText}>Chatic v0.0.1</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  scrollView: {
    flex: 1,
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
  touchableButton: {
    backgroundColor: '#007AFF',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  touchableButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  pressableButton: {
    backgroundColor: '#5856D6',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
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
  spacer: {
    height: 12,
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
  footer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  footerText: {
    color: '#999',
    fontSize: 12,
  },
});

export default App;
