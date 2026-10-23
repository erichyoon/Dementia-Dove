/** Must match DEVICE_OPTICAL_CODE in Arduino/examples/omar_buttons/omar_buttons.ino */
export const DEVICE_OPTICAL_CODE = 'ESP32-8F24';

export function isValidDeviceOpticalCode(data: string | undefined | null): boolean {
  if (!data) {
    return false;
  }
  return data.trim() === DEVICE_OPTICAL_CODE;
}
