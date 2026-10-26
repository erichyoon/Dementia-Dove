from flask import Flask, request, jsonify
from flask_cors import CORS
import librosa
import numpy as np
import pickle
import os
from werkzeug.utils import secure_filename
from scipy.signal import find_peaks

app = Flask(__name__)
CORS(app)

# Configure upload folder
UPLOAD_FOLDER = 'temp_uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024  # 10MB max

# Load model and scaler
print("Loading model and scaler...")
with open('models/best_model_improved.pkl', 'rb') as f:
    model = pickle.load(f)
with open('models/scaler_improved.pkl', 'rb') as f:
    scaler = pickle.load(f)
print("Model loaded successfully!")


def extract_features_from_audio(audio_path):
    """Extract 132 features from audio file"""
    try:
        y, sr = librosa.load(audio_path, sr=16000)
        features = {}

        # MFCCs
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

        # Pitch features
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

        # Energy features
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

        # Pause features
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

        peaks, _ = find_peaks(energy_frames, distance=int(0.1 * sr / hop_length))
        features['speech_rate_estimate'] = float(len(peaks) / (len(y) / sr))

        # Zero crossing rate
        zcr = librosa.feature.zero_crossing_rate(y)[0]
        features['zcr_mean'] = float(np.mean(zcr))
        features['zcr_std'] = float(np.std(zcr))
        features['zcr_max'] = float(np.max(zcr))

        # Spectral features
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

        # Formant estimates
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

        # Temporal features
        features['duration'] = float(len(y) / sr)
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        features['tempo'] = float(np.atleast_1d(tempo)[0])

        # Harmonicity
        harmonic, percussive = librosa.effects.hpss(y)
        features['harmonic_ratio'] = float(np.sum(harmonic ** 2) / (np.sum(y ** 2) + 1e-10))

        return features

    except Exception as e:
        raise Exception(f"Feature extraction failed: {str(e)}")


@app.route('/', methods=['GET'])
def home():
    return jsonify({
        'message': 'Dementia Dove API',
        'status': 'running',
        'endpoints': {
            'health': '/api/health',
            'predict': '/api/predict (POST with audio file)'
        }
    })


@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'ok', 'message': 'API is running'})


@app.route('/api/predict', methods=['POST'])
def predict():
    try:
        # Check if file was uploaded
        if 'audio' not in request.files:
            return jsonify({'error': 'No audio file provided'}), 400

        file = request.files['audio']

        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        # Save uploaded file
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)

        print(f"Processing file: {filename}")

        # Extract features
        features = extract_features_from_audio(filepath)

        # Convert to array
        feature_values = np.array([float(v) for v in features.values()]).reshape(1, -1)
        feature_values = np.nan_to_num(feature_values, nan=0.0, posinf=0.0, neginf=0.0)

        # Scale and predict
        feature_values_scaled = scaler.transform(feature_values)
        prediction = model.predict(feature_values_scaled)[0]
        probability = model.predict_proba(feature_values_scaled)[0]

        # Clean up uploaded file
        os.remove(filepath)

        print(f"Prediction: {prediction}, Probabilities: {probability}")

        # Return results
        return jsonify({
            'prediction': 'Alzheimer' if prediction == 1 else 'Healthy',
            'confidence': {
                'healthy': round(float(probability[0]) * 100, 1),
                'alzheimer': round(float(probability[1]) * 100, 1)
            },
            'features': {
                'duration': round(features['duration'], 2),
                'pause_count': int(features['pause_count']),
                'speech_rate': round(features['speech_rate_estimate'], 2),
                'pitch_mean': round(features['pitch_mean'], 1),
                'silence_ratio': round(features['silence_ratio'] * 100, 1)
            }
        })

    except Exception as e:
        print(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    print("Starting Flask server...")
    print("API will be available at http://localhost:5050")
    app.run(debug=True, port=5050, host='0.0.0.0')