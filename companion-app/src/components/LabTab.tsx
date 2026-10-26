import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing, TextInput } from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { DEVICE_OPTICAL_CODE, isValidDeviceOpticalCode, parseDeviceOpticalCode } from '../constants/opticalCode';
import { rememberDeviceHost } from '../services/deviceSync';
import { colors, shadow } from '../theme';
import { FolderCard } from './FolderCard';
import { getProfile } from '../services/profileStorage';

interface Props {
  isPaired: boolean;
  onPairSuccess: () => void;
  onResetPairing: () => void;
  onOpenSettings?: () => void;
  onOpenProgress?: () => void;
}

export const LabTab: React.FC<Props> = ({
  isPaired,
  onPairSuccess,
  onResetPairing,
  onOpenSettings,
  onOpenProgress,
}) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [detectedCode, setDetectedCode] = useState<string | null>(null);
  const [rejectMessage, setRejectMessage] = useState<string | null>(null);
  const [patientName, setPatientName] = useState('Omar Firdaus');
  const [manualCode, setManualCode] = useState('');

  useEffect(() => {
    getProfile().then((profile) => setPatientName(profile.name));
  }, [isPaired]);

  const scanLineAnim = useRef(new Animated.Value(0)).current;
  const lockScaleAnim = useRef(new Animated.Value(1)).current;
  const rejectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isPaired) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(scanLineAnim, {
            toValue: 1,
            duration: 1600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(scanLineAnim, {
            toValue: 0,
            duration: 1600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      ).start();
    }

    return () => {
      if (rejectTimerRef.current) {
        clearTimeout(rejectTimerRef.current);
      }
    };
  }, [isPaired]);

  const handleValidCode = (data: string) => {
    if (isRecognizing || isPaired) return;
    const parsed = parseDeviceOpticalCode(data);
    if (!parsed.valid) return;
    if (parsed.ip) {
      void rememberDeviceHost(parsed.ip);
    }

    setRejectMessage(null);
    setIsRecognizing(true);
    setDetectedCode(data);

    Animated.sequence([
      Animated.timing(lockScaleAnim, {
        toValue: 1.08,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(lockScaleAnim, {
        toValue: 1.0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();

    onPairSuccess();
    setTimeout(() => {
      setIsRecognizing(false);
    }, 700);
  };

  const handleBarcodeScanned = (result: BarcodeScanningResult) => {
    if (isRecognizing || isPaired) return;
    if (!permission?.granted) return;

    const data = (result.data || '').trim();
    if (!isValidDeviceOpticalCode(data)) {
      setRejectMessage(data ? 'UNRECOGNIZED CODE' : 'NO CODE');
      if (rejectTimerRef.current) {
        clearTimeout(rejectTimerRef.current);
      }
      rejectTimerRef.current = setTimeout(() => setRejectMessage(null), 1500);
      return;
    }

    handleValidCode(data);
  };

  const handleManualPair = () => {
    if (isRecognizing || isPaired) return;
    const trimmed = manualCode.trim();
    if (!trimmed) {
      handleValidCode(DEVICE_OPTICAL_CODE);
      return;
    }
    if (!isValidDeviceOpticalCode(trimmed)) {
      setRejectMessage('UNRECOGNIZED CODE');
      if (rejectTimerRef.current) {
        clearTimeout(rejectTimerRef.current);
      }
      rejectTimerRef.current = setTimeout(() => setRejectMessage(null), 1500);
      return;
    }
    handleValidCode(trimmed);
  };

  const scanTranslateY = scanLineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-105, 105],
  });

  if (isPaired) {
    return (
      <View style={styles.pairedContainer}>
        <Text style={styles.heroTitle}>Paired.{'\n'}Put the phone away.</Text>

        <FolderCard style={{ width: '100%', maxWidth: 340 }}>
          <View style={styles.pairedCardInner}>
            <View style={styles.pairedCheckCircle}>
              <Ionicons name="checkmark" size={36} color={colors.white} />
            </View>
            <View style={styles.pairedBadge}>
              <Text style={styles.pairedBadgeText}>Exam active</Text>
            </View>
            <Text style={styles.patientInfoTitle}>Sent to hardware</Text>
            <Text style={styles.patientInfoRow}>{patientName} · #PT-8F24</Text>
            <Text style={styles.patientInfoRow}>Dementia Dove speech exam · T0–T5</Text>
            <Text style={styles.pairedSubtext}>
              Put the phone away. Follow the round screen and spoken prompts. Tap Start, then Done, on each task.
            </Text>
          </View>
        </FolderCard>

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => {
            setDetectedCode(null);
            onResetPairing();
          }}
          style={styles.rescanButton}
        >
          <Text style={styles.rescanButtonText}>Rescan / Disconnect</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Open profile settings"
          activeOpacity={0.85}
          style={styles.iconBtn}
          onPress={onOpenSettings}
        >
          <Ionicons name="settings-outline" size={18} color={colors.ink} />
        </TouchableOpacity>
        <View style={styles.topRight}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Open screening progress"
            activeOpacity={0.85}
            style={styles.iconBtn}
            onPress={onOpenProgress}
          >
            <Ionicons name="folder-outline" size={18} color={colors.ink} />
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.heroTitle}>Scan now.{'\n'}Pair anytime.</Text>

      <View style={styles.searchRow}>
        <View style={styles.searchBar}>
          <TextInput
            value={manualCode}
            onChangeText={setManualCode}
            placeholder={`Point camera or enter ${DEVICE_OPTICAL_CODE}`}
            placeholderTextColor={colors.muted}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={handleManualPair}
            style={styles.searchInput}
          />
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Pair with device"
          activeOpacity={0.85}
          style={styles.plusBtn}
          onPress={handleManualPair}
        >
          <Ionicons name="add" size={22} color={colors.white} />
        </TouchableOpacity>
      </View>

      <Animated.View
        style={[
          styles.circularFrameOuter,
          isRecognizing && styles.circularFrameLocked,
          { transform: [{ scale: lockScaleAnim }] },
        ]}
      >
        <View style={styles.circularFrameClip}>
          {permission && permission.granted ? (
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ['qr'],
              }}
              onBarcodeScanned={isRecognizing || isPaired ? undefined : handleBarcodeScanned}
            />
          ) : (
            <View style={styles.cameraPlaceholder}>
              <Ionicons name="camera-outline" size={38} color={colors.muted} />
              <TouchableOpacity onPress={requestPermission} style={styles.grantBtn}>
                <Text style={styles.grantBtnText}>Enable Camera</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.crosshairH} />
          <View style={styles.crosshairV} />
          <Animated.View
            style={[
              styles.scanSweepLine,
              { transform: [{ translateY: scanTranslateY }] },
            ]}
          />

          {isRecognizing && (
            <View style={styles.lockOnOverlay}>
              <Ionicons name="scan-outline" size={72} color={colors.white} />
              <Text style={styles.lockOnText}>CODE MATCHED</Text>
            </View>
          )}
        </View>
      </Animated.View>

      <View style={[styles.statusBadge, isRecognizing && styles.statusBadgeRecognized]}>
        <View style={[styles.statusPillDot, isRecognizing && styles.statusPillDotActive]} />
        <Text style={styles.statusBadgeText}>
          {isRecognizing
            ? `Authenticated  ${detectedCode}`
            : rejectMessage
              ? rejectMessage
              : permission?.granted
                ? 'Waiting for device code'
                : 'Camera required'}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
    alignItems: 'center',
    paddingTop: 18,
    paddingHorizontal: 22,
  },
  topRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  topRight: {
    flexDirection: 'row',
    gap: 10,
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: colors.ink,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.hard,
  },
  heroTitle: {
    width: '100%',
    fontSize: 34,
    fontWeight: '900',
    color: colors.ink,
    letterSpacing: -0.8,
    lineHeight: 38,
    marginBottom: 16,
  },
  searchRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
    marginBottom: 22,
  },
  searchBar: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: colors.ink,
    backgroundColor: colors.white,
    justifyContent: 'center',
    paddingHorizontal: 16,
    ...shadow.hard,
  },
  searchPlaceholder: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '600',
  },
  searchInput: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '800',
    paddingVertical: 0,
  },
  plusBtn: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.accent,
    borderWidth: 3,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.hard,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#737373',
    letterSpacing: 1.5,
    marginTop: 4,
    marginBottom: 28,
  },
  circularFrameOuter: {
    width: 248,
    height: 248,
    borderRadius: 124,
    borderWidth: 3,
    borderColor: colors.ink,
    padding: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    ...shadow.hard,
  },
  circularFrameLocked: {
    borderColor: colors.accent,
  },
  circularFrameClip: {
    width: 230,
    height: 230,
    borderRadius: 115,
    overflow: 'hidden',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paperDeep,
    borderWidth: 3,
    borderColor: colors.ink,
  },
  cameraPlaceholder: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.paperDeep,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  grantBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: colors.ink,
  },
  grantBtnText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '800',
  },
  crosshairH: {
    position: 'absolute',
    width: 130,
    height: 2,
    backgroundColor: colors.accent,
    opacity: 0.7,
  },
  crosshairV: {
    position: 'absolute',
    width: 2,
    height: 130,
    backgroundColor: colors.accent,
    opacity: 0.7,
  },
  scanSweepLine: {
    position: 'absolute',
    width: 200,
    height: 3,
    backgroundColor: colors.accent,
  },
  lockOnOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(122, 107, 138, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  lockOnText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 3,
    borderColor: colors.ink,
    backgroundColor: colors.white,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 16,
    marginTop: 22,
    ...shadow.hard,
  },
  statusBadgeRecognized: {
    backgroundColor: colors.accentSoft,
  },
  statusPillDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.muted,
  },
  statusPillDotActive: {
    backgroundColor: colors.accent,
  },
  statusBadgeText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '800',
  },
  pairedContainer: {
    flex: 1,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  pairedCardInner: {
    padding: 22,
    alignItems: 'center',
  },
  pairedCheckCircle: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: colors.accent,
    borderWidth: 3,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  pairedBadge: {
    backgroundColor: colors.accentSoft,
    borderWidth: 3,
    borderColor: colors.ink,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  pairedBadgeText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '800',
  },
  patientInfoTitle: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 6,
  },
  patientInfoRow: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
    marginVertical: 2,
  },
  pairedSubtext: {
    color: colors.muted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 12,
  },
  rescanButton: {
    marginTop: 28,
    borderWidth: 3,
    borderColor: colors.ink,
    backgroundColor: colors.white,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 14,
    ...shadow.hard,
  },
  rescanButtonText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '800',
  },
});
