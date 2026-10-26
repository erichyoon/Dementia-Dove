import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@recall_profile_v1';

export type ReminderTime = 'Morning' | 'Afternoon' | 'Evening';

export interface UserProfile {
  name: string;
  phone: string;
  birthday: string;
  emergencyName: string;
  doctorName: string;
  doctorEmail: string;
  doctorClinic: string;
  weeklyGoal: number;
  goalTime: string;
  reminderDays: string[];
  reminderTime: ReminderTime;
  remindIfBehind: boolean;
}

export const DEFAULT_PROFILE: UserProfile = {
  name: 'Omar Firdaus',
  phone: '',
  birthday: '',
  emergencyName: '',
  doctorName: '',
  doctorEmail: '',
  doctorClinic: '',
  weeklyGoal: 3,
  goalTime: '08:00',
  reminderDays: ['Mon', 'Wed', 'Fri'],
  reminderTime: 'Morning',
  remindIfBehind: true,
};

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function firstName(name: string): string {
  const part = name.trim().split(/\s+/)[0];
  return part || 'there';
}

export function formatGoalTime(value: string): string {
  const [hourRaw, minuteRaw] = (value || '08:00').split(':');
  let hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return '8:00 AM';
  const suffix = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${String(minute).padStart(2, '0')} ${suffix}`;
}

export function shiftGoalTime(value: string, deltaMinutes: number): string {
  const [hourRaw, minuteRaw] = (value || '08:00').split(':');
  let total = (Number(hourRaw) || 0) * 60 + (Number(minuteRaw) || 0) + deltaMinutes;
  const day = 24 * 60;
  total = ((total % day) + day) % day;
  const hour = Math.floor(total / 60);
  const minute = total % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || '');
  return letters.join('') || 'P';
}

export async function getProfile(): Promise<UserProfile> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PROFILE;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_PROFILE, ...parsed };
  } catch {
    return DEFAULT_PROFILE;
  }
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}
