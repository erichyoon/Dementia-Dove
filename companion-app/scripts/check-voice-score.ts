import { readFileSync } from 'node:fs';
import { extractFeatures } from '../src/services/voice/features.ts';

const model = JSON.parse(readFileSync(new URL('../src/services/voice/model.json', import.meta.url), 'utf8'));
const fixture = JSON.parse(readFileSync(new URL('../src/services/voice/fixture.json', import.meta.url), 'utf8'));

const pcm = new Float64Array(fixture.pcm.length);
for (let i = 0; i < pcm.length; i++) pcm[i] = fixture.pcm[i] / 32768;

const got = extractFeatures(pcm, 16000);
const names: string[] = model.featureNames;
const scale: number[] = model.scale;
const rows = names.map((name, index) => {
  const expected = fixture.features[index];
  const actual = got[index] ?? NaN;
  const z = scale[index] ? Math.abs(actual - expected) / scale[index] : Math.abs(actual - expected);
  return { name, expected, actual, z };
});
rows.sort((a, b) => b.z - a.z);
const meanZ = rows.reduce((sum, row) => sum + row.z, 0) / rows.length;
console.log('features', got.length, 'mean scaled error', meanZ.toFixed(4));
for (const row of rows.slice(0, 15)) {
  console.log(
    row.z.toFixed(3).padStart(8),
    row.name.padEnd(28),
    'py',
    row.expected.toFixed(4),
    'js',
    Number.isFinite(row.actual) ? row.actual.toFixed(4) : 'NaN'
  );
}

let decision = model.intercept;
const scaled = fixture.features.map((value: number, index: number) => (value - model.mean[index]) / (model.scale[index] || 1));
for (let i = 0; i < model.dualCoef.length; i++) {
  let distance = 0;
  const vector = model.supportVectors[i];
  for (let j = 0; j < scaled.length; j++) {
    const diff = scaled[j] - vector[j];
    distance += diff * diff;
  }
  decision += model.dualCoef[i] * Math.exp(-model.gamma * distance);
}
const healthy = 1 / (1 + Math.exp(model.probA * -decision + model.probB));
console.log('svm decision', decision, 'expected', fixture.decision);
console.log('svm healthy', healthy, 'expected', fixture.probability[0]);
if (Math.abs(decision - fixture.decision) > 1e-6) process.exitCode = 1;
