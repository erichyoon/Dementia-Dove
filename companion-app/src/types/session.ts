export type CompletionStatus = 'completed' | 'partial' | 'in_progress';

export interface TimelinePoint {
  minute: number;
  activityLevel: number; // 0 - 100
}

export type VoiceStatus = 'scored' | 'truncated' | 'unscored';

export interface VoiceConfidence {
  healthy: number;
  alzheimer: number;
}

export interface VoiceFeatures {
  duration: number;
  pause_count: number;
  speech_rate: number;
  pitch_mean: number;
  silence_ratio: number;
}

export interface SessionRecord {
  id: string;
  timestamp: number;
  dateStr: string;
  timeStr: string;
  durationSeconds: number;
  completionStatus: CompletionStatus;
  score: number; // 0 - 100%
  buttonPresses: number; // Physical top button presses on ESP32
  touchInteractions: number; // Touch screen interactions
  avgReactionTimeMs: number; // Average response time in ms
  patientFeedback: string; // Plain-English takeaway for the patient
  timeline: TimelinePoint[];
  voicePrediction?: string;
  voiceConfidence?: VoiceConfidence;
  voiceFeatures?: VoiceFeatures;
  voiceStatus?: VoiceStatus;
}

export interface PatientSummaryStats {
  totalSessions: number;
  avgScore: number;
  totalMinutes: number;
  completionRate: number;
}

export type SyncState = 'idle' | 'connecting' | 'syncing' | 'success' | 'error';
