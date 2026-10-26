import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LabTab } from './LabTab';
import { AnalyticsTab } from './AnalyticsTab';
import { SessionRecord, SyncState } from '../types/session';
import { DEFAULT_PROFILE, UserProfile } from '../services/profileStorage';
import { colors, shadow } from '../theme';

interface Props {
  isPaired: boolean;
  onPairSuccess: () => void;
  onResetPairing: () => void;
  sessions: SessionRecord[];
  syncState: SyncState;
  onSync: () => void;
  profile?: UserProfile;
  onOpenSettings?: () => void;
}

export const ScreenTab: React.FC<Props> = ({
  isPaired,
  onPairSuccess,
  onResetPairing,
  sessions,
  syncState,
  onSync,
  profile = DEFAULT_PROFILE,
  onOpenSettings,
}) => {
  const [mode, setMode] = useState<'screening' | 'analytics'>('screening');

  const segment = (key: 'screening' | 'analytics', label: string) => {
    const active = mode === key;
    return (
      <TouchableOpacity
        key={key}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        onPress={() => setMode(key)}
        style={[styles.segment, active && styles.segmentOn]}
        activeOpacity={0.85}
      >
        <Text style={[styles.segmentText, active && styles.segmentTextOn]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.switchRow}>
        {segment('screening', 'Screening')}
        {segment('analytics', 'Progress')}
      </View>
      <View style={styles.panel}>
        {mode === 'screening' ? (
          <LabTab
            isPaired={isPaired}
            onPairSuccess={onPairSuccess}
            onResetPairing={onResetPairing}
            onOpenSettings={onOpenSettings}
            onOpenProgress={() => setMode('analytics')}
          />
        ) : (
          <AnalyticsTab sessions={sessions} syncState={syncState} onSync={onSync} profile={profile} />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  switchRow: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 18,
    marginTop: 14,
    marginBottom: 4,
    padding: 4,
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 16,
    backgroundColor: colors.white,
    ...shadow.hard,
  },
  segment: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  segmentOn: {
    backgroundColor: colors.accent,
    borderColor: colors.ink,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.ink,
  },
  segmentTextOn: {
    color: colors.white,
  },
  panel: {
    flex: 1,
  },
});
