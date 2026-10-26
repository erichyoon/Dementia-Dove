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

function normalizeSession(payload: any): SessionRecord {
  const ts = Number(payload.timestamp) || Date.now();
  const timestamp = ts < 1e12 ? Date.now() : ts;
  const when = new Date(timestamp);
  return {
    id: payload.id || `ts-${timestamp}`,
    timestamp,
    dateStr: payload.dateStr && payload.dateStr !== 'Today' ? payload.dateStr : when.toLocaleDateString([], { month: 'short', day: 'numeric' }),
    timeStr: payload.timeStr && payload.timeStr !== 'Live' ? payload.timeStr : when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    durationSeconds: payload.durationSeconds || 1,
    completionStatus: payload.completionStatus || 'completed',
    score: payload.score || 0,
    buttonPresses: payload.buttonPresses || 0,
    touchInteractions: payload.touchInteractions || 0,
    avgReactionTimeMs: payload.avgReactionTimeMs || 0,
    patientFeedback: payload.patientFeedback || 'Dementia Dove speech exam uploaded from hardware.',
    timeline: payload.timeline || [],
    voicePrediction: payload.voicePrediction,
    voiceConfidence: payload.voiceConfidence,
    voiceFeatures: payload.voiceFeatures,
    voiceStatus: payload.voiceStatus,
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
  const pulled = await pullCloudSessions();
  return pulled ?? [];
}

/** Sessions from the exam relay, or null when no relay answered. */
export async function pullCloudSessions(): Promise<SessionRecord[] | null> {
  for (const host of cloudHosts()) {
    const response = await tryFetch(`http://${host}:${CLOUD_PORT}/cloud/sessions`, {
      headers: { Accept: 'application/json' },
    });
    if (!response?.ok) continue;
    const payload = await response.json();
    const list = Array.isArray(payload.sessions) ? payload.sessions : Array.isArray(payload) ? payload : [];
    return list.map(normalizeSession);
  }
  return null;
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
