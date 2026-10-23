import React, { useEffect, useState } from 'react';
import { StyleSheet, View, SafeAreaView } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { SessionRecord, SyncState } from './src/types/session';
import {
  getStoredSessions,
  clearAllStoredSessions,
} from './src/services/sessionStorage';
import { syncSessionFromDevice, startDeviceExamination } from './src/services/deviceSync';
import { refreshSessionsFromCloud } from './src/services/cloudSessions';

import { BottomTabBar, TabKey } from './src/components/BottomTabBar';
import { LabTab } from './src/components/LabTab';
import { AnalyticsTab } from './src/components/AnalyticsTab';
import { AccountTab } from './src/components/AccountTab';
import { ClinicsTab } from './src/components/ClinicsTab';
import { ChatbotTab } from './src/components/ChatbotTab';
import { MindGamesTab } from './src/components/MindGamesTab';

export default function App() {
  const [currentTab, setCurrentTab] = useState<TabKey>('lab');
  const [isPaired, setIsPaired] = useState<boolean>(false);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [syncState, setSyncState] = useState<SyncState>('idle');

  // Load offline sessions from storage on mount
  const refreshSessions = async () => {
    const data = await getStoredSessions();
    setSessions(data);
  };

  useEffect(() => {
    refreshSessionsFromCloud()
      .then(setSessions)
      .catch(() => refreshSessions());
  }, []);

  useEffect(() => {
    if (!isPaired) return;
    const timer = setInterval(() => {
      syncSessionFromDevice('192.168.4.1').then(() => refreshSessions());
    }, 4000);
    return () => clearInterval(timer);
  }, [isPaired]);

  // Only reached after LabTab validates the live optical particle code.
  const handlePairSuccess = async () => {
    const kickoff = startDeviceExamination({
      patientName: 'Omar Firdaus',
      patientId: 'PT-8F24',
      examType: 'RECALL Speech Exam',
    });
    setIsPaired(true);
    await kickoff;
    syncSessionFromDevice('192.168.4.1').then(() => refreshSessions());
  };

  const handleResetPairing = () => {
    setIsPaired(false);
  };

  const handleSyncData = async () => {
    setSyncState('syncing');
    await syncSessionFromDevice('192.168.4.1');
    await refreshSessions();
    setSyncState('success');
    setTimeout(() => setSyncState('idle'), 2000);
  };

  const handleClearData = async () => {
    await clearAllStoredSessions();
    setSessions([]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      {/* Main Tab Screen Content */}
      <View style={styles.content}>
        {currentTab === 'lab' && (
          <LabTab
            isPaired={isPaired}
            onPairSuccess={handlePairSuccess}
            onResetPairing={handleResetPairing}
          />
        )}

        {currentTab === 'analytics' && (
          <AnalyticsTab
            sessions={sessions}
            syncState={syncState}
            onSync={handleSyncData}
          />
        )}

        {currentTab === 'chat' && <ChatbotTab isPaired={isPaired} />}

        {currentTab === 'games' && <MindGamesTab />}

        {currentTab === 'clinics' && <ClinicsTab />}

        {currentTab === 'account' && (
          <AccountTab
            isPaired={isPaired}
            onClearData={handleClearData}
            onSync={handleSyncData}
            onResetPairing={handleResetPairing}
          />
        )}
      </View>

      {/* Bottom tabs */}
      <BottomTabBar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F6F0E4',
  },
  content: {
    flex: 1,
    backgroundColor: '#F6F0E4',
  },
});
