import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, type ScrollViewInstance } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SessionRecord } from '../types/session';
import { ClinicAppointment, getAppointments } from '../services/appointmentStorage';
import { addDays, dayKey, inWindow, sameDay, startOfDay, startOfWeekMonday } from '../services/days';
import { ChatbotTab } from './ChatbotTab';
import { MindGamesTab } from './MindGamesTab';
import { colors, shadow } from '../theme';
import { firstName } from '../services/profileStorage';

interface Props {
  isPaired: boolean;
  sessions: SessionRecord[];
  displayName: string;
}

type Pane = 'home' | 'chat' | 'games';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function voiceStreak(sessions: SessionRecord[]): number {
  const days = new Set(
    sessions.filter((session) => session.voiceStatus).map((session) => dayKey(new Date(session.timestamp)))
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

function weeksInWindow(today: Date): Date[] {
  const first = startOfWeekMonday(addDays(startOfDay(today), -7));
  const last = addDays(startOfDay(today), 7);
  const starts: Date[] = [];
  for (let start = first; start.getTime() <= last.getTime(); start = addDays(start, 7)) {
    const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
    if (days.some((day) => inWindow(day, today))) starts.push(start);
  }
  return starts;
}

function dashboardVoice(session: SessionRecord): string {
  const features = session.voiceFeatures;
  if (session.voiceStatus === 'unscored') return 'Voice recorded. The model was not running.';
  if (!session.voicePrediction || !session.voiceConfidence) return 'Voice score pending';
  const cut = session.voiceStatus === 'truncated' ? ' Clip cut at 150 seconds.' : '';
  const featureLine = features
    ? `\n${features.duration}s · ${features.pause_count} pauses · speech ${features.speech_rate}/s · pitch ${features.pitch_mean} Hz · ${features.silence_ratio}% silence`
    : '';
  return `${session.voicePrediction} · healthy ${session.voiceConfidence.healthy}% · Alzheimer ${session.voiceConfidence.alzheimer}%.${cut}${featureLine}`;
}

export const DashboardTab: React.FC<Props> = ({ isPaired, sessions, displayName }) => {
  const [pane, setPane] = useState<Pane>('home');
  const [appointments, setAppointments] = useState<ClinicAppointment[]>([]);
  const [selected, setSelected] = useState(() => new Date());
  const [rowWidth, setRowWidth] = useState(0);
  const weekRef = useRef<ScrollViewInstance>(null);
  const didSnap = useRef(false);
  const today = new Date();

  useEffect(() => {
    if (pane !== 'home') return;
    getAppointments().then(setAppointments);
  }, [pane]);

  const nextVisit = appointments[0];
  const streak = voiceStreak(sessions);
  const weekStarts = weeksInWindow(today);
  const daySessions = sessions
    .filter((session) => sameDay(new Date(session.timestamp), selected))
    .sort((a, b) => b.timestamp - a.timestamp);
  const session = daySessions[0];
  const minutes = session ? Math.max(1, Math.round(session.durationSeconds / 60)) : null;

  useEffect(() => {
    if (!rowWidth || didSnap.current) return;
    const index = weekStarts.findIndex((start) => {
      const end = addDays(start, 6);
      const time = startOfDay(selected).getTime();
      return time >= start.getTime() && time <= end.getTime();
    });
    weekRef.current?.scrollTo({ x: Math.max(0, index) * rowWidth, animated: false });
    didSnap.current = true;
  }, [rowWidth, selected, weekStarts]);

  if (pane === 'chat') {
    return (
      <View style={styles.container}>
        <BackBar label="Dashboard" onBack={() => setPane('home')} />
        <ChatbotTab isPaired={isPaired} name={firstName(displayName)} />
      </View>
    );
  }

  if (pane === 'games') {
    return (
      <View style={styles.container}>
        <BackBar label="Dashboard" onBack={() => setPane('home')} />
        <MindGamesTab />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topRow}>
          <View style={styles.topCopy}>
            <Text style={styles.title}>Hello, {firstName(displayName)}.</Text>
            <Text style={styles.subtitle}>
              {isPaired ? 'Device paired' : 'Device unpaired'}
            </Text>
          </View>
          <View style={styles.streakPill} accessibilityLabel={`${streak} day voice streak`}>
            <Ionicons name="mic" size={14} color={colors.white} />
            <Text style={styles.streakCount}>{streak}</Text>
          </View>
        </View>

        <View
          style={styles.weekFrame}
          onLayout={(event) => {
            const width = Math.round(event.nativeEvent.layout.width);
            if (width !== rowWidth) setRowWidth(width);
          }}
        >
          <ScrollView
            ref={weekRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={styles.weekFrame}
            onMomentumScrollEnd={(event) => {
              if (!rowWidth) return;
              const index = Math.round(event.nativeEvent.contentOffset.x / rowWidth);
              const start = weekStarts[index];
              if (!start) return;
              const days = Array.from({ length: 7 }, (_, dayIndex) => addDays(start, dayIndex));
              const match = days.find((day) => day.getDay() === selected.getDay());
              const choice = match && inWindow(match, today) ? match : days.find((day) => inWindow(day, today));
              if (choice && !sameDay(choice, selected)) setSelected(choice);
            }}
          >
            {weekStarts.map((start) => (
              <View key={dayKey(start)} style={[styles.weekRow, { width: rowWidth || '100%' }]}>
                {Array.from({ length: 7 }, (_, index) => addDays(start, index)).map((day, index) => {
                  const open = inWindow(day, today);
                  const active = sameDay(day, selected);
                  const hasSession = sessions.some((item) => sameDay(new Date(item.timestamp), day));
                  return (
                    <TouchableOpacity
                      key={dayKey(day)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active, disabled: !open }}
                      accessibilityLabel={day.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
                      disabled={!open}
                      onPress={() => setSelected(day)}
                      style={[styles.weekDay, active && styles.weekDayOn, !open && styles.weekDayOff]}
                    >
                      <Text style={[styles.weekDow, active && styles.weekDowOn]}>{WEEKDAYS[index]}</Text>
                      <View style={[styles.weekNumWrap, hasSession && !active && styles.weekNumRing]}>
                        <Text style={[styles.weekNum, active && styles.weekNumOn]}>{day.getDate()}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroCopy}>
            {session ? <Text style={styles.heroScore}>{session.score}</Text> : null}
            <Text style={[styles.heroLabel, !session && styles.heroEmpty]}>
              {session ? 'Screening score' : 'No screening this day'}
            </Text>
            {session ? <Text style={styles.heroMeta}>{session.timeStr}</Text> : null}
          </View>
          <View style={styles.ring}>
            <Ionicons name={session?.voiceStatus ? 'mic' : 'mic-outline'} size={22} color={colors.white} />
          </View>
        </View>

        <View style={styles.statRow}>
          <View style={styles.statTile}>
            <Text style={styles.statValue}>{minutes === null ? '—' : `${minutes}m`}</Text>
            <Text style={styles.statLabel}>On the exam</Text>
          </View>
          <View style={styles.statTile}>
            <Text style={styles.statValue}>{session?.voicePrediction || '—'}</Text>
            <Text style={styles.statLabel}>Voice</Text>
          </View>
          <View style={styles.statTile}>
            <Text style={styles.statValue}>{session ? session.timeStr.replace(':00', '') : '—'}</Text>
            <Text style={styles.statLabel}>Recorded</Text>
          </View>
        </View>

        {session?.voiceStatus ? <Text style={styles.voiceLine}>{dashboardVoice(session)}</Text> : null}

        {nextVisit ? (
          <View style={styles.visitCard}>
            <Text style={styles.visitName}>{nextVisit.clinicName}</Text>
            <Text style={styles.heroMeta}>
              {nextVisit.dateLabel} at {nextVisit.timeLabel}
            </Text>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>On this phone</Text>
        <View style={styles.actionRow}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Talk"
            style={styles.actionCard}
            onPress={() => setPane('chat')}
            activeOpacity={0.85}
          >
            <View style={styles.actionIcon}>
              <Ionicons name="chatbubble" size={16} color={colors.white} />
            </View>
            <Text style={styles.actionTitle}>Talk</Text>
            <Text style={styles.actionBody}>Ask about the exam</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Mind games"
            style={styles.actionCard}
            onPress={() => setPane('games')}
            activeOpacity={0.85}
          >
            <View style={styles.actionIcon}>
              <Ionicons name="extension-puzzle" size={16} color={colors.white} />
            </View>
            <Text style={styles.actionTitle}>Mind games</Text>
            <Text style={styles.actionBody}>Short drills</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

const BackBar: React.FC<{ label: string; onBack: () => void }> = ({ label, onBack }) => (
  <TouchableOpacity
    accessibilityRole="button"
    accessibilityLabel={`Back to ${label}`}
    onPress={onBack}
    style={styles.back}
    activeOpacity={0.85}
  >
    <Ionicons name="chevron-back" size={18} color={colors.ink} />
    <Text style={styles.backText}>{label}</Text>
  </TouchableOpacity>
);

const card = {
  backgroundColor: colors.white,
  borderWidth: 3,
  borderColor: colors.ink,
  borderRadius: 18,
  ...shadow.hard,
} as const;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
    backgroundColor: colors.paper,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 28,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  topCopy: {
    flex: 1,
    paddingRight: 12,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.ink,
    letterSpacing: -0.7,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: '700',
    color: colors.muted,
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    ...shadow.hard,
  },
  streakCount: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.white,
  },
  weekFrame: {
    overflow: 'hidden',
    marginBottom: 8,
  },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  weekDay: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 18,
  },
  weekDayOn: {
    backgroundColor: colors.accent,
    borderWidth: 3,
    borderColor: colors.ink,
  },
  weekDayOff: {
    opacity: 0.35,
  },
  weekDow: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.muted,
  },
  weekDowOn: {
    color: colors.white,
    fontWeight: '800',
  },
  weekNumWrap: {
    marginTop: 4,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekNumRing: {
    borderWidth: 3,
    borderColor: colors.ink,
    backgroundColor: colors.white,
  },
  weekNum: {
    fontSize: 14,
    lineHeight: 16,
    fontWeight: '900',
    color: colors.ink,
    textAlign: 'center',
  },
  weekNumOn: {
    color: colors.white,
    fontWeight: '900',
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 18,
    marginTop: 14,
    marginBottom: 12,
    ...card,
  },
  heroCopy: {
    flex: 1,
  },
  heroScore: {
    fontSize: 56,
    lineHeight: 60,
    fontWeight: '900',
    color: colors.ink,
    letterSpacing: -1.5,
  },
  heroLabel: {
    marginTop: 2,
    fontSize: 15,
    fontWeight: '800',
    color: colors.muted,
  },
  heroEmpty: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.ink,
  },
  heroMeta: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
  },
  ring: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 3,
    borderColor: colors.ink,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.hard,
  },
  statRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statTile: {
    flex: 1,
    minHeight: 96,
    padding: 12,
    ...card,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.ink,
  },
  statLabel: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '800',
    color: colors.muted,
  },
  voiceLine: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '800',
    color: colors.ink,
    lineHeight: 20,
  },
  visitCard: {
    marginTop: 12,
    padding: 16,
    ...card,
  },
  visitName: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.ink,
  },
  sectionTitle: {
    marginTop: 22,
    marginBottom: 10,
    fontSize: 20,
    fontWeight: '900',
    color: colors.ink,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionCard: {
    flex: 1,
    padding: 14,
    minHeight: 118,
    ...card,
  },
  actionIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: colors.ink,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTitle: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: '900',
    color: colors.ink,
  },
  actionBody: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  backText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.ink,
  },
});
