import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

export type TabKey = 'account' | 'lab' | 'chat' | 'games' | 'clinics' | 'analytics';

interface Props {
  currentTab: TabKey;
  onSelectTab: (tab: TabKey) => void;
}

export const BottomTabBar: React.FC<Props> = ({ currentTab, onSelectTab }) => {
  const item = (key: TabKey, label: string, icon: keyof typeof Ionicons.glyphMap, iconOutline: keyof typeof Ionicons.glyphMap) => {
    const active = currentTab === key;
    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => onSelectTab(key)}
        style={styles.tabItem}
      >
        <View style={[styles.iconBox, active && styles.iconBoxActive]}>
          <Ionicons
            name={active ? icon : iconOutline}
            size={18}
            color={active ? colors.white : colors.ink}
          />
        </View>
        <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.tabBar}>
      {item('account', 'Account', 'person', 'person-outline')}
      {item('lab', 'Lab', 'scan', 'scan-outline')}
      {item('chat', 'Chat', 'chatbubble', 'chatbubble-outline')}
      {item('games', 'Games', 'extension-puzzle', 'extension-puzzle-outline')}
      {item('clinics', 'Clinics', 'medkit', 'medkit-outline')}
      {item('analytics', 'Stats', 'bar-chart', 'bar-chart-outline')}
    </View>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    height: 82,
    backgroundColor: colors.white,
    borderTopWidth: 3,
    borderTopColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingBottom: 12,
    paddingHorizontal: 4,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    gap: 4,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 9,
    borderWidth: 3,
    borderColor: colors.ink,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBoxActive: {
    backgroundColor: colors.accent,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.muted,
  },
  tabLabelActive: {
    color: colors.ink,
  },
});
