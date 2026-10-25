#include "Audio_Voice.h"

#include <Arduino.h>
#include <esp_heap_caps.h>
#include <string.h>
#include "ESP_I2S.h"
#include "es8311.h"
#include "voice_scan_pcm.h"
#include "voice_welcome_pcm.h"
#include "voice_t0_pcm.h"
#include "voice_t1_pcm.h"
#include "voice_t2_pcm.h"
#include "voice_t3_pcm.h"
#include "voice_t4_pcm.h"
#include "voice_t5_pcm.h"
#include "voice_done_pcm.h"

#define I2S_MCK_PIN GPIO_NUM_2
#define I2S_BCK_PIN GPIO_NUM_48
#define I2S_LRCK_PIN GPIO_NUM_38
#define I2S_DOUT_PIN GPIO_NUM_47
#define I2S_DIN_PIN GPIO_NUM_39
#define PA_ENABLE_PIN 15

#define VOICE_SAMPLE_RATE 24000
#define VOICE_MCLK_HZ (VOICE_SAMPLE_RATE * 256)
#define VOICE_VOLUME 70
#define VOICE_CHUNK 1024
#define VOICE_QMAX 4
#define CAPTURE_RATE 16000
#define CAPTURE_MAX_SECONDS 150
#define CAPTURE_MAX_PCM (CAPTURE_RATE * 2 * CAPTURE_MAX_SECONDS)

static I2SClass voice_i2s;
static es8311_handle_t es_dev = NULL;
static bool voice_ready = false;
static bool cap_on = false;
static bool cap_truncated = false;
static uint8_t *cap_buf = NULL;
static size_t cap_pcm = 0;
static uint8_t cap_pending = 0;
static bool cap_has_pending = false;
static const uint8_t *voice_ptr = NULL;
static size_t voice_left = 0;

static const uint8_t *q_ptr[VOICE_QMAX];
static size_t q_len[VOICE_QMAX];
static int q_head = 0;
static int q_tail = 0;
static int q_count = 0;

static void clip_data(VoiceClip clip, const uint8_t **data, unsigned *len)
{
    switch (clip) {
        case VOICE_SCAN: *data = voice_scan_pcm; *len = voice_scan_pcm_len; break;
        case VOICE_WELCOME: *data = voice_welcome_pcm; *len = voice_welcome_pcm_len; break;
        case VOICE_T0: *data = voice_t0_pcm; *len = voice_t0_pcm_len; break;
        case VOICE_T1: *data = voice_t1_pcm; *len = voice_t1_pcm_len; break;
        case VOICE_T2: *data = voice_t2_pcm; *len = voice_t2_pcm_len; break;
        case VOICE_T3: *data = voice_t3_pcm; *len = voice_t3_pcm_len; break;
        case VOICE_T4: *data = voice_t4_pcm; *len = voice_t4_pcm_len; break;
        case VOICE_T5: *data = voice_t5_pcm; *len = voice_t5_pcm_len; break;
        case VOICE_DONE: *data = voice_done_pcm; *len = voice_done_pcm_len; break;
        default: *data = NULL; *len = 0; break;
    }
}

static void enqueue(const uint8_t *data, unsigned len)
{
    if (!data || len == 0 || q_count >= VOICE_QMAX) return;
    q_ptr[q_tail] = data;
    q_len[q_tail] = len;
    q_tail = (q_tail + 1) % VOICE_QMAX;
    q_count++;
}

static void start_buffer(const uint8_t *data, unsigned len)
{
    voice_ptr = data;
    voice_left = len;
}

static bool i2s_start(uint32_t rate)
{
    voice_ptr = NULL;
    voice_left = 0;
    q_head = q_tail = q_count = 0;
    if (voice_ready) {
        voice_i2s.end();
        voice_ready = false;
    }
    if (!es_dev) return false;
    if (es8311_sample_frequency_config(es_dev, (int)(rate * 256), (int)rate) != ESP_OK) {
        Serial.println("[VOICE] sample rate change failed");
        return false;
    }
    es8311_microphone_config(es_dev, false);
    es8311_microphone_gain_set(es_dev, ES8311_MIC_GAIN_24DB);
    es8311_voice_volume_set(es_dev, VOICE_VOLUME, NULL);
    es8311_voice_mute(es_dev, false);
    voice_i2s.setPins(I2S_BCK_PIN, I2S_LRCK_PIN, I2S_DOUT_PIN, I2S_DIN_PIN, I2S_MCK_PIN);
    if (!voice_i2s.begin(I2S_MODE_STD, rate, I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO, I2S_STD_SLOT_LEFT)) {
        Serial.println("[VOICE] I2S init failed");
        return false;
    }
    voice_i2s.setTimeout(8);
    voice_ready = true;
    return true;
}

static void write_wav_header(uint8_t *dst, uint32_t pcm_bytes)
{
    uint32_t rate = CAPTURE_RATE;
    uint16_t channels = 1;
    uint16_t bits = 16;
    uint32_t byte_rate = rate * channels * bits / 8;
    uint16_t block = channels * bits / 8;
    uint32_t chunk = 36 + pcm_bytes;
    uint32_t fmt_size = 16;
    uint16_t audio_fmt = 1;
    memcpy(dst, "RIFF", 4);
    memcpy(dst + 4, &chunk, 4);
    memcpy(dst + 8, "WAVE", 4);
    memcpy(dst + 12, "fmt ", 4);
    memcpy(dst + 16, &fmt_size, 4);
    memcpy(dst + 20, &audio_fmt, 2);
    memcpy(dst + 22, &channels, 2);
    memcpy(dst + 24, &rate, 4);
    memcpy(dst + 28, &byte_rate, 4);
    memcpy(dst + 32, &block, 2);
    memcpy(dst + 34, &bits, 2);
    memcpy(dst + 36, "data", 4);
    memcpy(dst + 40, &pcm_bytes, 4);
}

void voice_init(void)
{
    pinMode(PA_ENABLE_PIN, OUTPUT);
    digitalWrite(PA_ENABLE_PIN, HIGH);

    es8311_handle_t es = es8311_create(I2C_NUM_0, ES8311_ADDRRES_0);
    if (!es) {
        Serial.println("[VOICE] ES8311 create failed");
        return;
    }

    es8311_clock_config_t clk = {
        .mclk_inverted = false,
        .sclk_inverted = false,
        .mclk_from_mclk_pin = true,
        .mclk_frequency = VOICE_MCLK_HZ,
        .sample_frequency = VOICE_SAMPLE_RATE
    };

    if (es8311_init(es, &clk, ES8311_RESOLUTION_16, ES8311_RESOLUTION_16) != ESP_OK) {
        Serial.println("[VOICE] ES8311 init failed");
        return;
    }
    es8311_voice_volume_set(es, VOICE_VOLUME, NULL);
    es8311_microphone_config(es, false);
    es8311_microphone_gain_set(es, ES8311_MIC_GAIN_24DB);
    es8311_voice_mute(es, false);
    es_dev = es;
    if (!i2s_start(VOICE_SAMPLE_RATE)) return;

    Serial.println("[VOICE] Speaker ready (ElevenLabs clips)");
}

void voice_stop(void)
{
    voice_ptr = NULL;
    voice_left = 0;
    q_head = q_tail = q_count = 0;
}

void voice_play(VoiceClip clip)
{
    if (!voice_ready) return;
    const uint8_t *data = NULL;
    unsigned len = 0;
    clip_data(clip, &data, &len);
    if (!data || !len) return;
    Serial.printf("[VOICE] play clip %d (%u bytes)\n", (int)clip, len);
    if (voice_left == 0) {
        start_buffer(data, len);
    } else {
        enqueue(data, len);
    }
}

void voice_play_start(void)
{
    voice_stop();
    voice_play(VOICE_SCAN);
}

void voice_play_welcome(void)
{
    voice_stop();
    voice_play(VOICE_WELCOME);
}

void voice_play_task(int task_index)
{
    VoiceClip clip = VOICE_T0;
    if (task_index == 1) clip = VOICE_T1;
    else if (task_index == 2) clip = VOICE_T2;
    else if (task_index == 3) clip = VOICE_T3;
    else if (task_index == 4) clip = VOICE_T4;
    else if (task_index == 5) clip = VOICE_T5;
    else if (task_index >= 6) clip = VOICE_DONE;
    voice_play(clip);
}

bool voice_is_playing(void)
{
    return voice_ready && (voice_left > 0 || q_count > 0);
}

void voice_service(void)
{
    if (!voice_ready || cap_on) return;
    if (voice_left == 0) {
        if (q_count == 0) return;
        start_buffer(q_ptr[q_head], q_len[q_head]);
        q_head = (q_head + 1) % VOICE_QMAX;
        q_count--;
    }
    size_t n = voice_left > VOICE_CHUNK ? VOICE_CHUNK : voice_left;
    size_t wrote = voice_i2s.write(voice_ptr, n);
    if (wrote == 0) return;
    voice_ptr += wrote;
    voice_left -= wrote;
}

void voice_capture_reset(void)
{
    cap_on = false;
    cap_truncated = false;
    cap_pcm = 0;
    cap_has_pending = false;
}

void voice_capture_begin(void)
{
    if (!es_dev) return;
    if (!cap_buf) {
        cap_buf = (uint8_t *)heap_caps_malloc(44 + CAPTURE_MAX_PCM, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
        if (!cap_buf) {
            Serial.println("[VOICE] capture buffer alloc failed");
            return;
        }
    }
    if (cap_pcm >= CAPTURE_MAX_PCM) {
        cap_truncated = true;
        return;
    }
    if (!i2s_start(CAPTURE_RATE)) return;
    cap_on = true;
    Serial.println("[VOICE] capture start");
}

void voice_capture_service(void)
{
    if (!cap_on || !cap_buf || !voice_ready) return;
    for (int spin = 0; spin < 8; spin++) {
        if (cap_pcm >= CAPTURE_MAX_PCM) {
            cap_truncated = true;
            return;
        }
        uint8_t tmp[1024];
        uint8_t joined[1025];
        size_t n = voice_i2s.readBytes((char *)tmp, sizeof(tmp));
        if (n == 0 && !cap_has_pending) return;
        size_t count = 0;
        if (cap_has_pending) {
            joined[count++] = cap_pending;
            cap_has_pending = false;
        }
        if (n > sizeof(tmp)) n = sizeof(tmp);
        memcpy(joined + count, tmp, n);
        count += n;
        if (count & 1u) {
            cap_pending = joined[count - 1];
            cap_has_pending = true;
            count--;
        }
        if (count == 0) return;
        size_t room = CAPTURE_MAX_PCM - cap_pcm;
        if (count > room) {
            count = room & ~((size_t)1);
            cap_truncated = true;
        }
        if (count == 0) return;
        memcpy(cap_buf + 44 + cap_pcm, joined, count);
        cap_pcm += count;
        if (n < sizeof(tmp)) return;
    }
}

void voice_capture_end(void)
{
    if (!cap_on && !es_dev) return;
    bool was = cap_on;
    cap_on = false;
    cap_pcm &= ~((size_t)1);
    cap_has_pending = false;
    if (was) Serial.printf("[VOICE] capture pause %u bytes\n", (unsigned)cap_pcm);
    i2s_start(VOICE_SAMPLE_RATE);
}

bool voice_capture_truncated(void)
{
    return cap_truncated;
}

size_t voice_capture_pcm_bytes(void)
{
    return cap_pcm;
}

const uint8_t *voice_capture_wav(size_t *nbytes)
{
    if (!cap_buf || cap_pcm < 2) {
        if (nbytes) *nbytes = 0;
        return NULL;
    }
    write_wav_header(cap_buf, (uint32_t)cap_pcm);
    if (nbytes) *nbytes = 44 + cap_pcm;
    return cap_buf;
}
