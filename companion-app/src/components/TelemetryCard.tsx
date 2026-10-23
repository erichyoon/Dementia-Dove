import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { DeviceTelemetry } from '../types/device';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  telemetry: DeviceTelemetry;
  onAdjustBacklight: (level: number) => void;
  onSyncTime: () => void;
}

export const TelemetryCard: React.FC<Props> = ({
  telemetry,
  onAdjustBacklight,
  onSyncTime,
}) => {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Hardware Telemetry</Text>

      <View style={styles.grid}>
        {/* Battery Monitor (GPIO 8 ADC) */}
        <View style={styles.metricBox}>
          <View style={styles.iconRow}>
            <Ionicons name="battery-charging" size={18} color="#10b981" />
            <Text style={styles.metricLabel}>Battery (GPIO 8)</Text>
          </View>
          <Text style={styles.metricValue}>{telemetry.batteryPercentage}%</Text>
          <Text style={styles.metricSub}>{(telemetry.batteryMilliVolts / 1000).toFixed(2)} V</Text>
        </View>

        {/* RTC Clock (PCF85063) */}
        <View style={styles.metricBox}>
          <View style={styles.iconRow}>
            <Ionicons name="time-outline" size={18} color="#38bdf8" />
            <Text style={styles.metricLabel}>RTC (PCF85063)</Text>
          </View>
          <Text style={styles.metricValue}>{telemetry.rtcTime}</Text>
          <TouchableOpacity onPress={onSyncTime} style={styles.syncButton}>
            <Text style={styles.syncButtonText}>Sync Phone Time</Text>
          </TouchableOpacity>
        </View>

        {/* Storage (16MB Flash + SD Card) */}
        <View style={styles.metricBox}>
          <View style={styles.iconRow}>
            <Ionicons name="hardware-chip-outline" size={18} color="#a855f7" />
            <Text style={styles.metricLabel}>Flash & SD</Text>
          </View>
          <Text style={styles.metricValue}>{telemetry.flashTotalMb} MB QSPI</Text>
          <Text style={styles.metricSub}>
            MicroSD: {telemetry.sdCardMounted ? 'Mounted (SDMMC)' : 'Not detected'}
          </Text>
        </View>

        {/* Backlight Control (GPIO 5 PWM) */}
        <View style={styles.metricBox}>
          <View style={styles.iconRow}>
            <Ionicons name="sunny-outline" size={18} color="#f59e0b" />
            <Text style={styles.metricLabel}>Backlight</Text>
          </View>
          <Text style={styles.metricValue}>{telemetry.backlightPercent}%</Text>
          <View style={styles.brightnessButtons}>
            <TouchableOpacity
              style={styles.stepBtn}
              onPress={() => onAdjustBacklight(Math.max(10, telemetry.backlightPercent - 20))}
            >
              <Text style={styles.stepBtnText}>-</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.stepBtn}
              onPress={() => onAdjustBacklight(Math.min(100, telemetry.backlightPercent + 20))}
            >
              <Text style={styles.stepBtnText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  metricBox: {
    backgroundColor: '#0a0f1d',
    borderRadius: 14,
    padding: 12,
    width: '48%',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f8fafc',
    marginTop: 2,
  },
  metricSub: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  syncButton: {
    marginTop: 6,
    backgroundColor: '#1e293b',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  syncButtonText: {
    fontSize: 10,
    color: '#38bdf8',
    fontWeight: '600',
  },
  brightnessButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  stepBtn: {
    backgroundColor: '#1e293b',
    width: 28,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
  },
});
