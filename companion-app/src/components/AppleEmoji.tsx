import React from 'react';
import { Asset } from 'expo-asset';
import { Image, Platform, StyleSheet, View } from 'react-native';
import { APPLE_SHEET, APPLE_SHEET_PIXELS, AppleEmoji, sheetOrigin } from '../services/appleEmoji';

const GLYPH = 32;

function appleSheetUri(): string | undefined {
  const source = APPLE_SHEET as { uri?: string } | string | number;
  if (typeof source === 'string') return source;
  if (source && typeof source === 'object' && typeof source.uri === 'string') return source.uri;
  if (typeof source === 'number') {
    try {
      return Asset.fromModule(source).uri;
    } catch {
      // The web bundle does not always expose resolveAssetSource.
    }
  }
  if (typeof Image.resolveAssetSource === 'function') {
    return Image.resolveAssetSource(source)?.uri;
  }
  return undefined;
}

export function AppleEmojiGlyph({ emoji, size = GLYPH }: { emoji: AppleEmoji; size?: number }) {
  const origin = sheetOrigin(emoji);
  const scale = size / GLYPH;
  const sheetUri = appleSheetUri();

  if (Platform.OS === 'web') {
    const sheet = APPLE_SHEET_PIXELS * scale;
    return (
      <View
        accessibilityLabel={emoji.name}
        style={
          {
            width: size,
            height: size,
            overflow: 'hidden',
            flexShrink: 0,
            backgroundImage: sheetUri ? `url("${sheetUri}")` : undefined,
            backgroundRepeat: 'no-repeat',
            backgroundSize: `${sheet}px ${sheet}px`,
            backgroundPosition: `-${origin.x * scale}px -${origin.y * scale}px`,
          } as React.ComponentProps<typeof View>['style']
        }
      />
    );
  }

  return (
    <View style={[styles.crop, { width: size, height: size }]}>
      <Image
        source={APPLE_SHEET}
        accessibilityIgnoresInvertColors
        style={{
          position: 'absolute',
          width: APPLE_SHEET_PIXELS * scale,
          height: APPLE_SHEET_PIXELS * scale,
          left: -origin.x * scale,
          top: -origin.y * scale,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  crop: {
    overflow: 'hidden',
  },
});
