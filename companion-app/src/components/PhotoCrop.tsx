import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  Modal,
  StyleSheet,
  PanResponder,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { colors, shadow } from '../theme';

const STAGE = 248;
const OUTPUT = 256;

type Props = {
  uri: string;
  width: number;
  height: number;
  onCancel: () => void;
  onUse: (dataUrl: string) => void;
};

function coverScale(width: number, height: number): number {
  return Math.max(STAGE / width, STAGE / height);
}

function placed(width: number, height: number, zoom: number, x: number, y: number) {
  const scale = coverScale(width, height) * zoom;
  const drawnWidth = width * scale;
  const drawnHeight = height * scale;
  const nextX = Math.min(0, Math.max(STAGE - drawnWidth, x));
  const nextY = Math.min(0, Math.max(STAGE - drawnHeight, y));
  return { scale, drawnWidth, drawnHeight, x: nextX, y: nextY };
}

async function cropToJpeg(
  uri: string,
  originX: number,
  originY: number,
  size: number
): Promise<string> {
  const image = await loadImage(uri);
  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT;
  canvas.height = OUTPUT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not crop that photo.');
  context.drawImage(image, originX, originY, size, size, 0, 0, OUTPUT, OUTPUT);
  return canvas.toDataURL('image/jpeg', 0.72);
}

function loadImage(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not read that photo.'));
    image.src = uri;
  });
}

export function PhotoCrop({ uri, width, height, onCancel, onUse }: Props) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState(() => {
    const first = placed(width, height, 1, 0, 0);
    return {
      x: (STAGE - first.drawnWidth) / 2,
      y: (STAGE - first.drawnHeight) / 2,
    };
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const dragOrigin = useRef(offset);
  const sizeRef = useRef({ width, height });
  sizeRef.current = { width, height };

  const frame = useMemo(
    () => placed(width, height, zoom, offset.x, offset.y),
    [width, height, zoom, offset.x, offset.y]
  );

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragOrigin.current = { ...offsetRef.current };
      },
      onPanResponderMove: (_, gesture) => {
        const size = sizeRef.current;
        const next = placed(
          size.width,
          size.height,
          zoomRef.current,
          dragOrigin.current.x + gesture.dx,
          dragOrigin.current.y + gesture.dy
        );
        setOffset({ x: next.x, y: next.y });
      },
    })
  ).current;

  const changeZoom = (nextZoom: number) => {
    const clamped = Math.min(3, Math.max(1, nextZoom));
    const before = placed(width, height, zoom, offset.x, offset.y);
    const centerX = (STAGE / 2 - before.x) / before.scale;
    const centerY = (STAGE / 2 - before.y) / before.scale;
    const nextScale = coverScale(width, height) * clamped;
    const next = placed(
      width,
      height,
      clamped,
      STAGE / 2 - centerX * nextScale,
      STAGE / 2 - centerY * nextScale
    );
    setZoom(clamped);
    setOffset({ x: next.x, y: next.y });
  };

  const confirm = async () => {
    const current = placed(width, height, zoom, offset.x, offset.y);
    const size = Math.max(1, Math.round(STAGE / current.scale));
    const originX = Math.max(0, Math.min(width - size, Math.round(-current.x / current.scale)));
    const originY = Math.max(0, Math.min(height - size, Math.round(-current.y / current.scale)));
    setBusy(true);
    setError(null);
    try {
      onUse(await cropToJpeg(uri, originX, originY, Math.min(size, width - originX, height - originY)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not crop that photo.');
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Crop the photo</Text>
          <Text style={styles.hint}>Drag to choose the part that shows. Move closer to keep less of it.</Text>
          <View style={styles.stage} {...pan.panHandlers}>
            {Platform.OS === 'web' ? (
              <View
                pointerEvents="none"
                style={
                  {
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: STAGE,
                    height: STAGE,
                    backgroundImage: `url("${uri}")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundSize: `${frame.drawnWidth}px ${frame.drawnHeight}px`,
                    backgroundPosition: `${frame.x}px ${frame.y}px`,
                  } as React.ComponentProps<typeof View>['style']
                }
              />
            ) : (
              <Image
                pointerEvents="none"
                source={{ uri }}
                style={{
                  position: 'absolute',
                  width: frame.drawnWidth,
                  height: frame.drawnHeight,
                  left: frame.x,
                  top: frame.y,
                }}
              />
            )}
          </View>
          <View style={styles.zoomRow}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Show more of the photo"
              style={styles.zoomBtn}
              onPress={() => changeZoom(zoom - 0.25)}
            >
              <Text style={styles.zoomText}>Wider</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Show less of the photo"
              style={styles.zoomBtn}
              onPress={() => changeZoom(zoom + 0.25)}
            >
              <Text style={styles.zoomText}>Closer</Text>
            </TouchableOpacity>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            <TouchableOpacity accessibilityRole="button" style={styles.cancel} onPress={onCancel} disabled={busy}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" style={styles.use} onPress={confirm} disabled={busy}>
              {busy ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.useText}>Use crop</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(20, 20, 20, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.white,
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 18,
    padding: 16,
    ...shadow.hard,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.ink,
  },
  hint: {
    marginTop: 4,
    marginBottom: 12,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: colors.muted,
  },
  stage: {
    alignSelf: 'center',
    width: STAGE,
    height: STAGE,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 16,
    backgroundColor: colors.paper,
  },
  zoomRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
  },
  zoomBtn: {
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: colors.white,
  },
  zoomText: {
    fontWeight: '800',
    color: colors.ink,
  },
  error: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 14,
  },
  cancel: {
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: colors.white,
  },
  cancelText: {
    fontWeight: '800',
    color: colors.ink,
  },
  use: {
    minWidth: 108,
    alignItems: 'center',
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: colors.ink,
  },
  useText: {
    fontWeight: '800',
    color: colors.white,
  },
});
