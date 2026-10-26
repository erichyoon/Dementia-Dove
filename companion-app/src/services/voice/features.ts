const N_FFT = 2048;
const HOP = 512;
const N_MELS = 128;
const SR = 16000;

const hann = new Float64Array(N_FFT);
for (let i = 0; i < N_FFT; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N_FFT);

const melWeights = buildMelWeights(SR, N_FFT, N_MELS);

function buildMelWeights(sr: number, nFft: number, nMels: number): Float64Array[] {
  const nFreqs = nFft / 2 + 1;
  const fftFreqs = new Float64Array(nFreqs);
  for (let i = 0; i < nFreqs; i++) fftFreqs[i] = (i * sr) / nFft;
  const minMel = hzToMel(0);
  const maxMel = hzToMel(sr / 2);
  const melF = new Float64Array(nMels + 2);
  for (let i = 0; i < melF.length; i++) {
    melF[i] = melToHz(minMel + ((maxMel - minMel) * i) / (nMels + 1));
  }
  const weights: Float64Array[] = [];
  for (let m = 0; m < nMels; m++) {
    const row = new Float64Array(nFreqs);
    const lowerStep = melF[m + 1] - melF[m];
    const upperStep = melF[m + 2] - melF[m + 1];
    for (let k = 0; k < nFreqs; k++) {
      const lower = (fftFreqs[k] - melF[m]) / lowerStep;
      const upper = (melF[m + 2] - fftFreqs[k]) / upperStep;
      row[k] = Math.max(0, Math.min(lower, upper));
    }
    const enorm = 2 / (melF[m + 2] - melF[m]);
    for (let k = 0; k < nFreqs; k++) row[k] *= enorm;
    weights.push(row);
  }
  return weights;
}

function hzToMel(hz: number): number {
  const fSp = 200 / 3;
  const minLogHz = 1000;
  const minLogMel = minLogHz / fSp;
  const logstep = Math.log(6.4) / 27;
  if (hz < minLogHz) return hz / fSp;
  return minLogMel + Math.log(hz / minLogHz) / logstep;
}

function melToHz(mel: number): number {
  const fSp = 200 / 3;
  const minLogHz = 1000;
  const minLogMel = minLogHz / fSp;
  const logstep = Math.log(6.4) / 27;
  if (mel < minLogMel) return mel * fSp;
  return minLogHz * Math.exp(logstep * (mel - minLogMel));
}

// Twiddles and bit-reversal are built once so each STFT frame skips a table rebuild.
const cosTable = new Float64Array(N_FFT / 2);
const sinTable = new Float64Array(N_FFT / 2);
for (let i = 0; i < N_FFT / 2; i++) {
  const ang = (-2 * Math.PI * i) / N_FFT;
  cosTable[i] = Math.cos(ang);
  sinTable[i] = Math.sin(ang);
}

const bitRev = new Uint16Array(N_FFT);
for (let i = 0; i < N_FFT; i++) {
  let rev = 0;
  let x = i;
  for (let b = 1; b < N_FFT; b <<= 1) {
    rev = (rev << 1) | (x & 1);
    x >>= 1;
  }
  bitRev[i] = rev;
}

function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 0; i < n; i++) {
    const j = bitRev[i];
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const step = n / len;
    for (let i = 0; i < n; i += len) {
      for (let j = 0, k = 0; j < half; j++, k += step) {
        const wRe = cosTable[k];
        const wIm = sinTable[k];
        const uRe = re[i + j];
        const uIm = im[i + j];
        const vRe = re[i + j + half] * wRe - im[i + j + half] * wIm;
        const vIm = re[i + j + half] * wIm + im[i + j + half] * wRe;
        re[i + j] = uRe + vRe;
        im[i + j] = uIm + vIm;
        re[i + j + half] = uRe - vRe;
        im[i + j + half] = uIm - vIm;
      }
    }
  }
}

function ifft(re: Float64Array, im: Float64Array) {
  for (let i = 0; i < im.length; i++) im[i] = -im[i];
  fft(re, im);
  const n = re.length;
  for (let i = 0; i < n; i++) {
    re[i] /= n;
    im[i] = -im[i] / n;
  }
}

interface Frame {
  power: Float64Array;
  mag: Float64Array;
}

function stft(y: Float64Array): Frame[] {
  const nFrames = 1 + Math.floor(y.length / HOP);
  const frames: Frame[] = [];
  const re = new Float64Array(N_FFT);
  const im = new Float64Array(N_FFT);
  for (let t = 0; t < nFrames; t++) {
    const start = t * HOP - N_FFT / 2;
    for (let i = 0; i < N_FFT; i++) {
      const index = start + i;
      const sample = index >= 0 && index < y.length ? y[index] : 0;
      re[i] = sample * hann[i];
      im[i] = 0;
    }
    fft(re, im);
    const bins = N_FFT / 2 + 1;
    const power = new Float64Array(bins);
    const mag = new Float64Array(bins);
    for (let k = 0; k < bins; k++) {
      mag[k] = Math.hypot(re[k], im[k]);
      power[k] = mag[k] * mag[k];
    }
    frames.push({ power, mag });
  }
  return frames;
}

function mean(values: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i];
  return values.length ? sum / values.length : 0;
}

function std(values: ArrayLike<number>): number {
  if (!values.length) return 0;
  const avg = mean(values);
  let acc = 0;
  for (let i = 0; i < values.length; i++) {
    const d = values[i] - avg;
    acc += d * d;
  }
  return Math.sqrt(acc / values.length);
}

function minOf(values: ArrayLike<number>): number {
  let value = Infinity;
  for (let i = 0; i < values.length; i++) value = Math.min(value, values[i]);
  return values.length ? value : 0;
}

function maxOf(values: ArrayLike<number>): number {
  let value = -Infinity;
  for (let i = 0; i < values.length; i++) value = Math.max(value, values[i]);
  return values.length ? value : 0;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(values: number[], q: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = ((sorted.length - 1) * q) / 100;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] * (hi - pos) + sorted[hi] * (pos - lo);
}

function powerToDb(grid: number[][]): number[][] {
  let peak = -Infinity;
  const logged = grid.map((row) =>
    row.map((value) => {
      const db = 10 * Math.log10(Math.max(1e-10, value));
      peak = Math.max(peak, db);
      return db;
    })
  );
  const floor = peak - 80;
  return logged.map((row) => row.map((value) => Math.max(floor, value)));
}

function dctOrtho(rows: number[][], nKeep: number): number[][] {
  const nMels = rows.length;
  const nFrames = rows[0]?.length ?? 0;
  const out: number[][] = [];
  for (let k = 0; k < nKeep; k++) {
    const scale = k === 0 ? Math.sqrt(1 / nMels) : Math.sqrt(2 / nMels);
    const coeffs = new Array<number>(nFrames).fill(0);
    for (let t = 0; t < nFrames; t++) {
      let sum = 0;
      for (let n = 0; n < nMels; n++) {
        sum += rows[n][t] * Math.cos((Math.PI * k * (2 * n + 1)) / (2 * nMels));
      }
      coeffs[t] = scale * sum;
    }
    out.push(coeffs);
  }
  return out;
}

function delta(rows: number[][]): number[][] {
  const width = 9;
  const half = 4;
  const denom = 60;
  return rows.map((row) => {
    const n = row.length;
    const out = new Array<number>(n).fill(0);
    if (n < width) return out;
    const at = (index: number) => {
      let slope = 0;
      for (let k = -half; k <= half; k++) slope += k * row[index + k];
      return slope / denom;
    };
    const first = at(half);
    const last = at(n - 1 - half);
    for (let i = 0; i < n; i++) {
      if (i < half) out[i] = first;
      else if (i > n - 1 - half) out[i] = last;
      else out[i] = at(i);
    }
    return out;
  });
}

function stats4(row: number[]): number[] {
  return [mean(row), std(row), maxOf(row), minOf(row)];
}

function localPeaks(values: ArrayLike<number>, height: number, distance: number): number[] {
  const peaks: { index: number; value: number }[] = [];
  for (let i = 1; i < values.length - 1; i++) {
    if (values[i] > values[i - 1] && values[i] >= values[i + 1] && values[i] >= height) {
      peaks.push({ index: i, value: values[i] });
    }
  }
  peaks.sort((a, b) => b.value - a.value);
  const kept: number[] = [];
  for (const peak of peaks) {
    if (kept.every((index) => Math.abs(index - peak.index) >= distance)) kept.push(peak.index);
  }
  kept.sort((a, b) => a - b);
  return kept;
}

function reflectIndex(index: number, length: number): number {
  if (length <= 1) return 0;
  const period = 2 * (length - 1);
  let wrapped = ((index % period) + period) % period;
  if (wrapped >= length) wrapped = period - wrapped;
  return wrapped;
}

// In-place quickselect for a 31-sample window. Sorting a new array per bin was allocating millions of copies.
function selectMedian31(w: Float64Array): number {
  let lo = 0;
  let hi = 30;
  const target = 15;
  while (lo < hi) {
    const pivot = w[(lo + hi) >> 1];
    let i = lo;
    let j = hi;
    while (i <= j) {
      while (w[i] < pivot) i++;
      while (w[j] > pivot) j--;
      if (i <= j) {
        const tmp = w[i];
        w[i] = w[j];
        w[j] = tmp;
        i++;
        j--;
      }
    }
    if (target <= j) hi = j;
    else if (target >= i) lo = i;
    else break;
  }
  return w[target];
}

function medianFilterTime(mag: Float32Array, nBins: number, nFrames: number, size: number): Float32Array {
  const out = new Float32Array(mag.length);
  const half = Math.floor(size / 2);
  const window = new Float64Array(size);
  const refl = new Int32Array(nFrames + size);
  for (let i = 0; i < nFrames + size; i++) {
    refl[i] = reflectIndex(i - half, nFrames) * nBins;
  }
  for (let bin = 0; bin < nBins; bin++) {
    for (let frame = 0; frame < nFrames; frame++) {
      for (let k = 0; k < size; k++) {
        window[k] = mag[refl[frame + k] + bin];
      }
      out[frame * nBins + bin] = selectMedian31(window);
    }
  }
  return out;
}

function medianFilterFreq(mag: Float32Array, nBins: number, nFrames: number, size: number): Float32Array {
  const out = new Float32Array(mag.length);
  const half = Math.floor(size / 2);
  const window = new Float64Array(size);
  const refl = new Int32Array(nBins + size);
  for (let i = 0; i < nBins + size; i++) {
    refl[i] = reflectIndex(i - half, nBins);
  }
  for (let frame = 0; frame < nFrames; frame++) {
    const base = frame * nBins;
    for (let bin = 0; bin < nBins; bin++) {
      for (let k = 0; k < size; k++) {
        window[k] = mag[base + refl[bin + k]];
      }
      out[base + bin] = selectMedian31(window);
    }
  }
  return out;
}

function harmonicRatio(y: Float64Array, magFlat: Float32Array, nBins: number, nFrames: number): number {
  const harm = medianFilterTime(magFlat, nBins, nFrames, 31);
  const perc = medianFilterFreq(magFlat, nBins, nFrames, 31);
  const mask = new Float32Array(magFlat.length);
  const tiny = 1e-30;
  for (let i = 0; i < mask.length; i++) {
    const z = Math.max(harm[i], perc[i]);
    if (z < tiny) {
      mask[i] = 0.5;
      continue;
    }
    const a = (harm[i] / z) ** 2;
    const b = (perc[i] / z) ** 2;
    mask[i] = a / (a + b);
  }
  const recovered = new Float64Array(N_FFT + HOP * (nFrames - 1));
  const windowSum = new Float64Array(recovered.length);
  const re = new Float64Array(N_FFT);
  const im = new Float64Array(N_FFT);
  for (let t = 0; t < nFrames; t++) {
    const start = t * HOP - N_FFT / 2;
    for (let i = 0; i < N_FFT; i++) {
      const index = start + i;
      const sample = index >= 0 && index < y.length ? y[index] : 0;
      re[i] = sample * hann[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 1; k < nBins - 1; k++) {
      re[k] *= mask[t * nBins + k];
      im[k] *= mask[t * nBins + k];
    }
    re[0] *= mask[t * nBins];
    im[0] = 0;
    re[nBins - 1] *= mask[t * nBins + nBins - 1];
    im[nBins - 1] = 0;
    for (let k = 1; k < nBins - 1; k++) {
      re[N_FFT - k] = re[k];
      im[N_FFT - k] = -im[k];
    }
    ifft(re, im);
    const offset = t * HOP;
    for (let i = 0; i < N_FFT; i++) {
      recovered[offset + i] += re[i] * hann[i];
      windowSum[offset + i] += hann[i] * hann[i];
    }
  }
  let harmEnergy = 0;
  let total = 0;
  for (let i = 0; i < y.length; i++) total += y[i] * y[i];
  const trim = N_FFT / 2;
  for (let i = 0; i < y.length; i++) {
    const denom = windowSum[trim + i];
    const sample = denom > 1e-8 ? recovered[trim + i] / denom : 0;
    harmEnergy += sample * sample;
  }
  return harmEnergy / (total + 1e-10);
}

function tempoOf(onset: number[], sr: number): number {
  if (onset.length < 8) return 0;
  const minBpm = 30;
  const maxBpm = 300;
  const minLag = Math.max(1, Math.round((60 * sr) / (maxBpm * HOP)));
  const maxLag = Math.min(onset.length - 1, Math.round((60 * sr) / (minBpm * HOP)));
  let bestLag = minLag;
  let best = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let acc = 0;
    for (let i = lag; i < onset.length; i++) acc += onset[i] * onset[i - lag];
    const bpm = (60 * sr) / (lag * HOP);
    const prior = Math.exp(-0.5 * ((Math.log(bpm / 120) / Math.log(2)) ** 2));
    const score = acc * prior;
    if (score > best) {
      best = score;
      bestLag = lag;
    }
  }
  return (60 * sr) / (bestLag * HOP);
}

function pitchTrack(frames: Frame[], sr: number): number[] {
  const nBins = frames[0]?.mag.length ?? 0;
  const fminBin = Math.ceil((75 * N_FFT) / sr);
  const fmaxBin = Math.floor((400 * N_FFT) / sr);
  const pitches: number[] = [];
  for (const frame of frames) {
    let frameMax = 0;
    for (let k = 0; k < nBins; k++) frameMax = Math.max(frameMax, frame.mag[k]);
    const threshold = 0.1 * frameMax;
    let bestMag = 0;
    let bestPitch = 0;
    for (let k = Math.max(1, fminBin); k < Math.min(nBins - 1, fmaxBin); k++) {
      const center = frame.mag[k];
      if (center < threshold || center < frame.mag[k - 1] || center < frame.mag[k + 1]) continue;
      const left = frame.mag[k - 1];
      const right = frame.mag[k + 1];
      const denom = left - 2 * center + right;
      const shift = denom === 0 ? 0 : (0.5 * (left - right)) / denom;
      const grad = (right - left) / 2;
      const magnitude = center + 0.5 * grad * shift;
      if (magnitude > bestMag) {
        bestMag = magnitude;
        bestPitch = ((k + shift) * sr) / N_FFT;
      }
    }
    if (bestPitch > 0) pitches.push(bestPitch);
  }
  return pitches;
}

function spectralContrast(frames: Frame[], sr: number): number[] {
  const nBands = 6;
  const freq = frames[0].mag.length;
  const octa = [0];
  for (let i = 0; i <= nBands; i++) octa.push(200 * 2 ** i);
  const peak: number[][] = Array.from({ length: nBands + 1 }, () => new Array(frames.length).fill(0));
  const valley: number[][] = Array.from({ length: nBands + 1 }, () => new Array(frames.length).fill(0));
  for (let band = 0; band <= nBands; band++) {
    const selected: number[] = [];
    for (let k = 0; k < freq; k++) {
      const hz = (k * sr) / N_FFT;
      if (hz >= octa[band] && hz <= octa[band + 1]) selected.push(k);
    }
    if (band > 0 && selected.length && selected[0] > 0) selected.unshift(selected[0] - 1);
    if (band === nBands && selected.length) {
      for (let k = selected[selected.length - 1] + 1; k < freq; k++) selected.push(k);
    }
    const use = band < nBands ? selected.slice(0, -1) : selected;
    const take = Math.max(1, Math.round(0.02 * selected.length));
    for (let t = 0; t < frames.length; t++) {
      const values = use.map((bin) => frames[t].mag[bin]).sort((a, b) => a - b);
      const count = Math.min(take, values.length);
      valley[band][t] = mean(values.slice(0, count));
      peak[band][t] = mean(values.slice(values.length - count));
    }
  }
  const peakDb = powerToDb(peak);
  const valleyDb = powerToDb(valley);
  return peakDb.map((row, band) => mean(row.map((value, frame) => value - valleyDb[band][frame])));
}

function rmsFrames(y: Float64Array): number[] {
  const frame = 2048;
  const nFrames = 1 + Math.floor(y.length / HOP);
  const out: number[] = [];
  for (let t = 0; t < nFrames; t++) {
    const start = t * HOP - frame / 2;
    let acc = 0;
    for (let i = 0; i < frame; i++) {
      const index = start + i;
      const sample = index >= 0 && index < y.length ? y[index] : 0;
      acc += sample * sample;
    }
    out.push(Math.sqrt(acc / frame));
  }
  return out;
}

function zeroCrossing(y: Float64Array): number[] {
  const frame = 2048;
  const nFrames = 1 + Math.floor(y.length / HOP);
  const out: number[] = [];
  const at = (index: number) => {
    if (index < 0) return y[0] ?? 0;
    if (index >= y.length) return y[y.length - 1] ?? 0;
    return y[index];
  };
  for (let t = 0; t < nFrames; t++) {
    const start = t * HOP - frame / 2;
    let crossings = 0;
    let prev = at(start) < 0;
    for (let i = 1; i < frame; i++) {
      const sign = at(start + i) < 0;
      if (sign !== prev) crossings += 1;
      prev = sign;
    }
    out.push(crossings / (frame - 1));
  }
  return out;
}

export function extractFeatures(y: Float64Array, sr = SR): number[] {
  const frames = stft(y);
  const nFrames = frames.length;
  const nBins = frames[0].mag.length;
  const mel = Array.from({ length: N_MELS }, () => new Array<number>(nFrames).fill(0));
  for (let t = 0; t < nFrames; t++) {
    for (let m = 0; m < N_MELS; m++) {
      let sum = 0;
      const row = melWeights[m];
      const power = frames[t].power;
      for (let k = 0; k < nBins; k++) sum += row[k] * power[k];
      mel[m][t] = sum;
    }
  }
  const mfcc = dctOrtho(powerToDb(mel), 13);
  const mfccDelta = delta(mfcc);
  const features: number[] = [];
  for (const row of mfcc) features.push(...stats4(row));
  for (const row of mfccDelta) features.push(mean(row), std(row));

  const pitches = pitchTrack(frames, sr);
  if (pitches.length > 10) {
    const pitchMean = mean(pitches);
    const pitchMin = minOf(pitches);
    const pitchMax = maxOf(pitches);
    const diffs: number[] = [];
    for (let i = 1; i < pitches.length; i++) diffs.push(Math.abs(pitches[i] - pitches[i - 1]));
    features.push(
      pitchMean,
      std(pitches),
      median(pitches),
      pitchMin,
      pitchMax,
      pitchMax - pitchMin,
      percentile(pitches, 75) - percentile(pitches, 25),
      pitchMean > 0 ? std(pitches) / pitchMean : 0,
      pitchMean > 0 ? mean(diffs) / pitchMean : 0
    );
  } else {
    features.push(0, 0, 0, 0, 0, 0, 0, 0, 0);
  }

  const rms = rmsFrames(y);
  const energyMean = mean(rms);
  const energyMax = maxOf(rms);
  const energyMin = minOf(rms);
  const energyDiffs: number[] = [];
  for (let i = 1; i < rms.length; i++) energyDiffs.push(Math.abs(rms[i] - rms[i - 1]));
  features.push(
    energyMean,
    std(rms),
    energyMax,
    energyMin,
    energyMax - energyMin,
    median(rms),
    energyMean > 0 ? mean(energyDiffs) / energyMean : 0
  );

  const silenceAt = mean(rms) * 0.15;
  const pauses: number[] = [];
  const voiced: number[] = [];
  let currentPause = 0;
  let currentVoiced = 0;
  for (const value of rms) {
    if (value < silenceAt) {
      if (currentVoiced > 0) {
        voiced.push(currentVoiced);
        currentVoiced = 0;
      }
      currentPause += 1;
    } else {
      if (currentPause > 0) {
        pauses.push(currentPause);
        currentPause = 0;
      }
      currentVoiced += 1;
    }
  }
  const silent = rms.filter((value) => value < silenceAt).length;
  features.push(rms.length ? silent / rms.length : 0, rms.length ? (rms.length - silent) / rms.length : 0);
  const duration = y.length / sr;
  if (pauses.length) {
    const pauseSeconds = pauses.map((count) => count * (HOP / sr));
    const longPauses = pauseSeconds.filter((value) => value > 0.5).length;
    features.push(
      pauses.length,
      duration > 0 ? pauses.length / duration : 0,
      mean(pauseSeconds),
      std(pauseSeconds),
      maxOf(pauseSeconds),
      median(pauseSeconds),
      pauseSeconds.reduce((sum, value) => sum + value, 0),
      longPauses / pauses.length
    );
  } else {
    features.push(0, 0, 0, 0, 0, 0, 0, 0);
  }
  if (voiced.length) {
    const voicedSeconds = voiced.map((count) => count * (HOP / sr));
    features.push(
      voiced.length,
      mean(voicedSeconds),
      std(voicedSeconds),
      duration > 0 ? voiced.length / duration : 0
    );
  } else {
    features.push(0, 0, 0, 0);
  }
  const distance = Math.trunc((0.1 * sr) / HOP);
  features.push(duration > 0 ? localPeaks(rms, -Infinity, distance).length / duration : 0);

  const zcr = zeroCrossing(y);
  features.push(mean(zcr), std(zcr), maxOf(zcr));

  const centroid: number[] = [];
  const rolloff: number[] = [];
  const bandwidth: number[] = [];
  const flatness: number[] = [];
  const average = new Float64Array(nBins);
  for (let t = 0; t < nFrames; t++) {
    const mag = frames[t].mag;
    const power = frames[t].power;
    let magSum = 0;
    let weighted = 0;
    let flatNum = 0;
    let flatDen = 0;
    for (let k = 0; k < nBins; k++) {
      const hz = (k * sr) / N_FFT;
      magSum += mag[k];
      weighted += hz * mag[k];
      average[k] += mag[k];
      const safe = Math.max(1e-10, power[k]);
      flatNum += Math.log(safe);
      flatDen += safe;
    }
    const centerHz = magSum > 0 ? weighted / magSum : 0;
    centroid.push(centerHz);
    let second = 0;
    for (let k = 0; k < nBins; k++) {
      const hz = (k * sr) / N_FFT;
      second += mag[k] * (hz - centerHz) ** 2;
    }
    bandwidth.push(magSum > 0 ? Math.sqrt(second / magSum) : 0);
    let running = 0;
    let roll = 0;
    const target = 0.85 * magSum;
    for (let k = 0; k < nBins; k++) {
      running += mag[k];
      if (running >= target) {
        roll = (k * sr) / N_FFT;
        break;
      }
    }
    rolloff.push(roll);
    flatness.push(flatDen > 0 ? Math.exp(flatNum / nBins) / (flatDen / nBins) : 0);
  }
  for (let k = 0; k < nBins; k++) average[k] /= nFrames;
  features.push(mean(centroid), std(centroid), mean(rolloff), std(rolloff), mean(bandwidth), std(bandwidth));
  features.push(mean(flatness), std(flatness));
  features.push(...spectralContrast(frames, sr));

  const formantHeight = maxOf(average) * 0.1;
  const formants = localPeaks(average, formantHeight, 1);
  features.push(formants.length > 0 ? (formants[0] * sr) / N_FFT : 0);
  features.push(formants.length > 1 ? (formants[1] * sr) / N_FFT : 0);
  features.push(duration);

  const onset: number[] = new Array(nFrames).fill(0);
  for (let t = 1; t < nFrames; t++) {
    let flux = 0;
    for (let m = 0; m < N_MELS; m++) {
      const rise = mel[m][t] - mel[m][t - 1];
      if (rise > 0) flux += rise;
    }
    onset[t] = flux;
  }
  features.push(tempoOf(onset, sr));

  const magFlat = new Float32Array(nFrames * nBins);
  for (let t = 0; t < nFrames; t++) magFlat.set(frames[t].mag, t * nBins);
  features.push(harmonicRatio(y, magFlat, nBins, nFrames));
  return features;
}
