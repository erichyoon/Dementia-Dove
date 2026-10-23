export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface DeviceTelemetry {
  batteryMilliVolts: number;
  batteryPercentage: number;
  backlightPercent: number;
  rtcTime: string;
  flashTotalMb: number;
  flashFreeMb: number;
  sdCardMounted: boolean;
  rssi?: number;
}

export interface HardwareState {
  isStarted: boolean;
  displayedName: string;
  statusText: string;
  topButtonText: string;
  bottomButtonText: string;
  accentColor: string;
}

export type HardwareCommand =
  | { type: 'TRIGGER_START'; source?: string }
  | { type: 'TRIGGER_WELCOME' }
  | { type: 'SET_TEXT'; text: string; colorHex?: string }
  | { type: 'SET_BACKLIGHT'; level: number }
  | { type: 'SYNC_TIME'; timestamp: number }
  | { type: 'REBOOT' };

export interface LogEntry {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'warn' | 'hardware';
  message: string;
}
