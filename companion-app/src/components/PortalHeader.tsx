import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Modal, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SyncState } from '../types/session';

interface Props {
  syncState: SyncState;
  lastSyncTime: string | null;
  onSync: (ip: string) => void;
}

export const PortalHeader: React.FC<Props> = ({ syncState, lastSyncTime, onSync }) => {
  const [showConfig, setShowConfig] = useState(false);
  const [deviceIp, setDeviceIp] = useState('192.168.4.1');

  const handleStartSync = () => {
    onSync(deviceIp);
    setShowConfig(false);
  };

  const formattedLastSync = lastSyncTime
    ? new Date(lastSyncTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'Never';

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View>
          <Text style={styles.portalTitle}>Patient Portal</Text>
          <Text style={styles.deviceSubtitle}>ESP32-S3 Health Monitor</Text>
        </View>

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => onSync(deviceIp)}
          style={[styles.syncButton, syncState === 'syncing' && styles.syncButtonActive]}
          disabled={syncState === 'syncing'}
        >
          {syncState === 'syncing' ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Ionicons name="cloud-download-outline" size={16} color="#ffffff" />
          )}
          <Text style={styles.syncButtonText}>
            {syncState === 'syncing' ? 'Syncing...' : 'Sync Device'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statusRow}>
        <View style={styles.offlinePill}>
          <Ionicons name="checkmark-circle" size={14} color="#10b981" />
          <Text style={styles.offlinePillText}>Offline Ready • Last Sync: {formattedLastSync}</Text>
        </View>

        <TouchableOpacity onPress={() => setShowConfig(true)} style={styles.ipConfigBtn}>
          <Ionicons name="settings-outline" size={14} color="#64748b" />
          <Text style={styles.ipConfigText}>{deviceIp}</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={showConfig} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Device Connection IP</Text>
            <Text style={styles.modalDesc}>
              Enter the IP address of your ESP32-S3 on your Wi-Fi network or Access Point:
            </Text>
            <TextInput
              style={styles.input}
              value={deviceIp}
              onChangeText={setDeviceIp}
              placeholder="e.g. 192.168.4.1"
              placeholderTextColor="#94a3b8"
              autoCapitalize="none"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity onPress={() => setShowConfig(false)} style={styles.cancelBtn}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleStartSync} style={styles.saveBtn}>
                <Text style={styles.saveBtnText}>Save & Sync</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingTop: 54,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  portalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.5,
  },
  deviceSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
    fontWeight: '500',
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0284c7', // Calm medical medical blue
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  syncButtonActive: {
    backgroundColor: '#0369a1',
  },
  syncButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
  },
  offlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  offlinePillText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  ipConfigBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  ipConfigText: {
    fontSize: 11,
    color: '#64748b',
    textDecorationLine: 'underline',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalBox: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 340,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  modalDesc: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 6,
    lineHeight: 18,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0f172a',
    marginTop: 14,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 18,
  },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  cancelBtnText: {
    color: '#64748b',
    fontWeight: '600',
  },
  saveBtn: {
    backgroundColor: '#0284c7',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  saveBtnText: {
    color: '#ffffff',
    fontWeight: '700',
  },
});
