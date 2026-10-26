#pragma once

#include <stddef.h>
#include <stdint.h>

enum VoiceClip {
    VOICE_SCAN = 0,
    VOICE_WELCOME,
    VOICE_T0,
    VOICE_T1,
    VOICE_T2,
    VOICE_T3,
    VOICE_T4,
    VOICE_T5,
    VOICE_DONE,
    VOICE_CLIP_COUNT
};

void voice_init(void);
void voice_stop(void);
void voice_play(VoiceClip clip);
void voice_play_start(void);
void voice_play_welcome(void);
void voice_play_task(int task_index);
void voice_service(void);
bool voice_is_playing(void);

void voice_capture_reset(void);
void voice_capture_begin(void);
void voice_capture_service(void);
void voice_capture_end(void);
bool voice_capture_truncated(void);
size_t voice_capture_pcm_bytes(void);
const uint8_t *voice_capture_wav(size_t *nbytes);
