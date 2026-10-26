import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { HardwareState } from '../types/device';

interface Props {
  state: HardwareState;
  onPressWelcome: () => void;
  onPressStart: () => void;
}

export const DeviceScreenReplica: React.FC<Props> = ({
  state,
  onPressWelcome,
  onPressStart,
}) => {
  return (
    <View style={styles.bezelOuter}>
      <View style={styles.topPhysicalButtonMarker}>
        <View style={styles.topPinTip} />
        <Text style={styles.topButtonLabel}>GPIO 0 / KEY 1</Text>
      </View>

      <View style={styles.screenInner}>
        <View style={styles.circularGuide} />

        <Text style={styles.headerTitle}>ESP32-S3 TOUCH</Text>

        <TouchableOpacity
          activeOpacity={0.75}
          onPress={onPressWelcome}
          style={styles.welcomeButton}
        >
          <Text style={styles.welcomeButtonText}>{state.topButtonText}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.75}
          onPress={onPressStart}
          style={[
            styles.startButton,
            { backgroundColor: state.accentColor },
          ]}
        >
          <Text style={styles.startButtonText}>{state.bottomButtonText}</Text>
        </TouchableOpacity>

        <Text style={styles.statusSubtitle} numberOfLines={1}>
          {state.statusText}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  bezelOuter: {
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: '#1e293b',
    borderWidth: 8,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 10,
    position: 'relative',
  },
  topPhysicalButtonMarker: {
    position: 'absolute',
    top: -24,
    alignItems: 'center',
    zIndex: 10,
  },
  topPinTip: {
    width: 32,
    height: 8,
    backgroundColor: '#94a3b8',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  topButtonLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#38bdf8',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  screenInner: {
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: '#0b0f19',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  circularGuide: {
    position: 'absolute',
    width: 236,
    height: 236,
    borderRadius: 118,
    borderWidth: 1.5,
    borderColor: '#1e293b',
  },
  headerTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  welcomeButton: {
    width: 155,
    height: 46,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 6,
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  welcomeButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
    letterSpacing: 0.3,
  },
  startButton: {
    width: 155,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 6,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  startButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  statusSubtitle: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 6,
    maxWidth: 200,
    textAlign: 'center',
  },
});
