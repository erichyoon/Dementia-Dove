import librosa
import numpy as np
import pandas as pd
import os
from scipy import stats
from scipy.signal import find_peaks
import warnings

warnings.filterwarnings('ignore')


def extract_advanced_features(audio_path):
    """Extract comprehensive acoustic features optimized for Alzheimer's detection"""
    try:
        # Load audio file
        y, sr = librosa.load(audio_path, sr=16000)

        features = {}

        # ===== 1. MFCC Features (Mel-frequency cepstral coefficients) =====
        mfccs = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
        for i in range(13):
            features[f'mfcc_{i}_mean'] = np.mean(mfccs[i])
            features[f'mfcc_{i}_std'] = np.std(mfccs[i])
            features[f'mfcc_{i}_max'] = np.max(mfccs[i])
            features[f'mfcc_{i}_min'] = np.min(mfccs[i])

        # MFCC Delta (rate of change)
        mfcc_delta = librosa.feature.delta(mfccs)
        for i in range(13):
            features[f'mfcc_delta_{i}_mean'] = np.mean(mfcc_delta[i])
            features[f'mfcc_delta_{i}_std'] = np.std(mfcc_delta[i])

        # ===== 2. Enhanced Pitch Features =====
        # Extract F0 using piptrack
        pitches, magnitudes = librosa.piptrack(y=y, sr=sr, fmin=75, fmax=400)

        # Get pitch values where magnitude is high
        pitch_values = []
        for t in range(pitches.shape[1]):
            index = magnitudes[:, t].argmax()
            pitch = pitches[index, t]
            if pitch > 0:
                pitch_values.append(pitch)

        if len(pitch_values) > 10:
            features['pitch_mean'] = np.mean(pitch_values)
            features['pitch_std'] = np.std(pitch_values)
            features['pitch_median'] = np.median(pitch_values)
            features['pitch_min'] = np.min(pitch_values)
            features['pitch_max'] = np.max(pitch_values)
            features['pitch_range'] = features['pitch_max'] - features['pitch_min']
            features['pitch_iqr'] = np.percentile(pitch_values, 75) - np.percentile(pitch_values, 25)

            # Pitch variability (coefficient of variation)
            features['pitch_cv'] = features['pitch_std'] / features['pitch_mean'] if features['pitch_mean'] > 0 else 0

            # Jitter (pitch perturbation)
            pitch_diffs = np.abs(np.diff(pitch_values))
            features['pitch_jitter'] = np.mean(pitch_diffs) / features['pitch_mean'] if features[
                                                                                            'pitch_mean'] > 0 else 0
        else:
            for key in ['pitch_mean', 'pitch_std', 'pitch_median', 'pitch_min',
                        'pitch_max', 'pitch_range', 'pitch_iqr', 'pitch_cv', 'pitch_jitter']:
                features[key] = 0

        # ===== 3. Enhanced Energy/Intensity Features =====
        rms = librosa.feature.rms(y=y)[0]
        features['energy_mean'] = np.mean(rms)
        features['energy_std'] = np.std(rms)
        features['energy_max'] = np.max(rms)
        features['energy_min'] = np.min(rms)
        features['energy_range'] = features['energy_max'] - features['energy_min']
        features['energy_median'] = np.median(rms)

        # Shimmer (amplitude perturbation)
        energy_diffs = np.abs(np.diff(rms))
        features['energy_shimmer'] = np.mean(energy_diffs) / features['energy_mean'] if features[
                                                                                            'energy_mean'] > 0 else 0

        # ===== 4. Advanced Pause/Silence Features =====
        frame_length = 2048
        hop_length = 512

        # Voice Activity Detection
        energy_frames = librosa.feature.rms(y=y, frame_length=frame_length, hop_length=hop_length)[0]
        silence_threshold = np.mean(energy_frames) * 0.15  # More sensitive threshold
        is_silence = energy_frames < silence_threshold
        is_voiced = ~is_silence

        # Basic silence ratio
        features['silence_ratio'] = np.sum(is_silence) / len(is_silence)
        features['voiced_ratio'] = np.sum(is_voiced) / len(is_voiced)

        # Pause detection and analysis
        pauses = []
        voiced_segments = []
        current_pause = 0
        current_voiced = 0

        for i, silent in enumerate(is_silence):
            if silent:
                if current_voiced > 0:
                    voiced_segments.append(current_voiced)
                    current_voiced = 0
                current_pause += 1
            else:
                if current_pause > 0:
                    pauses.append(current_pause)
                    current_pause = 0
                current_voiced += 1

        # Pause statistics
        if len(pauses) > 0:
            pause_durations = [p * (hop_length / sr) for p in pauses]  # Convert to seconds
            features['pause_count'] = len(pauses)
            features['pause_rate'] = len(pauses) / (len(y) / sr)  # pauses per second
            features['pause_duration_mean'] = np.mean(pause_durations)
            features['pause_duration_std'] = np.std(pause_durations)
            features['pause_duration_max'] = np.max(pause_durations)
            features['pause_duration_median'] = np.median(pause_durations)
            features['pause_duration_total'] = np.sum(pause_durations)

            # Long pause ratio (pauses > 0.5 seconds)
            long_pauses = [p for p in pause_durations if p > 0.5]
            features['long_pause_ratio'] = len(long_pauses) / len(pauses) if len(pauses) > 0 else 0
        else:
            for key in ['pause_count', 'pause_rate', 'pause_duration_mean', 'pause_duration_std',
                        'pause_duration_max', 'pause_duration_median', 'pause_duration_total', 'long_pause_ratio']:
                features[key] = 0

        # Voiced segment statistics (speaking rate indicator)
        if len(voiced_segments) > 0:
            voiced_durations = [v * (hop_length / sr) for v in voiced_segments]
            features['voiced_segment_count'] = len(voiced_segments)
            features['voiced_segment_mean'] = np.mean(voiced_durations)
            features['voiced_segment_std'] = np.std(voiced_durations)
            features['voiced_segment_rate'] = len(voiced_segments) / (len(y) / sr)
        else:
            for key in ['voiced_segment_count', 'voiced_segment_mean',
                        'voiced_segment_std', 'voiced_segment_rate']:
                features[key] = 0

        # Speech rate approximation (syllables per second estimate)
        # Using energy peaks as proxy for syllables
        peaks, _ = find_peaks(energy_frames, distance=int(0.1 * sr / hop_length))
        features['speech_rate_estimate'] = len(peaks) / (len(y) / sr)

        # ===== 5. Zero Crossing Rate (Voicing indicator) =====
        zcr = librosa.feature.zero_crossing_rate(y)[0]
        features['zcr_mean'] = np.mean(zcr)
        features['zcr_std'] = np.std(zcr)
        features['zcr_max'] = np.max(zcr)

        # ===== 6. Enhanced Spectral Features =====
        spectral_centroids = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
        spectral_rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr)[0]
        spectral_bandwidth = librosa.feature.spectral_bandwidth(y=y, sr=sr)[0]
        spectral_flatness = librosa.feature.spectral_flatness(y=y)[0]
        spectral_contrast = librosa.feature.spectral_contrast(y=y, sr=sr)

        features['spectral_centroid_mean'] = np.mean(spectral_centroids)
        features['spectral_centroid_std'] = np.std(spectral_centroids)
        features['spectral_rolloff_mean'] = np.mean(spectral_rolloff)
        features['spectral_rolloff_std'] = np.std(spectral_rolloff)
        features['spectral_bandwidth_mean'] = np.mean(spectral_bandwidth)
        features['spectral_bandwidth_std'] = np.std(spectral_bandwidth)
        features['spectral_flatness_mean'] = np.mean(spectral_flatness)
        features['spectral_flatness_std'] = np.std(spectral_flatness)

        # Spectral contrast (indicates clarity)
        for i in range(min(7, spectral_contrast.shape[0])):
            features[f'spectral_contrast_{i}_mean'] = np.mean(spectral_contrast[i])

        # ===== 7. Formant-related features =====
        # Using spectral peaks as formant estimates
        spec = np.abs(librosa.stft(y))
        freqs = librosa.fft_frequencies(sr=sr)

        # Average spectral shape
        avg_spectrum = np.mean(spec, axis=1)
        spectral_peaks, _ = find_peaks(avg_spectrum, height=np.max(avg_spectrum) * 0.1)

        if len(spectral_peaks) >= 2:
            # First two formants (F1, F2)
            features['formant_f1_estimate'] = freqs[spectral_peaks[0]] if len(spectral_peaks) > 0 else 0
            features['formant_f2_estimate'] = freqs[spectral_peaks[1]] if len(spectral_peaks) > 1 else 0
        else:
            features['formant_f1_estimate'] = 0
            features['formant_f2_estimate'] = 0

        # ===== 8. Temporal Features =====
        features['duration'] = len(y) / sr
        features['tempo'], _ = librosa.beat.beat_track(y=y, sr=sr)

        # ===== 9. Harmonicity Features =====
        # Harmonic-to-noise ratio estimate
        harmonic, percussive = librosa.effects.hpss(y)
        features['harmonic_ratio'] = np.sum(harmonic ** 2) / (np.sum(y ** 2) + 1e-10)

        return features

    except Exception as e:
        print(f"Error processing {audio_path}: {str(e)}")
        return None


def main():
    print("=" * 70)
    print("IMPROVED FEATURE EXTRACTION FOR ALZHEIMER'S DETECTION")
    print("=" * 70)
    print("\nThis version extracts 150+ features optimized for speech analysis")
    print("Features include: MFCCs, pitch, energy, pauses, spectral, formants, etc.\n")

    # Load labels
    labels_df = pd.read_csv('data/labels.csv')
    print(f"Loaded {len(labels_df)} files from labels.csv")
    print(f"  - Alzheimer's (AD): {sum(labels_df['label'] == 'AD')} files")
    print(f"  - Healthy (HC): {sum(labels_df['label'] == 'HC')} files\n")

    # Extract features for all files
    all_features = []
    failed_files = []

    for idx, row in labels_df.iterrows():
        filename = row['filename']
        label = row['label']
        participant_id = row['participant_id']

        # Determine which folder to look in
        if label == 'AD':
            audio_path = os.path.join('data', 'alzheimers', filename)
        else:
            audio_path = os.path.join('data', 'healthy', filename)

        # Check if file exists
        if not os.path.exists(audio_path):
            print(f"WARNING: File not found: {audio_path}")
            failed_files.append(filename)
            continue

        print(f"Processing {idx + 1}/{len(labels_df)}: {filename}")

        # Extract features
        features = extract_advanced_features(audio_path)

        if features is not None:
            features['filename'] = filename
            features['label'] = label
            features['participant_id'] = participant_id
            all_features.append(features)
        else:
            failed_files.append(filename)

    # Convert to DataFrame
    features_df = pd.DataFrame(all_features)

    # Save to CSV
    output_path = 'results/pitt_features_improved.csv'
    features_df.to_csv(output_path, index=False)

    print("\n" + "=" * 70)
    print("✅ FEATURE EXTRACTION COMPLETE!")
    print("=" * 70)
    print(f"Successfully processed: {len(features_df)} files")
    print(f"Failed: {len(failed_files)} files")
    print(f"Total features extracted: {len(features_df.columns) - 3}")
    print(f"Features saved to: {output_path}")

    if len(failed_files) > 0:
        print(f"\nFailed files: {failed_files[:10]}")  # Show first 10


if __name__ == "__main__":
    main()