import React from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { SessionRecord, SyncState } from '../types/session';
import { calculateSummaryStats } from '../services/sessionStorage';
import { SessionCard } from './SessionCard';
import { Ionicons } from '@expo/vector-icons';
import { FolderCard } from './FolderCard';
import { colors, shadow } from '../theme';

interface Props {
  sessions: SessionRecord[];
  syncState: SyncState;
  onSync: () => void;
}

export const AnalyticsTab: React.FC<Props> = ({ sessions, syncState, onSync }) => {
  const stats = calculateSummaryStats(sessions);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>See now.{'\n'}Review anytime.</Text>
        </View>

        <View style={styles.syncStatusBadge}>
          <Ionicons name="shield-checkmark-outline" size={14} color={colors.white} />
          <Text style={styles.syncStatusText}>CLOUD</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={syncState === 'syncing'}
            onRefresh={onSync}
            tintColor="#7A6B8A"
          />
        }
      >
        <View style={styles.kpiGrid}>
          <FolderCard style={styles.kpiCard}>
            <View style={styles.kpiBox}>
              <View style={styles.kpiIcon}>
                <Ionicons name="albums-outline" size={18} color={colors.white} />
              </View>
              <Text style={styles.kpiVal}>{stats.totalSessions}</Text>
              <Text style={styles.kpiLabel}>Sessions</Text>
            </View>
          </FolderCard>
          <FolderCard style={styles.kpiCard}>
            <View style={styles.kpiBox}>
              <View style={styles.kpiIcon}>
                <Ionicons name="pulse-outline" size={18} color={colors.white} />
              </View>
              <Text style={styles.kpiVal}>{stats.avgScore}%</Text>
              <Text style={styles.kpiLabel}>Adherence</Text>
            </View>
          </FolderCard>
          <FolderCard style={styles.kpiCard}>
            <View style={styles.kpiBox}>
              <View style={styles.kpiIcon}>
                <Ionicons name="time-outline" size={18} color={colors.white} />
              </View>
              <Text style={styles.kpiVal}>{stats.totalMinutes}m</Text>
              <Text style={styles.kpiLabel}>Total time</Text>
            </View>
          </FolderCard>
          <FolderCard style={styles.kpiCard}>
            <View style={styles.kpiBox}>
              <View style={styles.kpiIcon}>
                <Ionicons name="checkmark-outline" size={18} color={colors.white} />
              </View>
              <Text style={styles.kpiVal}>{stats.completionRate}%</Text>
              <Text style={styles.kpiLabel}>Completion</Text>
            </View>
          </FolderCard>
        </View>

        {/* Section Header */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>My sessions</Text>
          <Text style={styles.sectionHint}>Tap a card</Text>
        </View>

        {sessions.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No Recorded Sessions</Text>
            <Text style={styles.emptyDesc}>
              Pair in the Lab tab and complete a session on the ESP32 device to view analytics.
            </Text>
          </View>
        ) : (
          sessions.map((sess) => <SessionCard key={sess.id} session={sess} />)
        )}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingBottom: 12,
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
  syncStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 3,
    borderColor: colors.ink,
    backgroundColor: colors.accent,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    ...shadow.hard,
  },
  syncStatusText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '800',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  kpiCard: {
    width: '48%',
    marginBottom: 8,
  },
  kpiBox: {
    padding: 14,
    alignItems: 'flex-start',
    justifyContent: 'center',
    minHeight: 118,
  },
  kpiIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.accent,
    borderWidth: 3,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  kpiVal: {
    fontSize: 26,
    fontWeight: '900',
    color: colors.ink,
  },
  kpiLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.ink,
    marginTop: 2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
  },
  sectionHint: {
    fontSize: 10,
    color: colors.muted,
  },
  emptyCard: {
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 18,
    backgroundColor: colors.white,
    padding: 24,
    alignItems: 'center',
    marginVertical: 12,
    ...shadow.hard,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
  },
  emptyDesc: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
});
