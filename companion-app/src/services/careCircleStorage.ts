import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@care_circle_v1';

export type CareRole = 'Family' | 'Caregiver';

export interface CareCircleMember {
  id: string;
  name: string;
  role: CareRole;
}

export async function getCareCircle(): Promise<CareCircleMember[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function addCareCircleMember(
  member: Omit<CareCircleMember, 'id'>
): Promise<CareCircleMember[]> {
  const next: CareCircleMember = {
    ...member,
    name: member.name.trim(),
    id: `cc-${Date.now()}`,
  };
  const current = await getCareCircle();
  const updated = [next, ...current];
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

export async function removeCareCircleMember(id: string): Promise<CareCircleMember[]> {
  const current = await getCareCircle();
  const updated = current.filter((member) => member.id !== id);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}
