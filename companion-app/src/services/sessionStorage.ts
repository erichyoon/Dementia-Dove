import AsyncStorage from '@react-native-async-storage/async-storage';
import { SessionRecord, PatientSummaryStats } from '../types/session';

const STORAGE_KEY = '@patient_device_sessions_v1';
const LAST_SYNC_KEY = '@patient_device_last_sync_v1';

// Starter sessions so the patient portal is immediately viewable and useful offline
const INITIAL_STARTER_SESSIONS: SessionRecord[] = [
  {
    id: 'sess-101',
    timestamp: Date.now() - 86400000 * 2, // 2 days ago
    dateStr: 'Oct 14, 2026',
    timeStr: '10:30 AM',
    durationSeconds: 600, // 10 mins
    completionStatus: 'completed',
    score: 92,
    buttonPresses: 24,
    touchInteractions: 38,
    avgReactionTimeMs: 420,
    patientFeedback: 'Excellent focus. Physical button responsiveness was quick and consistent throughout the 10-minute session.',
    timeline: [
      { minute: 1, activityLevel: 70 },
      { minute: 3, activityLevel: 85 },
      { minute: 5, activityLevel: 95 },
      { minute: 7, activityLevel: 90 },
      { minute: 10, activityLevel: 92 },
    ],
  },
  {
    id: 'sess-102',
    timestamp: Date.now() - 86400000, // Yesterday
    dateStr: 'Yesterday',
    timeStr: '02:15 PM',
    durationSeconds: 720, // 12 mins
    completionStatus: 'completed',
    score: 96,
    buttonPresses: 31,
    touchInteractions: 45,
    avgReactionTimeMs: 380,
    patientFeedback: 'Outstanding session! Your reaction time improved by 40ms compared to previous records.',
    timeline: [
      { minute: 2, activityLevel: 80 },
      { minute: 4, activityLevel: 90 },
      { minute: 6, activityLevel: 98 },
      { minute: 9, activityLevel: 94 },
      { minute: 12, activityLevel: 96 },
    ],
  },
];

export async function getStoredSessions(): Promise<SessionRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // First run: save and return starter sample
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_STARTER_SESSIONS));
      return INITIAL_STARTER_SESSIONS;
    }
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error loading stored sessions:', err);
    return INITIAL_STARTER_SESSIONS;
  }
}

export async function replaceStoredSessions(sessions: SessionRecord[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  await AsyncStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
}

export async function storeNewSession(session: SessionRecord): Promise<SessionRecord[]> {
  try {
    const current = await getStoredSessions();
    // Prepend newest session
    const updated = [session, ...current.filter((s) => s.id !== session.id)];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    await AsyncStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
    return updated;
  } catch (err) {
    console.error('Error saving session:', err);
    return [];
  }
}

export async function getLastSyncTimestamp(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LAST_SYNC_KEY);
  } catch {
    return null;
  }
}

export async function clearAllStoredSessions(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
    await AsyncStorage.removeItem(LAST_SYNC_KEY);
  } catch (err) {
    console.error('Error clearing sessions:', err);
  }
}

export function calculateSummaryStats(sessions: SessionRecord[]): PatientSummaryStats {
  if (sessions.length === 0) {
    return { totalSessions: 0, avgScore: 0, totalMinutes: 0, completionRate: 100 };
  }

  const totalSessions = sessions.length;
  const totalScore = sessions.reduce((acc, s) => acc + s.score, 0);
  const totalSeconds = sessions.reduce((acc, s) => acc + s.durationSeconds, 0);
  const completedCount = sessions.filter((s) => s.completionStatus === 'completed').length;

  return {
    totalSessions,
    avgScore: Math.round(totalScore / totalSessions),
    totalMinutes: Math.round(totalSeconds / 60),
    completionRate: Math.round((completedCount / totalSessions) * 100),
  };
}
