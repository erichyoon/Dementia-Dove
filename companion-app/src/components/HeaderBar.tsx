import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  isConnected: boolean;
  onToggleConnect: () => void;
}

export const HeaderBar: React.FC<Props> = ({ isConnected, onToggleConnect }) => {
  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.title}>ESP32-S3 Watch</Text>
        <Text style={styles.subtitle}>Touch LCD 1.85C Companion</Text>
      </View>

      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onToggleConnect}
        style={[
          styles.statusPill,
          isConnected ? styles.connectedPill : styles.disconnectedPill,
        ]}
      >
        <Ionicons
          name={isConnected ? 'radio' : 'radio-outline'}
          size={14}
          color={isConnected ? '#10b981' : '#f43f5e'}
        />
        <Text
          style={[
            styles.statusText,
            { color: isConnected ? '#10b981' : '#f43f5e' },
          ]}
        >
          {isConnected ? 'Connected' : 'Connect'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 54,
    paddingBottom: 14,
    backgroundColor: '#0a0f1d',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#f8fafc',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
    marginTop: 2,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  connectedPill: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  disconnectedPill: {
    backgroundColor: 'rgba(244, 63, 94, 0.12)',
    borderColor: 'rgba(244, 63, 94, 0.3)',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
