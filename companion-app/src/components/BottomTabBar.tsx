import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadow } from '../theme';

export type TabKey = 'dashboard' | 'screen' | 'groups' | 'nearby' | 'account';

interface Props {
  currentTab: TabKey;
  onSelectTab: (tab: TabKey) => void;
}

export const BottomTabBar: React.FC<Props> = ({ currentTab, onSelectTab }) => {
  const item = (key: TabKey, label: string, icon: keyof typeof Ionicons.glyphMap, iconOutline: keyof typeof Ionicons.glyphMap) => {
    const active = currentTab === key;
    return (
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: active }}
        activeOpacity={0.8}
        onPress={() => onSelectTab(key)}
        style={styles.tabItem}
      >
        <View style={[styles.iconSlot, active && styles.iconSlotActive]}>
          <Ionicons
            name={active ? icon : iconOutline}
            size={18}
            color={active ? colors.white : colors.ink}
          />
        </View>
        <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.pill}>
        {item('dashboard', 'Home', 'home', 'home-outline')}
        {item('screen', 'Screen', 'scan', 'scan-outline')}
        {item('groups', 'Groups', 'people', 'people-outline')}
        {item('nearby', 'Nearby', 'medkit', 'medkit-outline')}
        {item('account', 'Profile', 'person', 'person-outline')}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.paper,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 28,
    paddingVertical: 8,
    paddingHorizontal: 6,
    ...shadow.hard,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  iconSlot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'center',
  },
  labelActive: {
    color: colors.accent,
  },
  iconSlotActive: {
    backgroundColor: colors.accent,
    borderColor: colors.ink,
  },
});
