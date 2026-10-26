import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules } from 'react-native';
import { SessionRecord } from '../types/session';
import { ingestDeviceSession, pullCloudSessions, refreshSessionsFromCloud } from './cloudSessions';
import { getStoredSessions } from './sessionStorage';
import { scoreWavBytes } from './voice/score';

const DEVICE_HOST_KEY = 'dove.deviceHost';
const AP_FALLBACK_IP = '192.168.4.1';
let cachedDeviceHost: string | null = null;
let lastSubnetScanMs = 0;

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

export async function rememberDeviceHost(host: string): Promise<void> {
  const clean = host.replace(/^https?:\/\//, '').split('/')[0].split(':')[0].trim();
  if (!clean || clean === 'localhost' || clean === '127.0.0.1') return;
  cachedDeviceHost = clean;
  try {
    await AsyncStorage.setItem(DEVICE_HOST_KEY, clean);
  } catch {
    /* ignore */
  }
}

export async function loadRememberedDeviceHost(): Promise<string | null> {
  if (cachedDeviceHost) return cachedDeviceHost;
  try {
    cachedDeviceHost = await AsyncStorage.getItem(DEVICE_HOST_KEY);
  } catch {
    /* ignore */
  }
  return cachedDeviceHost;
}

function looksLikeDove(statusJson: any): boolean {
  const mode = statusJson?.mode;
  return (
    mode === 'WHITE_START' ||
    mode === 'EXAMINATION' ||
    mode === 'PARTICLE_CLOUD' ||
    (typeof statusJson?.sessionId === 'string' && statusJson.sessionId.startsWith('DOVE')) ||
    (typeof statusJson?.id === 'string' && statusJson.id.startsWith('DOVE'))
  );
}

function isLanIPv4(host: string): boolean {
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const firstOctet = Number(match[1]);
  const secondOctet = Number(match[2]);
  return firstOctet === 10 || firstOctet === 192 || (firstOctet === 172 && secondOctet >= 16 && secondOctet <= 31);
}

function subnetHosts(seed: string): string[] {
  const match = seed.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return [];
  const prefix = `${match[1]}.${match[2]}.${match[3]}`;
  const self = Number(match[4]);
  const preferred = [100, 101, 102, 103, 110, 120, 150, 200, 10, 20, 30, 50, 80];
  const hosts: string[] = [];
  for (const n of preferred) {
    if (n !== self) hosts.push(`${prefix}.${n}`);
  }
  for (let n = 2; n <= 254; n += 1) {
    if (n === self || preferred.includes(n)) continue;
    hosts.push(`${prefix}.${n}`);
  }
  return hosts;
}

async function probeDove(host: string, timeoutMs: number): Promise<boolean> {
  const response = await readResponse(`http://${host}/api/examination/status`, timeoutMs);
  if (!response?.ok) return false;
  try {
    return looksLikeDove(await response.json());
  } catch {
    return false;
  }
}

async function scanSubnetForDevice(seeds: string[]): Promise<string | null> {
  const now = Date.now();
  if (now - lastSubnetScanMs < 20000) return null;
  lastSubnetScanMs = now;

  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const seed of seeds.filter(isLanIPv4)) {
    for (const host of subnetHosts(seed)) {
      if (!seen.has(host)) {
        seen.add(host);
        candidates.push(host);
      }
    }
  }
  if (!candidates.length) return null;

  const batchSize = 24;
  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize);
    const hits = await Promise.all(batch.map(async (host) => ((await probeDove(host, 450)) ? host : null)));
    const found = hits.find((host): host is string => !!host);
    if (found) {
      await rememberDeviceHost(found);
      return found;
    }
  }
  return null;
}

function orderedDeviceHosts(preferred?: string): string[] {
  const hosts = new Set<string>();
  if (cachedDeviceHost) hosts.add(cachedDeviceHost);
  if (preferred && preferred !== AP_FALLBACK_IP) hosts.add(preferred);
  hosts.add('dove.local');
  for (const host of collectReachableHosts()) hosts.add(host);
  hosts.add(AP_FALLBACK_IP);
  return Array.from(hosts);
}

export async function syncSessionFromDevice(
  deviceIp: string = '',
  onListen?: () => void,
  forceRetry: boolean = false
): Promise<SyncResult> {
  if (scoring) {
    return { success: false, message: 'The phone is still listening to the recording.', listening: true };
  }
  await loadRememberedDeviceHost();
  const hosts = orderedDeviceHosts(deviceIp);
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
          await rememberDeviceHost(host);
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

  const scanned = await scanSubnetForDevice(orderedDeviceHosts(deviceIp));
  if (scanned && !hosts.includes(scanned)) {
    return syncSessionFromDevice(scanned, onListen, forceRetry);
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
  const hosts = new Set<string>(['dove.local', AP_FALLBACK_IP, '127.0.0.1', 'localhost']);
  if (cachedDeviceHost) hosts.add(cachedDeviceHost);
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
  const hosts = orderedDeviceHosts();

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

  const rememberBoardHit = async (url: string, init: RequestInit, timeoutMs: number): Promise<boolean> => {
    const ok = await hit(url, init, timeoutMs);
    if (!ok || init.mode === 'no-cors') return false;
    const host = url.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
    void rememberDeviceHost(host);
    return true;
  };

  const relayHits = await Promise.all(confirmed.map(({ url, init }) => hit(url, init, 1800)));
  const boardHits = await Promise.all(extra.map(({ url, init }) => rememberBoardHit(url, init, 1200)));
  return relayHits.some(Boolean) || boardHits.some(Boolean);
}

export async function startDeviceExamination(
  payload: UserExaminationPayload,
  _deviceIp: string = ''
): Promise<{ success: boolean; message: string }> {
  await loadRememberedDeviceHost();
  for (let attempt = 0; attempt < 20; attempt++) {
    const ok = await pingStartExam(payload);
    if (ok) {
      return {
        success: true,
        message: `Examination started on hardware for ${payload.patientName} (${payload.patientId})`,
      };
    }
    if (attempt === 2) {
      await scanSubnetForDevice(orderedDeviceHosts(_deviceIp));
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return {
    success: false,
    message: 'Phone paired, but hardware did not receive the start command.',
  };
}
