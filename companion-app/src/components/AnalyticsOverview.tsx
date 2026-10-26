import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PatientSummaryStats } from '../types/session';

interface Props {
  stats: PatientSummaryStats;
}

export const AnalyticsOverview: React.FC<Props> = ({ stats }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.sectionHeader}>Your Progress Summary</Text>

      <View style={styles.grid}>
        <View style={styles.statBox}>
          <View style={styles.iconCircleBlue}>
            <Ionicons name="fitness-outline" size={18} color="#0284c7" />
          </View>
          <Text style={styles.statValue}>{stats.totalSessions}</Text>
          <Text style={styles.statLabel}>Completed Sessions</Text>
        </View>

        <View style={styles.statBox}>
          <View style={styles.iconCircleGreen}>
            <Ionicons name="ribbon-outline" size={18} color="#059669" />
          </View>
          <Text style={styles.statValue}>{stats.avgScore}%</Text>
          <Text style={styles.statLabel}>Avg. Adherence</Text>
        </View>

        <View style={styles.statBox}>
          <View style={styles.iconCirclePurple}>
            <Ionicons name="hourglass-outline" size={18} color="#7c3aed" />
          </View>
          <Text style={styles.statValue}>{stats.totalMinutes} m</Text>
          <Text style={styles.statLabel}>Total Time</Text>
        </View>

        <View style={styles.statBox}>
          <View style={styles.iconCircleAmber}>
            <Ionicons name="sparkles-outline" size={18} color="#d97706" />
          </View>
          <Text style={styles.statValue}>{stats.completionRate}%</Text>
          <Text style={styles.statLabel}>Completion Rate</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  statBox: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    width: '48%',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  iconCircleBlue: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  iconCircleGreen: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#d1fae5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  iconCirclePurple: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#ede9fe',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  iconCircleAmber: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#fef3c7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
    fontWeight: '500',
  },
});
