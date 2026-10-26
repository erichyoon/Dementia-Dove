# Dementia Dove

Self-guided speech screening on a Waveshare **ESP32-S3-Touch-LCD-1.85C**, plus an Expo companion app on the phone.

The board walks a patient through six speaking tasks, records the microphone, and serves the session over HTTP. The phone pairs with a QR / optical code, pulls the WAV, scores it on-device, and can email a report to a clinician.

## Start here

Read these first. Everything else is support or vendor.

1. `Arduino/examples/omar_buttons/omar_buttons.ino` — exam, Wi-Fi, HTTP API, round UI
2. `Arduino/examples/omar_buttons/Audio_Voice.cpp` — speaker prompts and microphone capture
3. `companion-app/App.tsx` — phone tabs, pairing, sync loop
4. `companion-app/src/services/deviceSync.ts` — find the board and download the WAV
5. `companion-app/src/services/voice/` — on-device features + SVM score
6. `companion-app/src/services/doctorReport.ts` — clinician email
7. `speech-model/` — how the voice model was trained

Vendor LCD/touch helpers live next to the sketch. LVGL stays in `Arduino/libraries/` on the build machine and is not in git.

## What is in this repo

| Path | Role |
| --- | --- |
| `Arduino/examples/omar_buttons/` | Firmware: round LVGL UI, six-task exam, ES8311 audio, Wi-Fi HTTP API |
| `Arduino/libraries/es8311/` | Codec driver used by the sketch |
| `companion-app/` | Expo / React Native app: pairing, sync, voice score, progress, doctor email |
| `speech-model/` | Python training / scoring reference for the voice model |

## Hardware

- ESP32-S3-Touch-LCD-1.85C
- ST77916 360×360 round display
- CST816 touch (I2C)
- ES8311 codec, speaker, microphone
- Physical button on GPIO 0

Firmware sketch: `Arduino/examples/omar_buttons/omar_buttons.ino`

## Exam

Six spoken tasks, in order:

| Code | Task |
| --- | --- |
| T0 | Quiet / room tone, 10 seconds |
| T1 | Hold “ahh” (three takes) |
| T2 | Read the on-screen sentence |
| T3 | Describe the picture |
| T4 | Name animals, 60 seconds |
| T5 | Tell a short story from the day, 60 seconds |

On the board: tap **Start**, listen, speak, tap **Done**. After T5 the session is stored and the phone can download `/api/session/latest` and `/api/session/audio`.

The pairing code on the QR screen is `ESP32-8F24`.

## Voice score

The companion app extracts acoustic features in TypeScript (`companion-app/src/services/voice/`) and scores them with an RBF SVM + Platt scaling. That score is separate from the board’s protocol / task-completion percentage.

## Phone and board on the same Wi-Fi

The board joins **`smy_guest`** in station mode and keeps `ESP32-Health-Device` as a fallback hotspot.

1. Flash the latest `omar_buttons` sketch.
2. Leave the phone on `smy_guest`. Do not switch to the board hotspot unless the LAN join fails.
3. Wait until the start screen shows `smy_guest` and a LAN IP (for example `192.168.x.x`).
4. Run the exam, then open the companion app. It discovers the board by remembered IP, QR payload, `dove.local`, or a short subnet scan.

SSID and password are set at the top of `omar_buttons.ino` (`STA_SSID` / `STA_PASS`). Change those if the guest network changes.

HTTP endpoints on port 80:

- `GET /api/session/latest`
- `GET /api/session/audio`
- `GET|POST /api/examination/start` and `/go`
- `GET /api/examination/status`

## Flash the firmware

1. Plug the board in over USB.
2. Open **Arduino IDE**.
3. **File → Open** `Arduino/examples/omar_buttons/omar_buttons.ino`
4. **File → Preferences → Sketchbook location** → this repo’s `Arduino` folder, so `lvgl` and `es8311` resolve.
5. **Tools**
   - Board: `ESP32S3 Dev Module`
   - USB Mode: Hardware CDC and JTAG
   - USB CDC On Boot: Enabled
   - CPU Frequency: 240 MHz
   - Flash Size: 16MB (or the size that already works on your unit)
   - Partition Scheme: Huge APP
   - PSRAM: OPI PSRAM
   - Port: the `cu.usbmodem…` / `cu.usbserial…` port
6. Click **Upload**.

If upload fails, hold **BOOT**, tap **RESET**, release **BOOT**, and upload again.

Serial Monitor: **115200**. A good join looks like `[WIFI] Joined 'smy_guest' at …`.

## Run the companion app

```bash
cd companion-app
npm install
npx expo start --port 8081 --host lan
```

Install **Expo Go**, keep the phone on the same Wi-Fi as this computer, and scan the Metro QR (`exp://<your-lan-ip>:8081`).

App tabs: Home, Screening (camera pair), Groups, Nearby caregivers, Profile / Progress. After an exam, Screening / Home pull the recording and show the voice result. Progress and Profile can email a single-session report or a weekly average to the clinician stored in Profile.

## Doctor email

Profile stores doctor name, email, and clinic. Progress can send:

- one screening (`SessionCard`)
- a 7-day average (`AnalyticsTab`)

The app opens the system mail client with a plain-text report (`companion-app/src/services/doctorReport.ts`).

## Repo

https://github.com/erichyoon/esp32-s3-touch-lcd-1-85c
