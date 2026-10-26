#include <Arduino.h>
#include <WiFi.h>
#include <ESPmDNS.h>
#include <WebServer.h>
#include <Preferences.h>
#include <math.h>
#include "Display_ST77916.h"
#include "LVGL_Driver.h"
#include "I2C_Driver.h"
#include "TCA9554PWR.h"
#include "Touch_CST816.h"
#include <lvgl.h>
#include "lv_conf.h"
#include "Audio_Voice.h"

#define PHYSICAL_BUTTON_PIN 0

const char *AP_SSID = "ESP32-Health-Device";
const char *AP_PASS = "12345678";
const char *STA_SSID = "smy_guest";
const char *STA_PASS = "12345678";
const char *STA_HOSTNAME = "dove";

WebServer server(80);
Preferences prefs;

enum HardwareMode {
    MODE_WHITE_START,
    MODE_PARTICLE_CLOUD,
    MODE_EXAMINATION
};
static HardwareMode current_mode = MODE_WHITE_START;

static lv_obj_t *start_screen_cont = NULL;
static lv_obj_t *particle_screen_cont = NULL;
static lv_obj_t *exam_screen_cont = NULL;
static lv_obj_t *dash_help_label = NULL;
static lv_obj_t *dash_phone_label = NULL;
static lv_obj_t *dash_exam_label = NULL;
static lv_obj_t *optical_qr = NULL;
static lv_obj_t *qr_ip_label = NULL;
static char last_qr_payload[72] = "";
static bool dash_has_exam = false;
static uint32_t dash_last_score = 0;

static const char DEVICE_OPTICAL_CODE[] = "ESP32-8F24";

#define COL_PAPER  0xF6F0E4
#define COL_INK    0x141414
#define COL_ACCENT 0x7A6B8A
#define COL_WHITE  0xFFFDF8
#define COL_MUTED  0x6E675F

static char patient_name[64] = "Omar Firdaus";
static char patient_id[32] = "PT-8F24";
static char exam_type[64] = "Dementia Dove Speech Exam";
static char session_id[24] = "DOVE-01-0007";

static lv_obj_t *exam_status_label = NULL;
static lv_obj_t *exam_session_label = NULL;
static lv_obj_t *exam_task_label = NULL;
static lv_obj_t *exam_instruction_label = NULL;
static lv_obj_t *exam_timer_label = NULL;
static lv_obj_t *exam_primary_btn = NULL;
static lv_obj_t *exam_primary_label = NULL;
static lv_obj_t *exam_picture_cont = NULL;
static lv_obj_t *exam_complete_badge = NULL;
static lv_obj_t *exam_complete_label = NULL;

enum ExamPhase {
    PHASE_WAIT_START,
    PHASE_RECORDING,
    PHASE_COMPLETE
};

static ExamPhase exam_phase = PHASE_WAIT_START;
static int exam_task = 0;
static int t1_attempt = 0;
static bool exam_completed = false;
static unsigned long exam_session_start_ms = 0;
static unsigned long exam_finish_time_ms = 0;
static unsigned long task_start_ms = 0;
static unsigned long last_ui_ms = 0;
static volatile bool exam_start_requested = false;
static volatile bool qr_mode_requested = false;
static volatile bool primary_action_requested = false;
static uint32_t touch_count = 0;
static uint32_t button_count = 0;

static unsigned long task_started_at[6] = {0};
static unsigned long task_ended_at[6] = {0};
static uint8_t task_restarts[6] = {0};
static char skip_reasons[6][24] = {{0}};
static bool t1_valid[3] = {false, false, false};
static unsigned long t1_started_at[3] = {0};
static unsigned long t1_ended_at[3] = {0};

static String last_session_json = "{\"id\":\"\",\"completionStatus\":\"idle\"}";

static const char *TASK_CODES[] = {"T0", "T1", "T2", "T3", "T4", "T5"};
static const char *TASK_TITLES[] = {
    "Quiet",
    "Hold ahh",
    "Read aloud",
    "Describe the picture",
    "Name animals",
    "Tell a story"
};
static const char *TASK_INSTRUCTIONS[] = {
    "Stay quiet for 10 seconds.\nTap Start, then tap Done.",
    "Hold the sound “ahh”.\nTap Start, then tap Done.",
    "Read this aloud:\nThe young baker set warm bread beside the open window.",
    "Say everything you see.\nTap Start, then tap Done.",
    "Name as many animals as you can.\nTap Start, then tap Done.",
    "Tell a short story from your day.\nTap Start, then tap Done."
};
static const char *TASK_NOW[] = {
    "Stay quiet.\nTap Done when the time ends.",
    "Hold “ahh”.\nTap Done when you finish.",
    "Read the sentence aloud.\nTap Done when you finish.",
    "Say everything you see.\nTap Done when you finish.",
    "Name animals now.\nTap Done when you finish.",
    "Tell your story.\nTap Done when you finish."
};
static const unsigned long TASK_TARGET_MS[] = {10000, 0, 0, 0, 60000, 60000};

void switch_mode(HardwareMode new_mode);
void request_exam_from_phone(void);
void exam_begin_session(void);
void exam_show_task(int task, bool play_voice);
void exam_on_start(void);
void exam_on_done(void);
void exam_finish_session(void);
void exam_refresh_ui(void);
void exam_service(void);
static void dashboard_refresh(void);
static void refresh_optical_code_locked(void);
static void wifi_service(void);
static bool wifi_sta_up(void);
static void device_reach_ip(char *out, size_t n);

void request_exam_from_phone(void)
{
    exam_start_requested = true;
}

void poll_serial_commands(void)
{
    static char buf[64];
    static size_t n = 0;
    while (Serial.available() > 0) {
        char c = (char)Serial.read();
        if (c == '\r' || c == '\n') {
            buf[n] = 0;
            if (n > 0 && strstr(buf, "START_EXAM")) {
                Serial.println("[SERIAL] START_EXAM from companion");
                request_exam_from_phone();
            }
            n = 0;
            continue;
        }
        if (n < sizeof(buf) - 1) {
            buf[n++] = c;
            buf[n] = 0;
            if (strstr(buf, "START_EXAM")) {
                Serial.println("[SERIAL] START_EXAM from companion");
                request_exam_from_phone();
                n = 0;
            }
        } else {
            n = 0;
        }
    }
}

void send_session_json()
{
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.send(200, "application/json", last_session_json);
}

void send_session_audio()
{
    size_t nbytes = 0;
    const uint8_t *wav = voice_capture_wav(&nbytes);
    if (!wav || nbytes < 44) {
        server.sendHeader("Access-Control-Allow-Origin", "*");
        server.send(404, "application/json", "{\"error\":\"no audio\"}");
        return;
    }
    Serial.printf("[HTTP] Sending audio WAV (%u bytes)\n", (unsigned)nbytes);
    // server.send() with an empty body becomes a chunked reply and drops the WAV. Write one plain response.
    WiFiClient client = server.client();
    client.setNoDelay(true);
    char header[160];
    int header_len = snprintf(header, sizeof(header),
        "HTTP/1.1 200 OK\r\n"
        "Content-Type: audio/wav\r\n"
        "Access-Control-Allow-Origin: *\r\n"
        "Content-Length: %u\r\n"
        "Connection: close\r\n"
        "\r\n",
        (unsigned)nbytes);
    if (header_len > 0 && (size_t)header_len < sizeof(header)) {
        client.write((const uint8_t *)header, header_len);
    }
    size_t sent = 0;
    uint32_t last = millis();
    while (sent < nbytes && client.connected()) {
        voice_service();
        size_t chunk = nbytes - sent;
        if (chunk > 1436) chunk = 1436;
        size_t wrote = client.write(wav + sent, chunk);
        if (wrote == 0) {
            if (millis() - last > 8000) break;
            delay(2);
            continue;
        }
        sent += wrote;
        last = millis();
        if ((sent & 0x3fff) == 0) delay(0);
    }
    client.flush();
    delay(20);
    Serial.printf("[HTTP] Sent %u / %u audio bytes\n", (unsigned)sent, (unsigned)nbytes);
}

void handle_start_examination()
{
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.sendHeader("Access-Control-Allow-Headers", "*");

    if (server.hasArg("plain")) {
        String body = server.arg("plain");
        int name_idx = body.indexOf("\"patientName\":");
        if (name_idx != -1) {
            int start = body.indexOf("\"", name_idx + 14);
            int end = body.indexOf("\"", start + 1);
            if (start != -1 && end != -1) {
                String n = body.substring(start + 1, end);
                n.trim();
                if (n.length() > 0) strncpy(patient_name, n.c_str(), sizeof(patient_name) - 1);
            }
        }
        int id_idx = body.indexOf("\"patientId\":");
        if (id_idx != -1) {
            int start = body.indexOf("\"", id_idx + 12);
            int end = body.indexOf("\"", start + 1);
            if (start != -1 && end != -1) {
                String id = body.substring(start + 1, end);
                id.trim();
                if (id.length() > 0) strncpy(patient_id, id.c_str(), sizeof(patient_id) - 1);
            }
        }
    } else {
        if (server.hasArg("patient")) {
            strncpy(patient_name, server.arg("patient").c_str(), sizeof(patient_name) - 1);
        }
        if (server.hasArg("id")) {
            strncpy(patient_id, server.arg("id").c_str(), sizeof(patient_id) - 1);
        }
    }

    Serial.printf("[EXAMINATION] Pairing confirmed — queue RECALL for %s (%s)\n", patient_name, patient_id);
    request_exam_from_phone();

    char resp[256];
    snprintf(resp, sizeof(resp),
        "{\"status\":\"started\",\"patient\":\"%s\",\"patientId\":\"%s\",\"mode\":\"EXAMINATION\",\"examType\":\"Dementia Dove\"}",
        patient_name, patient_id);
    server.send(200, "application/json", resp);
}

static bool wifi_sta_up(void)
{
    return WiFi.status() == WL_CONNECTED;
}

static void device_reach_ip(char *out, size_t n)
{
    if (!out || n == 0) return;
    String ip = wifi_sta_up() ? WiFi.localIP().toString() : WiFi.softAPIP().toString();
    strncpy(out, ip.c_str(), n - 1);
    out[n - 1] = 0;
}

static void refresh_optical_code_locked(void)
{
    if (!optical_qr) return;
    char ip[20];
    device_reach_ip(ip, sizeof(ip));
    char payload[72];
    snprintf(payload, sizeof(payload), "%s %s", DEVICE_OPTICAL_CODE, ip);
    if (strcmp(payload, last_qr_payload) == 0) return;
    strncpy(last_qr_payload, payload, sizeof(last_qr_payload) - 1);
    last_qr_payload[sizeof(last_qr_payload) - 1] = 0;
    lv_qrcode_update(optical_qr, payload, strlen(payload));
    if (qr_ip_label) lv_label_set_text(qr_ip_label, ip);
    Serial.printf("[OPTICAL] QR %s\n", payload);
}

static void wifi_service(void)
{
    static wl_status_t last = (wl_status_t)255;
    static bool mdns_started = false;
    static unsigned long last_try_ms = 1;
    wl_status_t st = WiFi.status();

    if (st == WL_CONNECTED && last != WL_CONNECTED) {
        Serial.printf("[WIFI] Joined '%s' at %s\n", STA_SSID, WiFi.localIP().toString().c_str());
        if (mdns_started) {
            MDNS.end();
            mdns_started = false;
        }
        if (MDNS.begin(STA_HOSTNAME)) {
            MDNS.addService("http", "tcp", 80);
            mdns_started = true;
            Serial.printf("[WIFI] mDNS http://%s.local\n", STA_HOSTNAME);
        }
        lvgl_port_lock(0);
        refresh_optical_code_locked();
        lvgl_port_unlock();
    } else if (st != WL_CONNECTED && last == WL_CONNECTED) {
        Serial.printf("[WIFI] Lost '%s' — AP '%s' still available\n", STA_SSID, AP_SSID);
    }

    if (st != WL_CONNECTED && millis() - last_try_ms > 15000) {
        last_try_ms = millis();
        Serial.printf("[WIFI] Retrying '%s'...\n", STA_SSID);
        WiFi.begin(STA_SSID, STA_PASS);
    }

    last = st;
}

void setup_wifi_sync_server()
{
    WiFi.mode(WIFI_AP_STA);
    WiFi.setSleep(false);
    WiFi.setHostname(STA_HOSTNAME);
    WiFi.softAP(AP_SSID, AP_PASS, 1, 0, 8);
    Serial.printf("[WIFI] AP '%s' ready at %s\n", AP_SSID, WiFi.softAPIP().toString().c_str());
    Serial.printf("[WIFI] Connecting to '%s'...\n", STA_SSID);
    WiFi.begin(STA_SSID, STA_PASS);

    server.on("/api/examination/start", HTTP_OPTIONS, []() {
        server.sendHeader("Access-Control-Allow-Origin", "*");
        server.sendHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
        server.sendHeader("Access-Control-Allow-Headers", "*");
        server.send(204);
    });
    server.on("/go", HTTP_OPTIONS, []() {
        server.sendHeader("Access-Control-Allow-Origin", "*");
        server.sendHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
        server.sendHeader("Access-Control-Allow-Headers", "*");
        server.send(204);
    });

    server.on("/api/session/latest", HTTP_GET, send_session_json);
    server.on("/api/session/audio", HTTP_GET, send_session_audio);
    server.on("/api/examination/start", HTTP_POST, handle_start_examination);
    server.on("/api/examination/start", HTTP_GET, handle_start_examination);
    server.on("/go", HTTP_GET, handle_start_examination);
    server.on("/go", HTTP_POST, handle_start_examination);

    server.on("/api/examination/status", HTTP_GET, []() {
        server.sendHeader("Access-Control-Allow-Origin", "*");
        char resp[440];
        char ip[20];
        device_reach_ip(ip, sizeof(ip));
        unsigned long elapsed = (exam_session_start_ms > 0) ? ((millis() - exam_session_start_ms) / 1000) : 0;
        snprintf(resp, sizeof(resp),
            "{\"mode\":\"%s\",\"sessionId\":\"%s\",\"patient\":\"%s\",\"task\":\"%s\",\"phase\":%d,\"elapsedSeconds\":%lu,\"completed\":%s,\"ip\":\"%s\",\"ssid\":\"%s\"}",
            (current_mode == MODE_EXAMINATION ? "EXAMINATION" : (current_mode == MODE_PARTICLE_CLOUD ? "PARTICLE_CLOUD" : "WHITE_START")),
            session_id, patient_name, TASK_CODES[exam_task], (int)exam_phase, elapsed, (exam_completed ? "true" : "false"),
            ip, (wifi_sta_up() ? STA_SSID : AP_SSID));
        server.send(200, "application/json", resp);
    });

    server.begin();
    Serial.println("[HTTP] RECALL exam API ready");
}

static void style_ink_btn(lv_obj_t *btn, int w, int h)
{
    lv_obj_set_size(btn, w, h);
    lv_obj_set_style_radius(btn, 14, 0);
    lv_obj_set_style_bg_color(btn, lv_color_hex(COL_ACCENT), 0);
    lv_obj_set_style_border_color(btn, lv_color_hex(COL_INK), 0);
    lv_obj_set_style_border_width(btn, 3, 0);
    lv_obj_set_style_shadow_width(btn, 0, 0);
}

static lv_obj_t *picture_shape(lv_obj_t *parent, int w, int h, int x, int y, int radius, uint32_t color)
{
    lv_obj_t *obj = lv_obj_create(parent);
    lv_obj_set_size(obj, w, h);
    lv_obj_set_pos(obj, x, y);
    lv_obj_set_style_radius(obj, radius, 0);
    lv_obj_set_style_bg_color(obj, lv_color_hex(color), 0);
    lv_obj_set_style_bg_opa(obj, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(obj, 2, 0);
    lv_obj_set_style_border_color(obj, lv_color_hex(COL_INK), 0);
    lv_obj_set_style_pad_all(obj, 0, 0);
    lv_obj_set_style_shadow_width(obj, 0, 0);
    lv_obj_remove_flag(obj, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_remove_flag(obj, LV_OBJ_FLAG_CLICKABLE);
    return obj;
}

static void create_exam_picture(lv_obj_t *parent)
{
    exam_picture_cont = lv_obj_create(parent);
    lv_obj_set_size(exam_picture_cont, 196, 108);
    lv_obj_align(exam_picture_cont, LV_ALIGN_CENTER, 0, 2);
    lv_obj_set_style_radius(exam_picture_cont, 16, 0);
    lv_obj_set_style_bg_color(exam_picture_cont, lv_color_hex(COL_WHITE), 0);
    lv_obj_set_style_border_width(exam_picture_cont, 3, 0);
    lv_obj_set_style_border_color(exam_picture_cont, lv_color_hex(COL_INK), 0);
    lv_obj_set_style_pad_all(exam_picture_cont, 0, 0);
    lv_obj_remove_flag(exam_picture_cont, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_remove_flag(exam_picture_cont, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_flag(exam_picture_cont, LV_OBJ_FLAG_HIDDEN);

    picture_shape(exam_picture_cont, 196, 28, 0, 80, 0, COL_PAPER);
    picture_shape(exam_picture_cont, 26, 26, 154, 8, LV_RADIUS_CIRCLE, COL_ACCENT);
    picture_shape(exam_picture_cont, 54, 22, 28, 42, 4, COL_INK);
    picture_shape(exam_picture_cont, 40, 36, 35, 52, 4, COL_WHITE);
    picture_shape(exam_picture_cont, 12, 18, 49, 68, 2, COL_INK);
    picture_shape(exam_picture_cont, 12, 22, 118, 62, 2, COL_INK);
    picture_shape(exam_picture_cont, 36, 36, 106, 28, LV_RADIUS_CIRCLE, COL_ACCENT);
    picture_shape(exam_picture_cont, 10, 16, 78, 72, 6, COL_INK);
    picture_shape(exam_picture_cont, 16, 16, 75, 58, LV_RADIUS_CIRCLE, COL_MUTED);
}

void exam_refresh_ui(void)
{
    lvgl_port_lock(0);
    if (exam_session_label) lv_label_set_text(exam_session_label, session_id);
    if (exam_task_label) {
        if (exam_phase == PHASE_COMPLETE) lv_label_set_text(exam_task_label, "All done");
        else lv_label_set_text(exam_task_label, TASK_TITLES[exam_task]);
    }
    bool prompt = (exam_phase == PHASE_WAIT_START && voice_is_playing());
    if (exam_instruction_label) {
        if (prompt) {
            lv_label_set_text(exam_instruction_label, "Listen first.\nStart appears when the prompt ends.");
        } else if (exam_phase == PHASE_COMPLETE) {
            lv_label_set_text(exam_instruction_label, "You are done. Thank you.\nThe result is on the phone.");
        } else if (exam_phase == PHASE_RECORDING && exam_task == 2) {
            lv_label_set_text(exam_instruction_label, TASK_INSTRUCTIONS[2]);
        } else if (exam_phase == PHASE_RECORDING && exam_task == 1) {
            char line[80];
            snprintf(line, sizeof(line), "Hold “ahh”. Try %d of 3.\nTap Done when you finish.", t1_attempt + 1);
            lv_label_set_text(exam_instruction_label, line);
        } else if (exam_phase == PHASE_RECORDING) {
            lv_label_set_text(exam_instruction_label, TASK_NOW[exam_task]);
        } else if (exam_task == 1) {
            char line[80];
            snprintf(line, sizeof(line), "Hold “ahh”. Try %d of 3.\nTap Start, then tap Done.", t1_attempt + 1);
            lv_label_set_text(exam_instruction_label, line);
        } else {
            lv_label_set_text(exam_instruction_label, TASK_INSTRUCTIONS[exam_task]);
        }
        lv_obj_set_style_text_font(exam_instruction_label,
            (exam_task == 2 && !prompt) ? &lv_font_montserrat_14 : &lv_font_montserrat_12, 0);
        lv_obj_set_style_text_color(exam_instruction_label,
            (exam_task == 2 && !prompt) ? lv_color_hex(COL_INK) : lv_color_hex(COL_MUTED), 0);
    }

    bool show_picture = (exam_phase != PHASE_COMPLETE && exam_task == 3);
    if (exam_picture_cont) {
        if (show_picture) lv_obj_remove_flag(exam_picture_cont, LV_OBJ_FLAG_HIDDEN);
        else lv_obj_add_flag(exam_picture_cont, LV_OBJ_FLAG_HIDDEN);
    }
    if (exam_timer_label) {
        if (show_picture) lv_obj_add_flag(exam_timer_label, LV_OBJ_FLAG_HIDDEN);
        else lv_obj_remove_flag(exam_timer_label, LV_OBJ_FLAG_HIDDEN);
    }

    bool running = (exam_phase == PHASE_RECORDING);
    bool wait = (exam_phase == PHASE_WAIT_START);
    if (exam_primary_btn) {
        if (wait || running) lv_obj_remove_flag(exam_primary_btn, LV_OBJ_FLAG_HIDDEN);
        else lv_obj_add_flag(exam_primary_btn, LV_OBJ_FLAG_HIDDEN);
        if (prompt) {
            lv_obj_remove_flag(exam_primary_btn, LV_OBJ_FLAG_CLICKABLE);
            lv_obj_set_style_bg_color(exam_primary_btn, lv_color_hex(COL_MUTED), 0);
        } else {
            lv_obj_add_flag(exam_primary_btn, LV_OBJ_FLAG_CLICKABLE);
            lv_obj_set_style_bg_color(exam_primary_btn, lv_color_hex(COL_ACCENT), 0);
        }
        if (exam_primary_label) {
            lv_label_set_text(exam_primary_label, prompt ? "LISTEN" : (running ? "DONE" : "START"));
        }
    }
    if (exam_complete_badge) {
        if (exam_phase == PHASE_COMPLETE) lv_obj_remove_flag(exam_complete_badge, LV_OBJ_FLAG_HIDDEN);
        else lv_obj_add_flag(exam_complete_badge, LV_OBJ_FLAG_HIDDEN);
    }
    lvgl_port_unlock();
}

void exam_show_task(int task, bool play_voice)
{
    exam_task = task;
    exam_phase = PHASE_WAIT_START;
    task_start_ms = 0;
    if (play_voice) voice_play_task(task);
    exam_refresh_ui();
}

void exam_begin_session(void)
{
    uint32_t seq = prefs.getUInt("recall_n", 7);
    prefs.putUInt("recall_n", seq + 1);
    snprintf(session_id, sizeof(session_id), "DOVE-01-%04lu", (unsigned long)seq);

    exam_completed = false;
    exam_finish_time_ms = 0;
    exam_session_start_ms = millis();
    exam_task = 0;
    t1_attempt = 0;
    touch_count = 0;
    button_count = 0;
    last_session_json = String("{\"id\":\"") + session_id + "\",\"completionStatus\":\"in_progress\"}";
    memset(task_started_at, 0, sizeof(task_started_at));
    memset(task_ended_at, 0, sizeof(task_ended_at));
    memset(task_restarts, 0, sizeof(task_restarts));
    memset(skip_reasons, 0, sizeof(skip_reasons));
    memset(t1_valid, 0, sizeof(t1_valid));
    memset(t1_started_at, 0, sizeof(t1_started_at));
    memset(t1_ended_at, 0, sizeof(t1_ended_at));

    Serial.printf("[RECALL] begin %s for %s\n", session_id, patient_name);
    voice_capture_reset();
    voice_stop();
    voice_play(VOICE_WELCOME);
    exam_show_task(0, true);
}

void exam_on_start(void)
{
    if (current_mode != MODE_EXAMINATION || exam_phase != PHASE_WAIT_START) return;
    if (voice_is_playing()) return;
    unsigned long now = millis();
    if (task_started_at[exam_task] > 0) task_restarts[exam_task]++;
    task_start_ms = now;
    task_started_at[exam_task] = now;
    if (exam_task == 1) t1_started_at[t1_attempt] = now;
    voice_stop();
    voice_capture_begin();
    exam_phase = PHASE_RECORDING;
    Serial.printf("[RECALL] %s START%s\n", TASK_CODES[exam_task],
        exam_task == 1 ? " attempt" : "");
    exam_refresh_ui();
}

void exam_advance_after_task(void)
{
    if (exam_task >= 5) {
        exam_finish_session();
        return;
    }
    exam_show_task(exam_task + 1, true);
}

void exam_on_done(void)
{
    if (current_mode != MODE_EXAMINATION || exam_phase != PHASE_RECORDING) return;
    voice_capture_end();
    unsigned long now = millis();
    task_ended_at[exam_task] = now;
    if (exam_task == 1) {
        t1_ended_at[t1_attempt] = now;
        t1_valid[t1_attempt] = true;
        Serial.printf("[RECALL] T1 attempt %d done\n", t1_attempt + 1);
        t1_attempt++;
        if (t1_attempt >= 3) {
            exam_advance_after_task();
            return;
        }
        exam_show_task(1, true);
        return;
    }
    Serial.printf("[RECALL] %s DONE\n", TASK_CODES[exam_task]);
    exam_advance_after_task();
}

void exam_finish_session(void)
{
    exam_phase = PHASE_COMPLETE;
    exam_completed = true;
    exam_finish_time_ms = millis();
    unsigned long duration_sec = (millis() - exam_session_start_ms) / 1000;
    if (duration_sec < 1) duration_sec = 1;

    int valid_ahh = (t1_valid[0] ? 1 : 0) + (t1_valid[1] ? 1 : 0) + (t1_valid[2] ? 1 : 0);
    uint32_t score = (uint32_t)((6 * 100 + valid_ahh * 10) / 7);
    if (score > 99) score = 99;
    dash_has_exam = true;
    dash_last_score = score;

    static char json_buf[1800];
    const char *storage = voice_capture_pcm_bytes() > 0 ? "usb" : "none";
    const char *truncated = voice_capture_truncated() ? "true" : "false";
    snprintf(json_buf, sizeof(json_buf),
        "{\"id\":\"%s\",\"examType\":\"Dementia Dove Speech Exam\",\"patientName\":\"%s\",\"patientId\":\"%s\",\"timestamp\":%lu,\"dateStr\":\"Today\",\"timeStr\":\"Live\",\"durationSeconds\":%lu,\"score\":%lu,\"buttonPresses\":%lu,\"touchInteractions\":%lu,\"avgReactionTimeMs\":0,\"completionStatus\":\"completed\",\"audioStorage\":\"%s\",\"audioTruncated\":%s,\"clippingCounts\":0,\"bufferOverruns\":0,\"patientFeedback\":\"Self-guided Dementia Dove %s: T0 quiet, T1 ahh %d/3, T2 on-screen sentence, T3 on-screen picture, T4 fluency, T5 narrative.\",\"tasks\":[{\"id\":\"T0\",\"startedMs\":%lu,\"endedMs\":%lu,\"restarts\":%u,\"skipReason\":\"%s\"},{\"id\":\"T1\",\"attempts\":[{\"n\":1,\"valid\":%s,\"startedMs\":%lu,\"endedMs\":%lu},{\"n\":2,\"valid\":%s,\"startedMs\":%lu,\"endedMs\":%lu},{\"n\":3,\"valid\":%s,\"startedMs\":%lu,\"endedMs\":%lu}],\"restarts\":%u},{\"id\":\"T2\",\"startedMs\":%lu,\"endedMs\":%lu,\"restarts\":%u},{\"id\":\"T3\",\"startedMs\":%lu,\"endedMs\":%lu,\"restarts\":%u},{\"id\":\"T4\",\"startedMs\":%lu,\"endedMs\":%lu,\"restarts\":%u},{\"id\":\"T5\",\"startedMs\":%lu,\"endedMs\":%lu,\"restarts\":%u}],\"timeline\":[{\"minute\":1,\"activityLevel\":40},{\"minute\":3,\"activityLevel\":70},{\"minute\":5,\"activityLevel\":88}]}",
        session_id, patient_name, patient_id, millis(), duration_sec, score, button_count, touch_count, storage, truncated, session_id, valid_ahh,
        task_started_at[0], task_ended_at[0], task_restarts[0], skip_reasons[0],
        t1_valid[0] ? "true" : "false", t1_started_at[0], t1_ended_at[0],
        t1_valid[1] ? "true" : "false", t1_started_at[1], t1_ended_at[1],
        t1_valid[2] ? "true" : "false", t1_started_at[2], t1_ended_at[2],
        task_restarts[1],
        task_started_at[2], task_ended_at[2], task_restarts[2],
        task_started_at[3], task_ended_at[3], task_restarts[3],
        task_started_at[4], task_ended_at[4], task_restarts[4],
        task_started_at[5], task_ended_at[5], task_restarts[5]
    );

    last_session_json = String(json_buf);
    voice_play(VOICE_DONE);
    exam_refresh_ui();

    Serial.println("\n--- [RECALL COMPLETE — CLOUD LOG] ---");
    Serial.print("SESSION_JSON:");
    Serial.println(last_session_json);
    Serial.println("-------------------------------------\n");
}

void exam_service(void)
{
    if (current_mode != MODE_EXAMINATION) return;

    unsigned long now = millis();
    if (now - last_ui_ms < 200) return;
    last_ui_ms = now;

    char t_buf[32];
    if (exam_phase == PHASE_RECORDING) {
        unsigned long elapsed = now - task_start_ms;
        unsigned long target = TASK_TARGET_MS[exam_task];
        unsigned long show = elapsed / 1000;
        unsigned long lim = target / 1000;
        if (lim > 0) snprintf(t_buf, sizeof(t_buf), "%02lu / %02lus", show, lim);
        else snprintf(t_buf, sizeof(t_buf), "%02lus", show);
    } else if (exam_phase == PHASE_COMPLETE) {
        snprintf(t_buf, sizeof(t_buf), "DONE");
    } else if (voice_is_playing()) {
        snprintf(t_buf, sizeof(t_buf), "LISTEN");
    } else {
        unsigned long lim = TASK_TARGET_MS[exam_task] / 1000;
        if (exam_task == 1) snprintf(t_buf, sizeof(t_buf), "TRY %d / 3", t1_attempt + 1);
        else if (lim > 0) snprintf(t_buf, sizeof(t_buf), "READY  %lus", lim);
        else snprintf(t_buf, sizeof(t_buf), "READY");
    }

    lvgl_port_lock(0);
    if (exam_timer_label) lv_label_set_text(exam_timer_label, t_buf);
    lvgl_port_unlock();

    bool prompt = (exam_phase == PHASE_WAIT_START && voice_is_playing());
    static bool was_prompt = false;
    if (prompt != was_prompt) {
        was_prompt = prompt;
        exam_refresh_ui();
    }
}

void exam_primary_action(void)
{
    touch_count++;
    if (exam_phase == PHASE_WAIT_START) exam_on_start();
    else if (exam_phase == PHASE_RECORDING) exam_on_done();
}

static void exam_primary_cb(lv_event_t *e)
{
    if (lv_event_get_code(e) == LV_EVENT_CLICKED) {
        primary_action_requested = true;
    }
}

static void dashboard_refresh(void)
{
    if (!dash_help_label || !dash_phone_label || !dash_exam_label) return;
    lvgl_port_lock(0);
    bool sta = wifi_sta_up();
    bool phone = WiFi.softAPgetStationNum() >= 1;
    if (dash_has_exam) {
        lv_label_set_text(dash_help_label, "You are finished.\nThe result is on the phone.\nTap Start to begin again.");
    } else if (sta || phone) {
        lv_label_set_text(dash_help_label, "Tap Start when you are ready.\nListen, speak, then tap Done.");
    } else {
        lv_label_set_text(dash_help_label, "Joining Wi-Fi.\nKeep the phone on smy_guest.");
    }
    if (sta) {
        char line[48];
        snprintf(line, sizeof(line), "%s  %s", STA_SSID, WiFi.localIP().toString().c_str());
        lv_label_set_text(dash_phone_label, line);
    } else if (phone) {
        lv_label_set_text(dash_phone_label, "Phone connected");
    } else {
        lv_label_set_text(dash_phone_label, "Joining smy_guest...");
    }
    if (!dash_has_exam) {
        lv_label_set_text(dash_exam_label, "No exam yet");
    } else {
        char line[64];
        snprintf(line, sizeof(line), "%s\nTasks finished %lu", session_id, (unsigned long)dash_last_score);
        lv_label_set_text(dash_exam_label, line);
    }
    lvgl_port_unlock();
}

void switch_mode(HardwareMode new_mode)
{
    current_mode = new_mode;

    lvgl_port_lock(0);
    if (current_mode == MODE_WHITE_START) {
        lv_obj_remove_flag(start_screen_cont, LV_OBJ_FLAG_HIDDEN);
        lv_obj_add_flag(particle_screen_cont, LV_OBJ_FLAG_HIDDEN);
        if (exam_screen_cont) lv_obj_add_flag(exam_screen_cont, LV_OBJ_FLAG_HIDDEN);
        Serial.println("[UI] Mode: WHITE_START");
        dashboard_refresh();
    } else if (current_mode == MODE_PARTICLE_CLOUD) {
        lv_obj_add_flag(start_screen_cont, LV_OBJ_FLAG_HIDDEN);
        lv_obj_remove_flag(particle_screen_cont, LV_OBJ_FLAG_HIDDEN);
        if (exam_screen_cont) lv_obj_add_flag(exam_screen_cont, LV_OBJ_FLAG_HIDDEN);
        Serial.println("[UI] Mode: OPTICAL QR CODE");
        refresh_optical_code_locked();
        lvgl_port_unlock();
        voice_play_start();
        lvgl_port_lock(0);
    } else if (current_mode == MODE_EXAMINATION) {
        lv_obj_add_flag(start_screen_cont, LV_OBJ_FLAG_HIDDEN);
        lv_obj_add_flag(particle_screen_cont, LV_OBJ_FLAG_HIDDEN);
        if (exam_screen_cont) lv_obj_remove_flag(exam_screen_cont, LV_OBJ_FLAG_HIDDEN);
        Serial.printf("[UI] Mode: RECALL EXAM for %s\n", patient_name);
        lvgl_port_unlock();
        exam_begin_session();
        lvgl_port_lock(0);
    }
    lvgl_port_unlock();
}

static void circle_start_btn_event_cb(lv_event_t *e)
{
    if (lv_event_get_code(e) == LV_EVENT_CLICKED) {
        Serial.println("[TRIGGER] Start button tapped -> optical code");
        qr_mode_requested = true;
    }
}

void init_optical_code(lv_obj_t *parent)
{
    lv_obj_t *plate = lv_obj_create(parent);
    lv_obj_set_size(plate, 200, 200);
    lv_obj_align(plate, LV_ALIGN_CENTER, 0, 22);
    lv_obj_set_style_radius(plate, 28, 0);
    lv_obj_set_style_bg_color(plate, lv_color_hex(COL_WHITE), 0);
    lv_obj_set_style_bg_opa(plate, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(plate, 3, 0);
    lv_obj_set_style_border_color(plate, lv_color_hex(COL_INK), 0);
    lv_obj_set_style_pad_all(plate, 14, 0);
    lv_obj_set_style_shadow_width(plate, 0, 0);
    lv_obj_remove_flag(plate, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_remove_flag(plate, LV_OBJ_FLAG_CLICKABLE);

    optical_qr = lv_qrcode_create(plate);
    lv_qrcode_set_size(optical_qr, 164);
    lv_qrcode_set_dark_color(optical_qr, lv_color_hex(COL_INK));
    lv_qrcode_set_light_color(optical_qr, lv_color_hex(COL_WHITE));
    lv_result_t encoded = lv_qrcode_update(optical_qr, DEVICE_OPTICAL_CODE, strlen(DEVICE_OPTICAL_CODE));
    lv_obj_center(optical_qr);
    Serial.printf("[OPTICAL] QR %s encode=%s\n", DEVICE_OPTICAL_CODE, encoded == LV_RESULT_OK ? "ok" : "fail");
}

void create_bw_ui(void)
{
    lv_obj_t *scr = lv_screen_active();
    lv_obj_set_style_bg_color(scr, lv_color_hex(COL_PAPER), 0);
    lv_obj_set_style_bg_opa(scr, LV_OPA_COVER, 0);

    start_screen_cont = lv_obj_create(scr);
    lv_obj_set_size(start_screen_cont, 360, 360);
    lv_obj_align(start_screen_cont, LV_ALIGN_CENTER, 0, 0);
    lv_obj_set_style_bg_color(start_screen_cont, lv_color_hex(COL_PAPER), 0);
    lv_obj_set_style_bg_opa(start_screen_cont, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(start_screen_cont, 0, 0);
    lv_obj_set_style_pad_all(start_screen_cont, 0, 0);
    lv_obj_remove_flag(start_screen_cont, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t *outer_ring = lv_obj_create(start_screen_cont);
    lv_obj_set_size(outer_ring, 340, 340);
    lv_obj_align(outer_ring, LV_ALIGN_CENTER, 0, 0);
    lv_obj_set_style_radius(outer_ring, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_bg_opa(outer_ring, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_color(outer_ring, lv_color_hex(COL_INK), 0);
    lv_obj_set_style_border_width(outer_ring, 3, 0);
    lv_obj_remove_flag(outer_ring, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_remove_flag(outer_ring, LV_OBJ_FLAG_CLICKABLE);

    lv_obj_t *dash_title = lv_label_create(start_screen_cont);
    lv_label_set_text(dash_title, "Dementia Dove");
    lv_obj_set_style_text_font(dash_title, &lv_font_montserrat_20, 0);
    lv_obj_set_style_text_color(dash_title, lv_color_hex(COL_INK), 0);
    lv_obj_align(dash_title, LV_ALIGN_TOP_MID, 0, 56);

    dash_help_label = lv_label_create(start_screen_cont);
    lv_obj_set_width(dash_help_label, 220);
    lv_label_set_long_mode(dash_help_label, LV_LABEL_LONG_WRAP);
    lv_obj_set_style_text_align(dash_help_label, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_set_style_text_font(dash_help_label, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(dash_help_label, lv_color_hex(COL_INK), 0);
    lv_label_set_text(dash_help_label, "Joining Wi-Fi.\nKeep the phone on smy_guest.");
    lv_obj_align(dash_help_label, LV_ALIGN_TOP_MID, 0, 100);

    dash_phone_label = lv_label_create(start_screen_cont);
    lv_obj_set_width(dash_phone_label, 220);
    lv_label_set_long_mode(dash_phone_label, LV_LABEL_LONG_WRAP);
    lv_obj_set_style_text_align(dash_phone_label, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_set_style_text_font(dash_phone_label, &lv_font_montserrat_12, 0);
    lv_obj_set_style_text_color(dash_phone_label, lv_color_hex(COL_MUTED), 0);
    lv_label_set_text(dash_phone_label, "Joining smy_guest...");
    lv_obj_align(dash_phone_label, LV_ALIGN_TOP_MID, 0, 162);

    dash_exam_label = lv_label_create(start_screen_cont);
    lv_obj_set_width(dash_exam_label, 200);
    lv_label_set_long_mode(dash_exam_label, LV_LABEL_LONG_WRAP);
    lv_obj_set_style_text_align(dash_exam_label, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_set_style_text_font(dash_exam_label, &lv_font_montserrat_12, 0);
    lv_obj_set_style_text_color(dash_exam_label, lv_color_hex(COL_MUTED), 0);
    lv_label_set_text(dash_exam_label, "No exam yet");
    lv_obj_align(dash_exam_label, LV_ALIGN_TOP_MID, 0, 184);

    lv_obj_t *dash_start_btn = lv_button_create(start_screen_cont);
    style_ink_btn(dash_start_btn, 180, 52);
    lv_obj_align(dash_start_btn, LV_ALIGN_BOTTOM_MID, 0, -84);
    lv_obj_add_event_cb(dash_start_btn, circle_start_btn_event_cb, LV_EVENT_CLICKED, NULL);
    lv_obj_t *dash_start_label = lv_label_create(dash_start_btn);
    lv_label_set_text(dash_start_label, "Start");
    lv_obj_set_style_text_font(dash_start_label, &lv_font_montserrat_16, 0);
    lv_obj_set_style_text_color(dash_start_label, lv_color_hex(COL_WHITE), 0);
    lv_obj_center(dash_start_label);

    particle_screen_cont = lv_obj_create(scr);
    lv_obj_set_size(particle_screen_cont, 360, 360);
    lv_obj_align(particle_screen_cont, LV_ALIGN_CENTER, 0, 0);
    lv_obj_set_style_bg_color(particle_screen_cont, lv_color_hex(COL_PAPER), 0);
    lv_obj_set_style_bg_opa(particle_screen_cont, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(particle_screen_cont, 0, 0);
    lv_obj_set_style_pad_all(particle_screen_cont, 0, 0);
    lv_obj_remove_flag(particle_screen_cont, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t *scan_frame = lv_obj_create(particle_screen_cont);
    lv_obj_set_size(scan_frame, 336, 336);
    lv_obj_align(scan_frame, LV_ALIGN_CENTER, 0, 0);
    lv_obj_set_style_radius(scan_frame, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_bg_opa(scan_frame, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_color(scan_frame, lv_color_hex(COL_INK), 0);
    lv_obj_set_style_border_width(scan_frame, 3, 0);
    lv_obj_remove_flag(scan_frame, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t *accent_ring = lv_obj_create(particle_screen_cont);
    lv_obj_set_size(accent_ring, 248, 248);
    lv_obj_align(accent_ring, LV_ALIGN_CENTER, 0, 22);
    lv_obj_set_style_radius(accent_ring, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_bg_opa(accent_ring, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_color(accent_ring, lv_color_hex(COL_ACCENT), 0);
    lv_obj_set_style_border_width(accent_ring, 3, 0);
    lv_obj_remove_flag(accent_ring, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_remove_flag(accent_ring, LV_OBJ_FLAG_CLICKABLE);

    init_optical_code(particle_screen_cont);

    lv_obj_t *qr_help = lv_label_create(particle_screen_cont);
    lv_label_set_text(qr_help, "Show this code");
    lv_obj_set_style_text_font(qr_help, &lv_font_montserrat_16, 0);
    lv_obj_set_style_text_color(qr_help, lv_color_hex(COL_INK), 0);
    lv_obj_align(qr_help, LV_ALIGN_TOP_MID, 0, 28);

    lv_obj_t *qr_wait = lv_label_create(particle_screen_cont);
    lv_label_set_text(qr_wait, "Then wait for the exam.");
    lv_obj_set_style_text_font(qr_wait, &lv_font_montserrat_12, 0);
    lv_obj_set_style_text_color(qr_wait, lv_color_hex(COL_MUTED), 0);
    lv_obj_align(qr_wait, LV_ALIGN_TOP_MID, 0, 50);

    qr_ip_label = lv_label_create(particle_screen_cont);
    lv_label_set_text(qr_ip_label, "joining smy_guest");
    lv_obj_set_style_text_font(qr_ip_label, &lv_font_montserrat_12, 0);
    lv_obj_set_style_text_color(qr_ip_label, lv_color_hex(COL_MUTED), 0);
    lv_obj_align(qr_ip_label, LV_ALIGN_TOP_MID, 0, 68);

    exam_screen_cont = lv_obj_create(scr);
    lv_obj_set_size(exam_screen_cont, 360, 360);
    lv_obj_align(exam_screen_cont, LV_ALIGN_CENTER, 0, 0);
    lv_obj_set_style_bg_color(exam_screen_cont, lv_color_hex(COL_PAPER), 0);
    lv_obj_set_style_bg_opa(exam_screen_cont, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(exam_screen_cont, 0, 0);
    lv_obj_set_style_pad_all(exam_screen_cont, 0, 0);
    lv_obj_remove_flag(exam_screen_cont, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t *exam_ring = lv_obj_create(exam_screen_cont);
    lv_obj_set_size(exam_ring, 340, 340);
    lv_obj_align(exam_ring, LV_ALIGN_CENTER, 0, 0);
    lv_obj_set_style_radius(exam_ring, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_bg_opa(exam_ring, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_color(exam_ring, lv_color_hex(COL_INK), 0);
    lv_obj_set_style_border_width(exam_ring, 3, 0);
    lv_obj_remove_flag(exam_ring, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t *exam_status_pill = lv_obj_create(exam_screen_cont);
    lv_obj_set_size(exam_status_pill, 168, 28);
    lv_obj_align(exam_status_pill, LV_ALIGN_TOP_MID, 0, 18);
    lv_obj_set_style_radius(exam_status_pill, 12, 0);
    lv_obj_set_style_bg_color(exam_status_pill, lv_color_hex(COL_ACCENT), 0);
    lv_obj_set_style_border_width(exam_status_pill, 3, 0);
    lv_obj_set_style_border_color(exam_status_pill, lv_color_hex(COL_INK), 0);
    lv_obj_set_style_pad_all(exam_status_pill, 0, 0);
    lv_obj_remove_flag(exam_status_pill, LV_OBJ_FLAG_SCROLLABLE);

    exam_status_label = lv_label_create(exam_status_pill);
    lv_label_set_text(exam_status_label, "Dementia Dove");
    lv_obj_set_style_text_font(exam_status_label, &lv_font_montserrat_10, 0);
    lv_obj_set_style_text_color(exam_status_label, lv_color_hex(COL_WHITE), 0);
    lv_obj_center(exam_status_label);

    exam_session_label = lv_label_create(exam_screen_cont);
    lv_label_set_text(exam_session_label, session_id);
    lv_obj_set_style_text_font(exam_session_label, &lv_font_montserrat_12, 0);
    lv_obj_set_style_text_color(exam_session_label, lv_color_hex(COL_INK), 0);
    lv_obj_align(exam_session_label, LV_ALIGN_TOP_MID, 0, 52);

    exam_task_label = lv_label_create(exam_screen_cont);
    lv_label_set_text(exam_task_label, TASK_TITLES[0]);
    lv_obj_set_style_text_font(exam_task_label, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(exam_task_label, lv_color_hex(COL_INK), 0);
    lv_obj_align(exam_task_label, LV_ALIGN_TOP_MID, 0, 74);

    exam_instruction_label = lv_label_create(exam_screen_cont);
    lv_obj_set_width(exam_instruction_label, 236);
    lv_label_set_long_mode(exam_instruction_label, LV_LABEL_LONG_WRAP);
    lv_obj_set_style_text_align(exam_instruction_label, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_set_style_text_font(exam_instruction_label, &lv_font_montserrat_12, 0);
    lv_obj_set_style_text_color(exam_instruction_label, lv_color_hex(COL_MUTED), 0);
    lv_label_set_text(exam_instruction_label, TASK_INSTRUCTIONS[0]);
    lv_obj_align(exam_instruction_label, LV_ALIGN_TOP_MID, 0, 98);

    exam_timer_label = lv_label_create(exam_screen_cont);
    lv_label_set_text(exam_timer_label, "READY  10s");
    lv_obj_set_style_text_font(exam_timer_label, &lv_font_montserrat_20, 0);
    lv_obj_set_style_text_color(exam_timer_label, lv_color_hex(COL_INK), 0);
    lv_obj_align(exam_timer_label, LV_ALIGN_CENTER, 0, 18);

    create_exam_picture(exam_screen_cont);

    exam_primary_btn = lv_button_create(exam_screen_cont);
    style_ink_btn(exam_primary_btn, 148, 44);
    lv_obj_align(exam_primary_btn, LV_ALIGN_BOTTOM_MID, 0, -80);
    lv_obj_add_event_cb(exam_primary_btn, exam_primary_cb, LV_EVENT_CLICKED, NULL);
    exam_primary_label = lv_label_create(exam_primary_btn);
    lv_label_set_text(exam_primary_label, "START");
    lv_obj_set_style_text_font(exam_primary_label, &lv_font_montserrat_16, 0);
    lv_obj_set_style_text_color(exam_primary_label, lv_color_hex(COL_WHITE), 0);
    lv_obj_center(exam_primary_label);

    exam_complete_badge = lv_obj_create(exam_screen_cont);
    lv_obj_set_size(exam_complete_badge, 168, 44);
    lv_obj_align(exam_complete_badge, LV_ALIGN_BOTTOM_MID, 0, -80);
    lv_obj_set_style_radius(exam_complete_badge, 14, 0);
    lv_obj_set_style_bg_color(exam_complete_badge, lv_color_hex(COL_ACCENT), 0);
    lv_obj_set_style_border_color(exam_complete_badge, lv_color_hex(COL_INK), 0);
    lv_obj_set_style_border_width(exam_complete_badge, 3, 0);
    lv_obj_remove_flag(exam_complete_badge, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_flag(exam_complete_badge, LV_OBJ_FLAG_HIDDEN);
    exam_complete_label = lv_label_create(exam_complete_badge);
    lv_label_set_text(exam_complete_label, "EXAM COMPLETE");
    lv_obj_set_style_text_font(exam_complete_label, &lv_font_montserrat_12, 0);
    lv_obj_set_style_text_color(exam_complete_label, lv_color_hex(COL_WHITE), 0);
    lv_obj_center(exam_complete_label);

    switch_mode(MODE_WHITE_START);
}

void setup()
{
    Serial.setTxBufferSize(4096);
    Serial.begin(115200);
    delay(400);
    Serial.println("\n==============================================");
    Serial.println("  Dementia Dove speech exam — six tasks, cloud log");
    Serial.println("==============================================\n");

    pinMode(PHYSICAL_BUTTON_PIN, INPUT_PULLUP);
    prefs.begin("recall", false);

    I2C_Init();
    voice_init();
    TCA9554PWR_Init(0x00);
    Backlight_Init();
    LCD_Init();
    Lvgl_Init();
    Set_Backlight(90);

    lvgl_port_lock(0);
    create_bw_ui();
    lvgl_port_unlock();

    setup_wifi_sync_server();
    Serial.println("[SETUP] System Ready!");
}

void loop()
{
    poll_serial_commands();
    wifi_service();
    server.handleClient();

    if (qr_mode_requested) {
        qr_mode_requested = false;
        switch_mode(MODE_PARTICLE_CLOUD);
    }

    if (exam_start_requested) {
        exam_start_requested = false;
        Serial.println("[EXAMINATION] Phone paired — starting RECALL");
        switch_mode(MODE_EXAMINATION);
    }

    if (primary_action_requested) {
        primary_action_requested = false;
        exam_primary_action();
    }

    voice_service();
    voice_capture_service();
    server.handleClient();
    exam_service();

    static unsigned long last_dash_ms = 0;
    if (current_mode == MODE_WHITE_START && millis() - last_dash_ms >= 1000) {
        last_dash_ms = millis();
        dashboard_refresh();
    }

    if (current_mode == MODE_EXAMINATION && exam_completed && exam_finish_time_ms > 0) {
        if (!voice_is_playing() && millis() - exam_finish_time_ms > 5000) {
            exam_finish_time_ms = 0;
            switch_mode(MODE_WHITE_START);
        }
    }

    static unsigned long last_button_press = 0;
    static int last_button_state = HIGH;
    int reading = digitalRead(PHYSICAL_BUTTON_PIN);
    if (reading == LOW && last_button_state == HIGH && (millis() - last_button_press > 250)) {
        last_button_press = millis();
        button_count++;
        if (current_mode == MODE_WHITE_START) {
            switch_mode(MODE_PARTICLE_CLOUD);
        } else if (current_mode == MODE_PARTICLE_CLOUD) {
            request_exam_from_phone();
        } else if (current_mode == MODE_EXAMINATION) {
            exam_primary_action();
        }
    }
    last_button_state = reading;
    delay(5);
}
