API_URL = "https://project-recall-api.onrender.com"

import librosa
import numpy as np
import pickle
import warnings

warnings.filterwarnings('ignore')


def extract_features_from_audio(audio_path):
    """Extract the same features used in training"""
    try:
        # Load audio
        y, sr = librosa.load(audio_path, sr=16000)

        features = {}

        # 1. MFCCs
        mfccs = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
        for i in range(13):
            features[f'mfcc_{i}_mean'] = float(np.mean(mfccs[i]))
            features[f'mfcc_{i}_std'] = float(np.std(mfccs[i]))
            features[f'mfcc_{i}_max'] = float(np.max(mfccs[i]))
            features[f'mfcc_{i}_min'] = float(np.min(mfccs[i]))

        # MFCC Delta
        mfcc_delta = librosa.feature.delta(mfccs)
        for i in range(13):
            features[f'mfcc_delta_{i}_mean'] = float(np.mean(mfcc_delta[i]))
            features[f'mfcc_delta_{i}_std'] = float(np.std(mfcc_delta[i]))

        # 2. Pitch features
        pitches, magnitudes = librosa.piptrack(y=y, sr=sr, fmin=75, fmax=400)
        pitch_values = []
        for t in range(pitches.shape[1]):
            index = magnitudes[:, t].argmax()
            pitch = pitches[index, t]
            if pitch > 0:
                pitch_values.append(pitch)

        if len(pitch_values) > 10:
            features['pitch_mean'] = float(np.mean(pitch_values))
            features['pitch_std'] = float(np.std(pitch_values))
            features['pitch_median'] = float(np.median(pitch_values))
            features['pitch_min'] = float(np.min(pitch_values))
            features['pitch_max'] = float(np.max(pitch_values))
            features['pitch_range'] = float(features['pitch_max'] - features['pitch_min'])
            features['pitch_iqr'] = float(np.percentile(pitch_values, 75) - np.percentile(pitch_values, 25))
            features['pitch_cv'] = float(
                features['pitch_std'] / features['pitch_mean'] if features['pitch_mean'] > 0 else 0)
            pitch_diffs = np.abs(np.diff(pitch_values))
            features['pitch_jitter'] = float(
                np.mean(pitch_diffs) / features['pitch_mean'] if features['pitch_mean'] > 0 else 0)
        else:
            for key in ['pitch_mean', 'pitch_std', 'pitch_median', 'pitch_min',
                        'pitch_max', 'pitch_range', 'pitch_iqr', 'pitch_cv', 'pitch_jitter']:
                features[key] = 0.0

        # 3. Energy features
        rms = librosa.feature.rms(y=y)[0]
        features['energy_mean'] = float(np.mean(rms))
        features['energy_std'] = float(np.std(rms))
        features['energy_max'] = float(np.max(rms))
        features['energy_min'] = float(np.min(rms))
        features['energy_range'] = float(features['energy_max'] - features['energy_min'])
        features['energy_median'] = float(np.median(rms))
        energy_diffs = np.abs(np.diff(rms))
        features['energy_shimmer'] = float(
            np.mean(energy_diffs) / features['energy_mean'] if features['energy_mean'] > 0 else 0)

        # 4. Pause features
        frame_length = 2048
        hop_length = 512
        energy_frames = librosa.feature.rms(y=y, frame_length=frame_length, hop_length=hop_length)[0]
        silence_threshold = np.mean(energy_frames) * 0.15
        is_silence = energy_frames < silence_threshold
        is_voiced = ~is_silence

        features['silence_ratio'] = float(np.sum(is_silence) / len(is_silence))
        features['voiced_ratio'] = float(np.sum(is_voiced) / len(is_voiced))

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

        if len(pauses) > 0:
            pause_durations = [p * (hop_length / sr) for p in pauses]
            features['pause_count'] = float(len(pauses))
            features['pause_rate'] = float(len(pauses) / (len(y) / sr))
            features['pause_duration_mean'] = float(np.mean(pause_durations))
            features['pause_duration_std'] = float(np.std(pause_durations))
            features['pause_duration_max'] = float(np.max(pause_durations))
            features['pause_duration_median'] = float(np.median(pause_durations))
            features['pause_duration_total'] = float(np.sum(pause_durations))
            long_pauses = [p for p in pause_durations if p > 0.5]
            features['long_pause_ratio'] = float(len(long_pauses) / len(pauses) if len(pauses) > 0 else 0)
        else:
            for key in ['pause_count', 'pause_rate', 'pause_duration_mean', 'pause_duration_std',
                        'pause_duration_max', 'pause_duration_median', 'pause_duration_total', 'long_pause_ratio']:
                features[key] = 0.0

        if len(voiced_segments) > 0:
            voiced_durations = [v * (hop_length / sr) for v in voiced_segments]
            features['voiced_segment_count'] = float(len(voiced_segments))
            features['voiced_segment_mean'] = float(np.mean(voiced_durations))
            features['voiced_segment_std'] = float(np.std(voiced_durations))
            features['voiced_segment_rate'] = float(len(voiced_segments) / (len(y) / sr))
        else:
            for key in ['voiced_segment_count', 'voiced_segment_mean',
                        'voiced_segment_std', 'voiced_segment_rate']:
                features[key] = 0.0

        from scipy.signal import find_peaks
        peaks, _ = find_peaks(energy_frames, distance=int(0.1 * sr / hop_length))
        features['speech_rate_estimate'] = float(len(peaks) / (len(y) / sr))

        # 5. Zero crossing rate
        zcr = librosa.feature.zero_crossing_rate(y)[0]
        features['zcr_mean'] = float(np.mean(zcr))
        features['zcr_std'] = float(np.std(zcr))
        features['zcr_max'] = float(np.max(zcr))

        # 6. Spectral features
        spectral_centroids = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
        spectral_rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr)[0]
        spectral_bandwidth = librosa.feature.spectral_bandwidth(y=y, sr=sr)[0]
        spectral_flatness = librosa.feature.spectral_flatness(y=y)[0]
        spectral_contrast = librosa.feature.spectral_contrast(y=y, sr=sr)

        features['spectral_centroid_mean'] = float(np.mean(spectral_centroids))
        features['spectral_centroid_std'] = float(np.std(spectral_centroids))
        features['spectral_rolloff_mean'] = float(np.mean(spectral_rolloff))
        features['spectral_rolloff_std'] = float(np.std(spectral_rolloff))
        features['spectral_bandwidth_mean'] = float(np.mean(spectral_bandwidth))
        features['spectral_bandwidth_std'] = float(np.std(spectral_bandwidth))
        features['spectral_flatness_mean'] = float(np.mean(spectral_flatness))
        features['spectral_flatness_std'] = float(np.std(spectral_flatness))

        for i in range(min(7, spectral_contrast.shape[0])):
            features[f'spectral_contrast_{i}_mean'] = float(np.mean(spectral_contrast[i]))

        # 7. Formant estimates
        spec = np.abs(librosa.stft(y))
        freqs = librosa.fft_frequencies(sr=sr)
        avg_spectrum = np.mean(spec, axis=1)
        spectral_peaks, _ = find_peaks(avg_spectrum, height=np.max(avg_spectrum) * 0.1)

        if len(spectral_peaks) >= 2:
            features['formant_f1_estimate'] = float(freqs[spectral_peaks[0]] if len(spectral_peaks) > 0 else 0)
            features['formant_f2_estimate'] = float(freqs[spectral_peaks[1]] if len(spectral_peaks) > 1 else 0)
        else:
            features['formant_f1_estimate'] = 0.0
            features['formant_f2_estimate'] = 0.0

        # 8. Temporal features
        features['duration'] = float(len(y) / sr)
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        features['tempo'] = float(tempo)

        # 9. Harmonicity
        harmonic, percussive = librosa.effects.hpss(y)
        features['harmonic_ratio'] = float(np.sum(harmonic ** 2) / (np.sum(y ** 2) + 1e-10))

        return features

    except Exception as e:
        print(f"Error: {str(e)}")
        return None


def predict_audio(audio_path):
    """Predict if audio shows Alzheimer's speech patterns"""

    print("=" * 70)
    print("ALZHEIMER'S SPEECH DETECTION TEST")
    print("=" * 70)
    print(f"\nAnalyzing: {audio_path}")

    # Load the trained model and scaler
    try:
        with open('models/best_model_improved.pkl', 'rb') as f:
            model = pickle.load(f)
        with open('models/scaler_improved.pkl', 'rb') as f:
            scaler = pickle.load(f)
        print("✅ Loaded trained model (SVM)")
    except:
        print("❌ Error: Could not load model files!")
        print("Make sure best_model_improved.pkl and scaler_improved.pkl exist in models/")
        return

    # Extract features
    print("\nExtracting speech features...")
    features = extract_features_from_audio(audio_path)

    if features is None:
        print("❌ Failed to extract features")
        return

    print(f"✅ Extracted {len(features)} features")

    # Convert to array - ensure all values are floats
    feature_values = np.array([float(v) for v in features.values()]).reshape(1, -1)

    # Handle NaN/inf
    feature_values = np.nan_to_num(feature_values, nan=0.0, posinf=0.0, neginf=0.0)

    # Scale features
    feature_values_scaled = scaler.transform(feature_values)

    # Predict
    prediction = model.predict(feature_values_scaled)[0]
    probability = model.predict_proba(feature_values_scaled)[0]

    # Display results - BIG AND BOLD
    print("\n")
    print("=" * 70)
    print("=" * 70)

    if prediction == 1:
        print("\n")
        print("  ██████╗ ███████╗████████╗███████╗ ██████╗████████╗███████╗██████╗ ")
        print("  ██╔══██╗██╔════╝╚══██╔══╝██╔════╝██╔════╝╚══██╔══╝██╔════╝██╔══██╗")
        print("  ██║  ██║█████╗     ██║   █████╗  ██║        ██║   █████╗  ██║  ██║")
        print("  ██║  ██║██╔══╝     ██║   ██╔══╝  ██║        ██║   ██╔══╝  ██║  ██║")
        print("  ██████╔╝███████╗   ██║   ███████╗╚██████╗   ██║   ███████╗██████╔╝")
        print("  ╚═════╝ ╚══════╝   ╚═╝   ╚══════╝ ╚═════╝   ╚═╝   ╚══════╝╚═════╝ ")
        print("\n")
        print(" " * 10 + "🔴 ALZHEIMER'S-ASSOCIATED SPEECH PATTERNS 🔴")
        print("\n")
        print(f" " * 20 + f"CONFIDENCE: {probability[1] * 100:.1f}%")
        print("\n")
    else:
        print("\n")
        print("  ██╗  ██╗███████╗ █████╗ ██╗  ████████╗██╗  ██╗██╗   ██╗")
        print("  ██║  ██║██╔════╝██╔══██╗██║  ╚══██╔══╝██║  ██║╚██╗ ██╔╝")
        print("  ███████║█████╗  ███████║██║     ██║   ███████║ ╚████╔╝ ")
        print("  ██╔══██║██╔══╝  ██╔══██║██║     ██║   ██╔══██║  ╚██╔╝  ")
        print("  ██║  ██║███████╗██║  ██║███████╗██║   ██║  ██║   ██║   ")
        print("  ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚══════╝╚═╝   ╚═╝  ╚═╝   ╚═╝   ")
        print("\n")
        print(" " * 15 + "🟢 HEALTHY SPEECH PATTERNS 🟢")
        print("\n")
        print(f" " * 20 + f"CONFIDENCE: {probability[0] * 100:.1f}%")
        print("\n")

    print("=" * 70)
    print("=" * 70)

    # Detailed breakdown
    print("\n📊 DETAILED PROBABILITY BREAKDOWN:")
    print("-" * 70)
    print(f"   Healthy (HC):      {probability[0] * 100:.1f}%  {'█' * int(probability[0] * 50)}")
    print(f"   Alzheimer's (AD):  {probability[1] * 100:.1f}%  {'█' * int(probability[1] * 50)}")

    # Show some key features
    print("\n🔍 KEY SPEECH FEATURES ANALYZED:")
    print("-" * 70)
    print(f"   Duration:              {features['duration']:.2f} seconds")
    print(f"   Speech rate estimate:  {features['speech_rate_estimate']:.2f} syllables/sec")
    print(f"   Pause count:           {features['pause_count']:.0f} pauses")
    print(f"   Silence ratio:         {features['silence_ratio'] * 100:.1f}%")
    print(f"   Average pitch:         {features['pitch_mean']:.1f} Hz")
    print(f"   Pitch variability:     {features['pitch_std']:.1f} Hz")

    print("\n" + "=" * 70)
    print("⚠️  DISCLAIMER: Research prototype - NOT a medical diagnostic tool")
    print("=" * 70)
    print("\n")


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1:
        # If audio file provided as argument
        audio_file = sys.argv[1]
    else:
        # Ask user for file path
        print("Enter path to audio file (.wav or .mp3):")
        audio_file = input("> ").strip().strip('"').strip("'")

    predict_audio(audio_file)