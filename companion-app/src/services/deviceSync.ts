import { NativeModules } from 'react-native';
import { SessionRecord } from '../types/session';
import { ingestDeviceSession, refreshSessionsFromCloud } from './cloudSessions';

export interface SyncResult {
  success: boolean;
  message: string;
  session?: SessionRecord;
}

/**
 * Attempts to connect to the ESP32-S3 device over local network or Wi-Fi hotspot
 * Default IP for ESP32 in Access Point mode is 192.168.4.1 or on home network e.g. 192.168.1.xxx
 */
export async function syncSessionFromDevice(deviceIp: string = '192.168.4.1'): Promise<SyncResult> {
  const hosts = Array.from(new Set([deviceIp, ...collectReachableHosts()]));
  for (const host of hosts) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    try {
      const response = await fetch(`http://${host}/api/session/latest`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!response.ok) continue;
      const data = await response.json();
      if (data?.id && data.completionStatus === 'completed') {
        const session = await ingestDeviceSession(data);
        return {
          success: true,
          message: 'RECALL exam uploaded to cloud and saved in the app.',
          session,
        };
      }
    } catch {
      clearTimeout(timeoutId);
    }
  }

  await refreshSessionsFromCloud();
  return {
    success: true,
    message: 'Loaded exam sessions from the cloud.',
  };
}

export interface UserExaminationPayload {
  patientName: string;
  patientId: string;
  examType?: string;
}

function addHost(hosts: Set<string>, raw?: string | null) {
  if (!raw) return;
  const host = raw.replace(/^https?:\/\//, '').split('/')[0].split(':')[0].trim();
  if (!host) return;
  hosts.add(host);
}

export function collectReachableHosts(): string[] {
  const hosts = new Set<string>(['192.168.4.1', '127.0.0.1', 'localhost']);
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

function examQuery(payload: UserExaminationPayload): string {
  return new URLSearchParams({
    patient: payload.patientName,
    id: payload.patientId,
    examType: payload.examType || 'RECALL Speech Exam',
  }).toString();
}

async function hit(url: string, init: RequestInit, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    clearTimeout(timeoutId);
    if (init.mode === 'no-cors') return true;
    return !!response && (response.ok || response.status === 204);
  } catch {
    clearTimeout(timeoutId);
    return false;
  }
}

async function pingStartExam(
  payload: UserExaminationPayload
): Promise<boolean> {
  const q = examQuery(payload);
  const body = JSON.stringify(payload);
  const hosts = collectReachableHosts();

  const confirmed: { url: string; init: RequestInit }[] = [];
  const extra: { url: string; init: RequestInit }[] = [];
  for (const host of hosts) {
    confirmed.push({ url: `http://${host}:3847/start-exam?${q}`, init: { method: 'GET' } });
    extra.push({ url: `http://${host}/go?${q}`, init: { method: 'GET', headers: { Accept: '*/*' } } });
    extra.push({
      url: `http://${host}/api/examination/start?${q}`,
      init: { method: 'GET', headers: { Accept: 'application/json' } },
    });
    extra.push({
      url: `http://${host}/api/examination/start`,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body,
      },
    });
    extra.push({ url: `http://${host}/go?${q}`, init: { method: 'GET', mode: 'no-cors' } });
  }

  const relayHits = await Promise.all(confirmed.map(({ url, init }) => hit(url, init, 1800)));
  void Promise.all(extra.map(({ url, init }) => hit(url, init, 1200)));
  return relayHits.some(Boolean);
}

export async function startDeviceExamination(
  payload: UserExaminationPayload,
  _deviceIp: string = '192.168.4.1'
): Promise<{ success: boolean; message: string }> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const ok = await pingStartExam(payload);
    if (ok) {
      return {
        success: true,
        message: `Examination started on hardware for ${payload.patientName} (${payload.patientId})`,
      };
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  return {
    success: false,
    message: 'Phone paired, but hardware did not receive the start command.',
  };
}
