export type ChatRole = 'bot' | 'user';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
}

export const CHAT_STARTERS = [
  { label: 'Start the exam', text: 'How do I start the exam?' },
  { label: 'Six tasks', text: 'What are the six tasks?' },
  { label: 'Task T2', text: 'What is on the screen for T2?' },
  { label: 'Caregivers', text: 'Find a caregiver' },
];

function includesAny(text: string, needles: string[]) {
  return needles.some((needle) => text.includes(needle));
}

export function replyToPatient(input: string, isPaired: boolean, name = 'Omar'): string {
  const query = input.toLowerCase().trim();

  if (includesAny(query, ['hello', 'hi', 'hey', 'good morning', 'good afternoon'])) {
    return `Hi ${name}. I can walk you through the Dementia Dove exam, pairing, caregivers, groups, or mind games. What do you need?`;
  }

  if (includesAny(query, ['pair', 'scan', 'qr', 'code', 'lab'])) {
    return isPaired
      ? 'You are already paired. Put the phone away and follow Start / Done on the round screen.'
      : 'Open Screen and stay on Screening. Point the camera at the particle code on the device, and wait for a match. The spoken exam starts by itself after a valid scan.';
  }

  if (includesAny(query, ['t0', 'quiet', 'room tone', 'noise'])) {
    return 'T0 is room tone. Stay silent for about 10 seconds. Tap Start, stay quiet, then tap Done.';
  }

  if (includesAny(query, ['t1', 'ahh', 'vowel', 'sustain'])) {
    return 'T1 is a sustained “ahh”. Do it three times. Tap Start, hold the sound, tap Done, then repeat.';
  }

  if (includesAny(query, ['t2', 'sentence', 'read', 'baker', 'bread'])) {
    return 'T2 is read-aloud. The sentence is on the round screen: “The young baker set warm bread beside the open window.” Read it out loud, then tap Done.';
  }

  if (includesAny(query, ['t3', 'picture', 'house', 'describe', 'image'])) {
    return 'T3 shows a small picture on the device: a house, a tree, a sun, and a person. Describe everything you see, then tap Done.';
  }

  if (includesAny(query, ['t4', 'animal', 'fluency'])) {
    return 'T4 is verbal fluency. Name as many animals as you can for 60 seconds. Tap Start, keep going, then tap Done.';
  }

  if (includesAny(query, ['t5', 'story', 'narrative', 'day'])) {
    return 'T5 is a 60-second story from your day. Tap Start, talk until you are finished or time is up, then tap Done.';
  }

  if (includesAny(query, ['six', 'task', 'exam', 'recall', 'prompt', 'voice'])) {
    return 'Dementia Dove is six self-guided speaking tasks in order: quiet (T0), ahh ×3 (T1), read the on-screen sentence (T2), describe the on-screen picture (T3), animals (T4), then a short story (T5). Follow the voice and tap Start then Done.';
  }

  if (includesAny(query, ['support group', 'support groups', 'care circle', 'groups'])) {
    return 'Open Groups. The care circle is family and caregivers you add on this phone. A support group appears only after someone creates it, and then other people on the app can join.';
  }

  if (includesAny(query, ['clinic', 'doctor', 'caregiver', 'map', 'appointment', 'near'])) {
    return 'Open Nearby. It lists dementia caregivers around you, shows them on a map, and lets you book a time slot.';
  }

  if (includesAny(query, ['game', 'memory', 'mind', 'puzzle'])) {
    return 'Mind Games has three short drills: Memory Match, Sequence, and Animal Scramble. Open them from Dashboard. They stay on this phone and do not change the hardware exam.';
  }

  if (includesAny(query, ['usb', 'cloud', 'session', 'result', 'score'])) {
    return 'Keep USB plugged into the computer running the app relay. When you finish T5, the session is saved under Screen, on Progress. No SD card is used.';
  }

  if (includesAny(query, ['thank'])) {
    return 'Glad to help. Tap Start on the device when you are ready.';
  }

  return 'I can help with pairing, each Dementia Dove task, caregivers, groups, or mind games. Try “How do I start the exam?” or “What is T2?”';
}
