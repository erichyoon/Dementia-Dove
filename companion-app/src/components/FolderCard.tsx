import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { colors, shadow } from '../theme';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
}

export const FolderCard: React.FC<Props> = ({ children, style }) => {
  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.tab} />
      <View style={styles.body}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    paddingTop: 12,
    marginBottom: 14,
  },
  tab: {
    position: 'absolute',
    top: 0,
    left: 18,
    width: 78,
    height: 24,
    backgroundColor: colors.accent,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderWidth: 3,
    borderColor: colors.ink,
    zIndex: 0,
    elevation: 0,
  },
  body: {
    position: 'relative',
    zIndex: 2,
    backgroundColor: colors.white,
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 22,
    overflow: 'hidden',
    ...shadow.hard,
  },
});
