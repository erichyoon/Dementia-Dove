import AsyncStorage from '@react-native-async-storage/async-storage';
import { cloudHosts } from './cloudSessions';
import { getProfile } from './profileStorage';

const CACHE_KEY = '@recall_support_groups_v1';
const MEMBER_KEY = '@recall_member_v1';
const CLOUD_PORT = 3847;

export interface GroupMember {
  id: string;
  name: string;
}

export interface SupportGroup {
  id: string;
  name: string;
  note: string;
  createdAt: number;
  createdBy?: string;
  mark?: string;
  image?: string;
  members: GroupMember[];
  pending?: boolean;
}

export function groupCreatorId(group: SupportGroup): string | undefined {
  return group.createdBy || group.members[0]?.id;
}

async function readCache(): Promise<SupportGroup[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeCache(groups: SupportGroup[]): Promise<void> {
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(groups));
}

export async function getLocalMember(): Promise<GroupMember> {
  let id = await AsyncStorage.getItem(MEMBER_KEY);
  if (!id) {
    id = `mem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    await AsyncStorage.setItem(MEMBER_KEY, id);
  }
  const profile = await getProfile();
  return { id, name: profile.name || 'Member' };
}

async function postGroups(body: Record<string, string>): Promise<SupportGroup[] | null> {
  const payload = JSON.stringify(body);
  for (const host of cloudHosts()) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);
    try {
      const response = await fetch(`http://${host}:${CLOUD_PORT}/cloud/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: payload,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!response.ok) continue;
      const data = await response.json();
      if (!Array.isArray(data.groups)) continue;
      return data.groups;
    } catch {
      clearTimeout(timeoutId);
    }
  }
  return null;
}

export async function fetchSupportGroups(): Promise<SupportGroup[] | null> {
  for (const host of cloudHosts()) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);
    try {
      const response = await fetch(`http://${host}:${CLOUD_PORT}/cloud/groups`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!response.ok) continue;
      const data = await response.json();
      if (!Array.isArray(data.groups)) continue;
      return data.groups;
    } catch {
      clearTimeout(timeoutId);
    }
  }
  return null;
}

export async function loadSupportGroups(): Promise<{ groups: SupportGroup[]; shared: boolean }> {
  const local = await readCache();
  const remote = await fetchSupportGroups();
  if (!remote) return { groups: local, shared: false };

  let groups = remote;
  const pending = local.filter((group) => group.pending);
  for (const group of pending) {
    const creator =
      group.members.find((person) => person.id === groupCreatorId(group)) || group.members[0];
    const saved = await postGroups({
      action: 'create',
      name: group.name,
      note: group.note,
      mark: group.mark || '',
      image: group.image || '',
      memberId: creator?.id || '',
      memberName: creator?.name || 'Member',
    });
    if (saved) groups = saved;
  }
  await writeCache(groups);
  return { groups, shared: true };
}

export async function createSupportGroup(
  name: string,
  description: string,
  mark: string,
  image: string
): Promise<SupportGroup[]> {
  const member = await getLocalMember();
  const saved = await postGroups({
    action: 'create',
    name,
    note: description,
    mark,
    image,
    memberId: member.id,
    memberName: member.name,
  });
  if (saved) {
    await writeCache(saved);
    return saved;
  }
  const local = await readCache();
  const next = [
    ...local,
    {
      id: `local-${Date.now()}`,
      name,
      note: description,
      mark,
      image: image || undefined,
      createdAt: Date.now(),
      createdBy: member.id,
      members: [member],
      pending: true,
    },
  ];
  await writeCache(next);
  return next;
}

export async function setGroupMembership(group: SupportGroup, join: boolean): Promise<SupportGroup[]> {
  const member = await getLocalMember();
  if (group.pending) {
    const local = await readCache();
    const next = local.map((item) => {
      if (item.id !== group.id) return item;
      const members = item.members.filter((person) => person.id !== member.id);
      return { ...item, members: join ? [...members, member] : members };
    });
    await writeCache(next);
    return next;
  }
  const saved = await postGroups({
    action: join ? 'join' : 'leave',
    groupId: group.id,
    memberId: member.id,
    memberName: member.name,
  });
  if (saved) {
    await writeCache(saved);
    return saved;
  }
  return readCache();
}

export async function removeSupportGroup(group: SupportGroup): Promise<SupportGroup[]> {
  const member = await getLocalMember();
  if (groupCreatorId(group) !== member.id) return readCache();

  if (group.pending) {
    const next = (await readCache()).filter((item) => item.id !== group.id);
    await writeCache(next);
    return next;
  }

  const saved = await postGroups({
    action: 'delete',
    groupId: group.id,
    memberId: member.id,
    memberName: member.name,
  });
  if (saved) {
    await writeCache(saved);
    return saved;
  }
  return readCache();
}
