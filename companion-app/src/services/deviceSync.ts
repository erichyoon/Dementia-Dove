import { NativeModules } from 'react-native';
import { SessionRecord } from '../types/session';
import { ingestDeviceSession, pullCloudSessions, refreshSessionsFromCloud } from './cloudSessions';
import { getStoredSessions } from './sessionStorage';
import { scoreWavBytes } from './voice/score';

export interface SyncResult {
  success: boolean;
  message: string;
  session?: SessionRecord;
  fresh?: boolean;
  listening?: boolean;
}

let scoring = false;
const failedAudioAttempts = new Map<string, number>();

export function clearAudioAttemptHistory(): void {
  failedAudioAttempts.clear();
}

async function readResponse(url: string, timeoutMs: number): Promise<Response | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: '*/*' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

// XMLHttpRequest keeps the raw ArrayBuffer. React Native fetch().arrayBuffer() goes through Blob/FileReader and drops WAV bodies on iOS.
function readBinary(url: string, stallTimeoutMs: number): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    let stallTimer: ReturnType<typeof setTimeout> | null = null;

    const extractResponseBytes = (): Uint8Array | null => {
      try {
        if (xhr.response && (xhr.response as ArrayBuffer).byteLength >= 44) {
          return new Uint8Array(xhr.response as ArrayBuffer);
        }
      } catch {
        /* ignore */
      }
      return null;
    };

    const finish = (value: Uint8Array | null) => {
      if (settled) return;
      settled = true;
      if (stallTimer) clearTimeout(stallTimer);
      clearTimeout(hardTimer);
      resolve(value);
    };

    const armStallTimer = () => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        const partial = extractResponseBytes();
        try {
          xhr.abort();
        } catch {
          /* ignore */
        }
        finish(partial && partial.length >= 1600 ? partial : null);
      }, stallTimeoutMs);
    };

    const hardTimer = setTimeout(() => {
      const partial = extractResponseBytes();
      try {
        xhr.abort();
      } catch {
        /* ignore */
      }
      finish(partial && partial.length >= 1600 ? partial : null);
    }, 90000);

    armStallTimer();

    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.setRequestHeader('Accept', '*/*');
    xhr.onprogress = () => {
      armStallTimer();
    };
    xhr.onload = () => {
      const bytes = extractResponseBytes();
      if (xhr.status >= 200 && xhr.status < 300 && bytes) {
        finish(bytes);
      } else {
        finish(null);
      }
    };
    xhr.onerror = () => {
      // The board often closes the socket after the WAV body. iOS then fires onerror even when xhr.response already holds the file.
      const salvaged = extractResponseBytes();
      finish(salvaged && salvaged.length >= 1600 ? salvaged : null);
    };
    xhr.ontimeout = () => {
      const salvaged = extractResponseBytes();
      finish(salvaged && salvaged.length >= 1600 ? salvaged : null);
    };
    xhr.onabort = () => {
      const salvaged = extractResponseBytes();
      finish(salvaged && salvaged.length >= 1600 ? salvaged : null);
    };
    try {
      xhr.send();
    } catch {
      finish(null);
    }
  });
}

async function attachVoiceScore(host: string, sessionJson: any): Promise<void> {
  if (sessionJson?.audioStorage === 'none') {
    console.log(`[SYNC] Session ${sessionJson?.id} has audioStorage="none" on board`);
    sessionJson.voiceStatus = 'unscored';
    return;
  }
  try {
    let bytes: Uint8Array | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      bytes = await readBinary(`http://${host}/api/session/audio`, 12000);
      if (bytes && bytes.length >= 100) break;
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
    if (!bytes || bytes.length < 100) {
      console.log(`[SYNC] Audio download from ${host} returned ${bytes ? bytes.length : 0} bytes`);
      sessionJson.voiceStatus = 'unscored';
      return;
    }
    console.log(`[SYNC] Downloaded ${bytes.length} WAV bytes for ${sessionJson?.id}, scoring...`);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const score = scoreWavBytes(bytes);
    sessionJson.voicePrediction = score.prediction;
    sessionJson.voiceConfidence = score.confidence;
    sessionJson.voiceFeatures = score.features;
    sessionJson.voiceStatus = sessionJson.audioTruncated ? 'truncated' : 'scored';
    console.log(`[SYNC] Scored ${sessionJson?.id}: ${score.prediction} (${score.confidence.healthy}% healthy)`);
  } catch (err) {
    console.log('[SYNC] Error scoring WAV:', err);
    sessionJson.voiceStatus = 'unscored';
  }
}

export async function syncSessionFromDevice(
  deviceIp: string = '192.168.4.1',
  onListen?: () => void,
  forceRetry: boolean = false
): Promise<SyncResult> {
  if (scoring) {
    return { success: false, message: 'The phone is still listening to the recording.', listening: true };
  }
  const hosts = Array.from(new Set([deviceIp, ...collectReachableHosts()]));
  for (const host of hosts) {
    const response = await readResponse(`http://${host}/api/session/latest`, 2000);
    if (!response?.ok) continue;
    try {
      const sessionJson = await response.json();
      if (sessionJson?.id && sessionJson.completionStatus === 'completed') {
        const stored = await getStoredSessions();
        const prior = stored.find((row) => row.id === sessionJson.id);
        if (prior?.voiceStatus === 'scored' || prior?.voiceStatus === 'truncated') {
          return {
            success: true,
            message: 'This exam is already on the phone.',
            session: prior,
          };
        }
        const attempts = failedAudioAttempts.get(sessionJson.id) || 0;
        if (!forceRetry && prior?.voiceStatus === 'unscored' && attempts >= 1) {
          return {
            success: true,
            fresh: false,
            message: 'This exam is already saved on the phone.',
            session: prior,
          };
        }
        scoring = true;
        try {
          if (sessionJson.audioStorage !== 'none') {
            onListen?.();
            await new Promise((resolve) => setTimeout(resolve, 40));
          }
          await attachVoiceScore(host, sessionJson);
          const session = await ingestDeviceSession(sessionJson);
          const heard = session.voiceStatus === 'scored' || session.voiceStatus === 'truncated';
          if (heard) {
            failedAudioAttempts.delete(sessionJson.id);
          } else {
            failedAudioAttempts.set(sessionJson.id, attempts + 1);
          }
          return {
            success: true,
            fresh: heard || !prior,
            message: heard
              ? 'The phone listened to the recording.'
              : 'The exam finished, and the recording did not reach the phone.',
            session,
          };
        } finally {
          scoring = false;
        }
      }
    } catch {
      scoring = false;
    }
  }

  const cloud = await pullCloudSessions();
  if (cloud) {
    await refreshSessionsFromCloud();
    return {
      success: true,
      message: 'Synced with this computer.',
    };
  }

  return {
    success: false,
    message: "Couldn't reach the device or this computer.",
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
    examType: payload.examType || 'Dementia Dove Speech Exam',
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
  const query = examQuery(payload);
  const body = JSON.stringify(payload);
  const hosts = collectReachableHosts();

  const confirmed: { url: string; init: RequestInit }[] = [];
  const extra: { url: string; init: RequestInit }[] = [];
  for (const host of hosts) {
    confirmed.push({ url: `http://${host}:3847/start-exam?${query}`, init: { method: 'GET' } });
    extra.push({ url: `http://${host}/go?${query}`, init: { method: 'GET', headers: { Accept: '*/*' } } });
    extra.push({
      url: `http://${host}/api/examination/start?${query}`,
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
    extra.push({ url: `http://${host}/go?${query}`, init: { method: 'GET', mode: 'no-cors' } });
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
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return {
    success: false,
    message: 'Phone paired, but hardware did not receive the start command.',
  };
}
