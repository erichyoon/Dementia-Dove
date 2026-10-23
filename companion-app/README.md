# ESP32-S3 Touch LCD 1.85C — React Native Companion App

A cross-platform React Native + TypeScript companion application built with Expo for the **ESP32-S3-Touch-LCD-1.85C** development board.

## Features

- **Live Screen Mirror**: Simulates the 360×360 round smartwatch-style display in real time.
- **Physical Button Emulation**: Trigger the hardware's physical top button (`GPIO 0` / Key 1) directly from your phone.
- **Interactive Controls**: Trigger Start / Stop, send Welcome signals, or send custom text straight to the screen.
- **Hardware Telemetry Monitor**:
  - Battery gauge (% and mV, reading ESP32 ADC1 Channel 7 / GPIO 8 with 3x divider).
  - Real-Time Clock synchronizer (syncs phone time to on-board PCF85063 RTC).
  - PWM Backlight slider (controls GPIO 5 display brightness).
  - Storage inspector (16MB QSPI Flash + MicroSD card slot).
- **Console Activity Stream**: Live event stream capturing button presses, sensor readings, and connection logs.

---

## Quick Start

### 1. Start the Dev Server
From the `companion-app` folder:
```bash
npm start
```
or to open directly in your web browser:
```bash
npm run web
```

### 2. Preview on Your Phone (iOS & Android)
1. Install **Expo Go** from the App Store (iOS) or Google Play Store (Android).
2. Open your camera (iOS) or the Expo Go app (Android) and scan the QR code displayed in the terminal.
3. The companion app will bundle and open natively on your device!

---

## Hardware Integration Architecture

```
[ ESP32-S3-Touch-LCD-1.85C ]
  │
  ├─ ST77916 QSPI Display (360x360 Round)
  ├─ CST816S Capacitive Touch (I2C 0x15)
  ├─ Physical Button (GPIO 0)
  ├─ Battery ADC (GPIO 8)
  ├─ PCF85063 RTC (I2C 0x51)
  └─ Wi-Fi / BLE / WebSockets
          ▲
          │ (WebSocket / HTTP / BLE)
          ▼
[ React Native Companion App (TypeScript / Expo) ]
  ├─ DeviceScreenReplica (Live round display mirror)
  ├─ RemoteControlCard (Trigger start/welcome, send text)
  ├─ TelemetryCard (Battery, RTC, Backlight, SD/Flash)
  └─ ConsoleLogsCard (Real-time hardware activity stream)
```
