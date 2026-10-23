import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FolderCard } from './FolderCard';
import { colors, shadow } from '../theme';

interface Props {
  isPaired: boolean;
  onClearData: () => void;
  onSync: () => void;
  onResetPairing: () => void;
}

export const AccountTab: React.FC<Props> = ({
  isPaired,
  onClearData,
  onSync,
  onResetPairing,
}) => {
  const confirmClear = () => {
    Alert.alert(
      'Reset Data',
      'Are you sure you want to delete all offline session history?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: onClearData },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Your profile.{'\n'}Find anytime.</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <FolderCard>
          <View style={styles.profileCard}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>OF</Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.patientName}>Omar Firdaus</Text>
              <Text style={styles.patientId}>Patient #PT-8F24</Text>
              <View style={styles.statusPill}>
                <View style={[styles.statusDot, isPaired && styles.statusDotActive]} />
                <Text style={styles.statusText}>
                  {isPaired ? 'Device paired' : 'Unpaired · scan in Lab'}
                </Text>
              </View>
            </View>
          </View>
        </FolderCard>

        <FolderCard>
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeader}>Registered hardware</Text>

          <View style={styles.row}>
            <Text style={styles.rowLabel}>Device Model</Text>
            <Text style={styles.rowVal}>ESP32-S3-Touch-LCD-1.85C</Text>
          </View>
          <View style={styles.divider} />

          <View style={styles.row}>
            <Text style={styles.rowLabel}>Display</Text>
            <Text style={styles.rowVal}>1.85" Round 360×360 QSPI</Text>
          </View>
          <View style={styles.divider} />

          <View style={styles.row}>
            <Text style={styles.rowLabel}>Optical ID Code</Text>
            <Text style={styles.rowVal}>8F24 (3D Particle Cloud)</Text>
          </View>
          <View style={styles.divider} />

          <View style={styles.row}>
            <Text style={styles.rowLabel}>Input Triggers</Text>
            <Text style={styles.rowVal}>Physical Top Button (GPIO 0) + Touch</Text>
          </View>
        </View>
        </FolderCard>

        <FolderCard>
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeader}>Controls & sync</Text>

          <TouchableOpacity style={styles.actionRow} onPress={onSync}>
            <Ionicons name="refresh-outline" size={18} color={colors.ink} />
            <Text style={styles.actionRowText}>Sync session data</Text>
          </TouchableOpacity>

          {isPaired && (
            <>
              <View style={styles.divider} />
              <TouchableOpacity style={styles.actionRow} onPress={onResetPairing}>
                <Ionicons name="unlink-outline" size={18} color={colors.ink} />
                <Text style={styles.actionRowText}>Disconnect optical pairing</Text>
              </TouchableOpacity>
            </>
          )}

          <View style={styles.divider} />
          <TouchableOpacity style={styles.actionRow} onPress={confirmClear}>
            <Ionicons name="trash-outline" size={18} color={colors.muted} />
            <Text style={[styles.actionRowText, { color: colors.muted }]}>
              Clear offline history
            </Text>
          </TouchableOpacity>
        </View>
        </FolderCard>

        <View style={styles.footerBox}>
          <Text style={styles.versionText}>Care system · muted purple</Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
    paddingTop: 18,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  title: {
    fontSize: 30,
    fontWeight: '900',
    color: colors.ink,
    letterSpacing: -0.6,
    lineHeight: 34,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    marginTop: 2,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
  },
  avatarCircle: {
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: colors.accent,
    borderWidth: 3,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.white,
  },
  profileInfo: {
    flex: 1,
  },
  patientName: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.ink,
  },
  patientId: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    marginTop: 2,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.muted,
  },
  statusDotActive: {
    backgroundColor: colors.accent,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.ink,
  },
  sectionCard: {
    padding: 16,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.ink,
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  rowLabel: {
    fontSize: 12,
    color: colors.muted,
    flex: 1,
  },
  rowVal: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.ink,
    flex: 1,
    textAlign: 'right',
  },
  divider: {
    height: 2,
    backgroundColor: colors.ink,
    opacity: 0.12,
    marginVertical: 10,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  actionRowText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '700',
  },
  footerBox: {
    alignItems: 'center',
    marginTop: 16,
  },
  versionText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
  },
});
