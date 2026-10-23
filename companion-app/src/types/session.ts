export type CompletionStatus = 'completed' | 'partial' | 'in_progress';

export interface TimelinePoint {
  minute: number;
  activityLevel: number; // 0 - 100
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
}

export interface PatientSummaryStats {
  totalSessions: number;
  avgScore: number;
  totalMinutes: number;
  completionRate: number;
}

export type SyncState = 'idle' | 'connecting' | 'syncing' | 'success' | 'error';
