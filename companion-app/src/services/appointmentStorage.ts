import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@clinic_appointments_v1';

export interface ClinicAppointment {
  id: string;
  clinicId: string;
  clinicName: string;
  clinicAddress: string;
  dateLabel: string;
  timeLabel: string;
  createdAt: number;
}

export async function getAppointments(): Promise<ClinicAppointment[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveAppointment(
  appointment: Omit<ClinicAppointment, 'id' | 'createdAt'>
): Promise<ClinicAppointment> {
  const next: ClinicAppointment = {
    ...appointment,
    id: `apt-${Date.now()}`,
    createdAt: Date.now(),
  };
  const current = await getAppointments();
  const withoutSameClinic = current.filter((item) => item.clinicId !== appointment.clinicId);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([next, ...withoutSameClinic]));
  return next;
}
