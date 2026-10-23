export type ChatRole = 'bot' | 'user';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
}

export const CHAT_STARTERS = [
  'How do I start the exam?',
  'What are the six tasks?',
  'What is on the screen for T2?',
  'Find a clinic',
];

function includesAny(hay: string, needles: string[]) {
  return needles.some((n) => hay.includes(n));
}

export function replyToPatient(input: string, isPaired: boolean): string {
  const q = input.toLowerCase().trim();

  if (includesAny(q, ['hello', 'hi', 'hey', 'good morning', 'good afternoon'])) {
    return 'Hi Omar. I can walk you through the RECALL exam, pairing, clinics, or mind games. What do you need?';
  }

  if (includesAny(q, ['pair', 'scan', 'qr', 'code', 'lab'])) {
    return isPaired
      ? 'You are already paired. Put the phone away and follow Start / Done on the round screen.'
      : 'Open Lab, point the camera at the particle code on the device, and wait for a match. The spoken exam starts by itself after a valid scan.';
  }

  if (includesAny(q, ['t0', 'quiet', 'room tone', 'noise'])) {
    return 'T0 is room tone. Stay silent for about 10 seconds. Tap Start, stay quiet, then tap Done.';
  }

  if (includesAny(q, ['t1', 'ahh', 'vowel', 'sustain'])) {
    return 'T1 is a sustained “ahh”. Do it three times. Tap Start, hold the sound, tap Done, then repeat.';
  }

  if (includesAny(q, ['t2', 'sentence', 'read', 'baker', 'bread'])) {
    return 'T2 is read-aloud. The sentence is on the round screen: “The young baker set warm bread beside the open window.” Read it out loud, then tap Done.';
  }

  if (includesAny(q, ['t3', 'picture', 'house', 'describe', 'image'])) {
    return 'T3 shows a small picture on the device: a house, a tree, a sun, and a person. Describe everything you see, then tap Done.';
  }

  if (includesAny(q, ['t4', 'animal', 'fluency'])) {
    return 'T4 is verbal fluency. Name as many animals as you can for 60 seconds. Tap Start, keep going, then tap Done.';
  }

  if (includesAny(q, ['t5', 'story', 'narrative', 'day'])) {
    return 'T5 is a 60-second story from your day. Tap Start, talk until you are finished or time is up, then tap Done.';
  }

  if (includesAny(q, ['six', 'task', 'exam', 'recall', 'prompt', 'voice'])) {
    return 'RECALL is six self-guided speaking tasks in order: quiet (T0), ahh ×3 (T1), read the on-screen sentence (T2), describe the on-screen picture (T3), animals (T4), then a short story (T5). Follow the voice and tap Start then Done.';
  }

  if (includesAny(q, ['clinic', 'doctor', 'map', 'appointment', 'near'])) {
    return 'Open the Clinics tab. It uses your location to list nearby clinics, show them on a map, and let you book a time slot.';
  }

  if (includesAny(q, ['game', 'memory', 'mind', 'puzzle'])) {
    return 'Mind Games has three short drills: Memory Match, Sequence, and Animal Scramble. They are on-phone only and do not change the hardware exam.';
  }

  if (includesAny(q, ['usb', 'cloud', 'session', 'result', 'score'])) {
    return 'Keep USB plugged into the computer running the app relay. When you finish T5, a RECALL session log is saved to Analytics. No SD card is used.';
  }

  if (includesAny(q, ['thank'])) {
    return 'Glad to help. Tap Start on the device when you are ready.';
  }

  return 'I can help with pairing, each RECALL task, clinics, or mind games. Try “How do I start the exam?” or “What is T2?”';
}
