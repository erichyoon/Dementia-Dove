import { NativeModules } from 'react-native';
import { SessionRecord } from '../types/session';
import { getStoredSessions, replaceStoredSessions, storeNewSession } from './sessionStorage';

const CLOUD_PORT = 3847;

function addHost(hosts: Set<string>, raw?: string | null) {
  if (!raw) return;
  const host = raw.replace(/^https?:\/\//, '').split('/')[0].split(':')[0].trim();
  if (host) hosts.add(host);
}

export function cloudHosts(): string[] {
  const hosts = new Set<string>(['127.0.0.1', 'localhost']);
  try {
    if (typeof window !== 'undefined' && window.location?.hostname) {
      addHost(hosts, window.location.hostname);
    }
  } catch {
    /* ignore */
  }
  try {
    addHost(hosts, NativeModules?.SourceCode?.scriptURL);
  } catch {
    /* ignore */
  }
  return Array.from(hosts);
}

function normalizeSession(data: any): SessionRecord {
  const ts = Number(data.timestamp) || Date.now();
  const timestamp = ts < 1e12 ? Date.now() : ts;
  const when = new Date(timestamp);
  return {
    id: data.id || `ts-${timestamp}`,
    timestamp,
    dateStr: data.dateStr && data.dateStr !== 'Today' ? data.dateStr : when.toLocaleDateString([], { month: 'short', day: 'numeric' }),
    timeStr: data.timeStr && data.timeStr !== 'Live' ? data.timeStr : when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    durationSeconds: data.durationSeconds || 1,
    completionStatus: data.completionStatus || 'completed',
    score: data.score || 0,
    buttonPresses: data.buttonPresses || 0,
    touchInteractions: data.touchInteractions || 0,
    avgReactionTimeMs: data.avgReactionTimeMs || 0,
    patientFeedback: data.patientFeedback || 'RECALL speech exam uploaded from hardware.',
    timeline: data.timeline || [],
  };
}

async function tryFetch(url: string, init?: RequestInit): Promise<Response | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

export async function fetchCloudSessions(): Promise<SessionRecord[]> {
  for (const host of cloudHosts()) {
    const response = await tryFetch(`http://${host}:${CLOUD_PORT}/cloud/sessions`, {
      headers: { Accept: 'application/json' },
    });
    if (!response?.ok) continue;
    const data = await response.json();
    const list = Array.isArray(data.sessions) ? data.sessions : Array.isArray(data) ? data : [];
    return list.map(normalizeSession);
  }
  return [];
}

export async function uploadSessionToCloud(session: SessionRecord): Promise<boolean> {
  const body = JSON.stringify(session);
  for (const host of cloudHosts()) {
    const response = await tryFetch(`http://${host}:${CLOUD_PORT}/cloud/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body,
    });
    if (response?.ok) return true;
  }
  return false;
}

export async function ingestDeviceSession(raw: any): Promise<SessionRecord> {
  const session = normalizeSession(raw);
  await storeNewSession(session);
  await uploadSessionToCloud(session);
  return session;
}

export async function refreshSessionsFromCloud(): Promise<SessionRecord[]> {
  const cloud = await fetchCloudSessions();
  let local = await getStoredSessions();
  for (const session of [...cloud].reverse()) {
    local = await storeNewSession(session);
  }
  const real = local.filter((s) => !s.id.startsWith('sess-101') && !s.id.startsWith('sess-102'));
  if (real.length) {
    await replaceStoredSessions(real);
    return real;
  }
  return local;
}
