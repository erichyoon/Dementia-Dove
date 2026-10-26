/** Must match DEVICE_OPTICAL_CODE in Arduino/examples/omar_buttons/omar_buttons.ino */
export const DEVICE_OPTICAL_CODE = 'ESP32-8F24';

const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;

export function parseDeviceOpticalCode(data: string | undefined | null): {
  valid: boolean;
  ip?: string;
} {
  if (!data) {
    return { valid: false };
  }
  const tokens = data
    .trim()
    .replace(/^https?:\/\//, '')
    .split(/[\s|,/:]+/)
    .filter(Boolean);
  if (!tokens.includes(DEVICE_OPTICAL_CODE)) {
    return { valid: false };
  }
  const ip = tokens.find((token) => IPV4.test(token));
  return ip ? { valid: true, ip } : { valid: true };
}

export function isValidDeviceOpticalCode(data: string | undefined | null): boolean {
  return parseDeviceOpticalCode(data).valid;
}
