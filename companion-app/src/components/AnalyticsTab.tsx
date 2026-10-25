import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { SessionRecord, SyncState } from '../types/session';
import { calculateSummaryStats } from '../services/sessionStorage';
import { SessionCard } from './SessionCard';
import { Ionicons } from '@expo/vector-icons';
import { FolderCard } from './FolderCard';
import { colors, shadow } from '../theme';
import { addDays, dayKey, startOfDay } from '../services/days';

interface Props {
  sessions: SessionRecord[];
  syncState: SyncState;
  onSync: () => void;
}

const BADGES = [
  { id: 'first', label: 'First screening', need: 'Finish one exam' },
  { id: 'five', label: 'Five screenings', need: 'Finish five exams' },
  { id: 'voice', label: 'Voice recorded', need: 'Record a voice exam' },
  { id: 'streak3', label: '3-day voice streak', need: 'Record your voice 3 days in a row' },
  { id: 'streak7', label: '7-day voice streak', need: 'Record your voice 7 days in a row' },
];

function voiceStreak(sessions: SessionRecord[]): number {
  const days = new Set(
    sessions
      .filter((session) => session.voiceStatus)
      .map((session) => dayKey(new Date(session.timestamp)))
  );
  let cursor = startOfDay(new Date());
  if (!days.has(dayKey(cursor))) {
    cursor = addDays(cursor, -1);
    if (!days.has(dayKey(cursor))) return 0;
  }
  let count = 0;
  while (days.has(dayKey(cursor))) {
    count += 1;
    cursor = addDays(cursor, -1);
  }
  return count;
}

function earnedBadge(id: string, sessions: SessionRecord[], streak: number): boolean {
  const finished = sessions.filter((session) => session.completionStatus === 'completed').length;
  if (id === 'first') return finished >= 1;
  if (id === 'five') return finished >= 5;
  if (id === 'voice') return sessions.some((session) => Boolean(session.voiceStatus));
  if (id === 'streak3') return streak >= 3;
  if (id === 'streak7') return streak >= 7;
  return false;
}

function scoreDomain(scores: number[]): { min: number; max: number } {
  const low = Math.min(...scores);
  const high = Math.max(...scores);
  let min = Math.max(0, Math.floor((low - 8) / 5) * 5);
  let max = Math.min(100, Math.ceil((high + 8) / 5) * 5);
  if (max - min < 20) {
    const mid = (low + high) / 2;
    min = Math.max(0, Math.floor((mid - 10) / 5) * 5);
    max = Math.min(100, min + 20);
    if (max > 100) {
      max = 100;
      min = 80;
    }
  }
  if (min >= max) {
    min = Math.max(0, max - 20);
  }
  return { min, max };
}

function axisTicks(min: number, max: number): number[] {
  const step = max - min <= 20 ? 5 : 10;
  const ticks: number[] = [];
  for (let value = min; value <= max; value += step) ticks.push(value);
  if (ticks[ticks.length - 1] !== max) ticks.push(max);
  return ticks;
}

function smoothLine(points: { x: number; y: number }[]): string {
  if (points.length < 2) return '';
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] ?? points[index];
    const current = points[index];
    const next = points[index + 1];
    const after = points[index + 2] ?? next;
    const control1x = current.x + (next.x - previous.x) / 6;
    const control1y = current.y + (next.y - previous.y) / 6;
    const control2x = next.x - (after.x - current.x) / 6;
    const control2y = next.y - (after.y - current.y) / 6;
    path += ` C ${control1x} ${control1y}, ${control2x} ${control2y}, ${next.x} ${next.y}`;
  }
  return path;
}

function dateLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function ScoreLine({ sessions }: { sessions: SessionRecord[] }) {
  const [width, setWidth] = useState(0);
  const points = [...sessions].sort((a, b) => a.timestamp - b.timestamp);
  const height = 188;
  const padLeft = 34;
  const padRight = 12;
  const padTop = 14;
  const padBottom = 28;

  if (points.length === 0) {
    return <Text style={styles.emptyDesc}>A finished screening will draw the line.</Text>;
  }

  const domain = scoreDomain(points.map((session) => session.score));
  const ticks = axisTicks(domain.min, domain.max);
  const first = points[0].timestamp;
  const last = points[points.length - 1].timestamp;
  const span = Math.max(last - first, 1);
  const start = first - span * 0.08;
  const end = last + span * 0.08;
  const plotWidth = Math.max(width - padLeft - padRight, 1);
  const plotHeight = height - padTop - padBottom;

  const placed = points.map((session) => {
    const x = padLeft + ((session.timestamp - start) / (end - start)) * plotWidth;
    const y = padTop + (1 - (session.score - domain.min) / (domain.max - domain.min)) * plotHeight;
    return { session, x, y };
  });

  const labelIndexes = placed
    .map((point, index) => ({ index, x: point.x }))
    .filter((item, index, all) => {
      if (index === 0 || index === all.length - 1) return true;
      const previous = all[index - 1];
      return item.x - previous.x > 56;
    })
    .map((item) => item.index);

  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          {ticks.map((tick) => {
            const y = padTop + (1 - (tick - domain.min) / (domain.max - domain.min)) * plotHeight;
            return (
              <React.Fragment key={tick}>
                <Line
                  x1={padLeft}
                  x2={width - padRight}
                  y1={y}
                  y2={y}
                  stroke={colors.ink}
                  strokeOpacity={0.16}
                  strokeDasharray="4 5"
                  strokeWidth={1}
                />
                <SvgText
                  x={padLeft - 6}
                  y={y + 3}
                  fill={colors.muted}
                  fontSize={10}
                  fontWeight="700"
                  textAnchor="end"
                >
                  {tick}
                </SvgText>
              </React.Fragment>
            );
          })}
          {placed.length > 1 ? (
            <Path
              d={smoothLine(placed)}
              stroke={colors.ink}
              strokeWidth={3}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
          {placed.map((point, index) => {
            const newest = index === placed.length - 1;
            return (
              <Circle
                key={point.session.id}
                cx={point.x}
                cy={point.y}
                r={5}
                fill={newest ? colors.accent : colors.white}
                stroke={colors.ink}
                strokeWidth={3}
              />
            );
          })}
          {placed.map((point, index) =>
            labelIndexes.includes(index) ? (
              <SvgText
                key={`${point.session.id}-label`}
                x={point.x}
                y={height - 6}
                fill={colors.muted}
                fontSize={10}
                fontWeight="700"
                textAnchor="middle"
              >
                {dateLabel(point.session.timestamp)}
              </SvgText>
            ) : null
          )}
        </Svg>
      ) : (
        <View style={{ height }} />
      )}
    </View>
  );
}

export const AnalyticsTab: React.FC<Props> = ({ sessions, syncState, onSync }) => {
  const stats = calculateSummaryStats(sessions);
  const streak = voiceStreak(sessions);
  const ordered = [...sessions].sort((a, b) => a.timestamp - b.timestamp);
  const latest = ordered[ordered.length - 1];
  const spanLabel =
    ordered.length === 0
      ? ''
      : ordered.length === 1
        ? dateLabel(ordered[0].timestamp)
        : `${dateLabel(ordered[0].timestamp)} – ${dateLabel(latest.timestamp)}`;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Progress.</Text>
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
        <FolderCard>
          <View style={styles.streakCard}>
            <Text style={styles.streakValue}>{streak}</Text>
            <Text style={styles.streakLabel}>
              {streak === 1 ? 'day of voice recordings in a row' : 'days of voice recordings in a row'}
            </Text>
          </View>
        </FolderCard>

        <View style={styles.badgeRow}>
          {BADGES.map((badge) => {
            const earned = earnedBadge(badge.id, sessions, streak);
            return (
              <View key={badge.id} style={[styles.badge, earned && styles.badgeOn]}>
                <Ionicons
                  name={earned ? 'ribbon' : 'ribbon-outline'}
                  size={16}
                  color={earned ? colors.white : colors.ink}
                />
                <Text style={[styles.badgeLabel, earned && styles.badgeLabelOn]}>{badge.label}</Text>
                <Text style={[styles.badgeNeed, earned && styles.badgeNeedOn]}>
                  {earned ? 'Earned' : badge.need}
                </Text>
              </View>
            );
          })}
        </View>

        <FolderCard>
          <View style={styles.graphCard}>
            <View style={styles.graphHead}>
              <View style={styles.graphTitles}>
                <Text style={styles.sectionTitle}>Scores over time</Text>
                {spanLabel ? <Text style={styles.graphSpan}>{spanLabel}</Text> : null}
              </View>
              {latest ? (
                <View style={styles.graphPill}>
                  <Text style={styles.graphPillText}>{latest.score} latest</Text>
                </View>
              ) : null}
            </View>
            <ScoreLine sessions={sessions} />
          </View>
        </FolderCard>

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
              Open Screening and complete a session on the ESP32 device to see your progress.
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
  streakCard: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
  },
  streakValue: {
    fontSize: 42,
    fontWeight: '900',
    color: colors.ink,
    letterSpacing: -1,
  },
  streakLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    color: colors.ink,
    lineHeight: 18,
  },
  badgeRow: {
    gap: 8,
    marginBottom: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 14,
    backgroundColor: colors.white,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  badgeOn: {
    backgroundColor: colors.accent,
  },
  badgeLabel: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.ink,
  },
  badgeLabelOn: {
    color: colors.white,
  },
  badgeNeed: {
    marginLeft: 'auto',
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    maxWidth: 140,
    textAlign: 'right',
  },
  badgeNeedOn: {
    color: colors.white,
  },
  graphCard: {
    padding: 14,
    paddingBottom: 8,
  },
  graphHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 4,
  },
  graphTitles: {
    flex: 1,
    gap: 2,
  },
  graphSpan: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
  },
  graphPill: {
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 999,
    backgroundColor: colors.accentSoft,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  graphPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.ink,
  },
});
