import modelJson from './model.json';
import { VoiceConfidence, VoiceFeatures } from '../../types/session';
import { extractFeatures } from './features';

interface VoiceModelFile {
  gamma: number;
  intercept: number;
  probA: number;
  probB: number;
  mean: number[];
  scale: number[];
  dualCoef: number[];
  supportVectors: number[][];
}

const model = modelJson as VoiceModelFile;

export interface VoiceScore {
  prediction: 'Healthy' | 'At risk of dementia';
  confidence: VoiceConfidence;
  features: VoiceFeatures;
  decision: number;
}

export function pcmFromWav(bytes: Uint8Array): Float64Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let dataOffset = 44;
  let dataSize = Math.max(0, bytes.byteLength - 44);
  while (offset + 8 <= bytes.byteLength) {
    const id = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
    const size = view.getUint32(offset + 4, true);
    if (id === 'data') {
      dataOffset = offset + 8;
      dataSize = size;
      break;
    }
    if (size === 0 || offset + 8 + size > bytes.byteLength) break;
    offset += 8 + size;
  }
  // The RIFF size can claim more samples than we actually received. Clamp so we never read past the buffer.
  const availableBytes = Math.max(0, bytes.byteLength - dataOffset);
  const safeBytes = Math.min(dataSize, availableBytes);
  const samples = Math.floor(safeBytes / 2);
  const pcm = new Float64Array(samples);
  for (let i = 0; i < samples; i++) {
    pcm[i] = view.getInt16(dataOffset + i * 2, true) / 32768;
  }
  return pcm;
}

export function scorePcm(pcm: Float64Array): VoiceScore {
  const raw = extractFeatures(pcm, 16000);
  const scaled = raw.map((value, index) => {
    const safe = Number.isFinite(value) ? value : 0;
    const spread = model.scale[index] || 1;
    return (safe - model.mean[index]) / spread;
  });
  let decision = model.intercept;
  for (let i = 0; i < model.dualCoef.length; i++) {
    const vector = model.supportVectors[i];
    let distance = 0;
    for (let j = 0; j < scaled.length; j++) {
      const diff = scaled[j] - vector[j];
      distance += diff * diff;
    }
    decision += model.dualCoef[i] * Math.exp(-model.gamma * distance);
  }
  const healthy = 1 / (1 + Math.exp(model.probA * -decision + model.probB));
  const alzheimer = 1 - healthy;
  const byName = (name: string) => raw[(modelJson as { featureNames: string[] }).featureNames.indexOf(name)] || 0;
  return {
    prediction: decision > 0 ? 'At risk of dementia' : 'Healthy',
    confidence: {
      healthy: Math.round(healthy * 1000) / 10,
      alzheimer: Math.round(alzheimer * 1000) / 10,
    },
    features: {
      duration: Math.round(byName('duration') * 100) / 100,
      pause_count: Math.round(byName('pause_count')),
      speech_rate: Math.round(byName('speech_rate_estimate') * 100) / 100,
      pitch_mean: Math.round(byName('pitch_mean') * 10) / 10,
      silence_ratio: Math.round(byName('silence_ratio') * 1000) / 10,
    },
    decision,
  };
}

export function scoreWavBytes(bytes: Uint8Array): VoiceScore {
  return scorePcm(pcmFromWav(bytes));
}
