import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { LogEntry } from '../types/device';

interface Props {
  logs: LogEntry[];
}

export const ConsoleLogsCard: React.FC<Props> = ({ logs }) => {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Hardware Activity Logs</Text>
      <ScrollView
        style={styles.logContainer}
        contentContainerStyle={styles.logContent}
        nestedScrollEnabled
      >
        {logs.length === 0 ? (
          <Text style={styles.emptyText}>Waiting for hardware events...</Text>
        ) : (
          logs.map((log) => (
            <View key={log.id} style={styles.logRow}>
              <Text style={styles.timestamp}>{log.timestamp}</Text>
              <Text
                style={[
                  styles.logMessage,
                  log.type === 'success' && styles.successMsg,
                  log.type === 'warn' && styles.warnMsg,
                  log.type === 'hardware' && styles.hardwareMsg,
                ]}
              >
                {log.message}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#131d31',
    borderRadius: 20,
    padding: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  logContainer: {
    maxHeight: 140,
    backgroundColor: '#0a0f1d',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  logContent: {
    gap: 4,
  },
  emptyText: {
    color: '#64748b',
    fontSize: 12,
    fontStyle: 'italic',
  },
  logRow: {
    flexDirection: 'row',
    gap: 6,
  },
  timestamp: {
    color: '#64748b',
    fontSize: 11,
    fontFamily: 'Courier',
  },
  logMessage: {
    flex: 1,
    color: '#cbd5e1',
    fontSize: 11,
    fontFamily: 'Courier',
  },
  successMsg: {
    color: '#34d399',
  },
  warnMsg: {
    color: '#facc15',
  },
  hardwareMsg: {
    color: '#38bdf8',
  },
});
