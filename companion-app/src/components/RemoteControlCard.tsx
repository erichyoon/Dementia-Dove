import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  isStarted: boolean;
  onTriggerStart: () => void;
  onTriggerWelcome: () => void;
  onSendCustomText: (text: string) => void;
}

export const RemoteControlCard: React.FC<Props> = ({
  isStarted,
  onTriggerStart,
  onTriggerWelcome,
  onSendCustomText,
}) => {
  const [inputText, setInputText] = useState('');

  const handleSend = () => {
    if (inputText.trim()) {
      onSendCustomText(inputText.trim());
      setInputText('');
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Remote Hardware Controls</Text>

      {/* Primary Action Buttons */}
      <View style={styles.buttonRow}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={onTriggerStart}
          style={[
            styles.actionButton,
            { backgroundColor: isStarted ? '#10b981' : '#2563eb' },
          ]}
        >
          <Ionicons name={isStarted ? 'stop-circle' : 'play-circle'} size={20} color="#fff" />
          <Text style={styles.actionButtonText}>
            {isStarted ? 'Trigger Stop' : 'Trigger Start'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={onTriggerWelcome}
          style={[styles.actionButton, styles.welcomeButton]}
        >
          <Ionicons name="sparkles" size={18} color="#000" />
          <Text style={styles.welcomeButtonText}>Trigger Welcome</Text>
        </TouchableOpacity>
      </View>

      {/* Physical Button Emulation Banner */}
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onTriggerStart}
        style={styles.physicalEmulateBanner}
      >
        <Ionicons name="radio-button-on" size={16} color="#38bdf8" />
        <Text style={styles.physicalEmulateText}>
          Simulate Physical Top Button Press (GPIO 0)
        </Text>
      </TouchableOpacity>

      {/* Send Custom Text to Screen */}
      <View style={styles.customTextContainer}>
        <TextInput
          style={styles.textInput}
          placeholder="Type message for ESP32 screen..."
          placeholderTextColor="#64748b"
          value={inputText}
          onChangeText={setInputText}
          onSubmitEditing={handleSend}
        />
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handleSend}
          style={styles.sendButton}
        >
          <Ionicons name="send" size={16} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#131d31',
    borderRadius: 20,
    padding: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  welcomeButton: {
    backgroundColor: '#ffffff',
  },
  welcomeButtonText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '700',
  },
  physicalEmulateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0a0f1d',
    borderWidth: 1,
    borderColor: '#38bdf8',
    borderRadius: 12,
    paddingVertical: 10,
    marginTop: 12,
  },
  physicalEmulateText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '600',
  },
  customTextContainer: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#0a0f1d',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#f8fafc',
    fontSize: 13,
  },
  sendButton: {
    backgroundColor: '#3b82f6',
    width: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
