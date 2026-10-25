import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { SessionRecord, SyncState } from './src/types/session';
import {
  getStoredSessions,
  clearAllStoredSessions,
} from './src/services/sessionStorage';
import { syncSessionFromDevice, startDeviceExamination } from './src/services/deviceSync';
import { refreshSessionsFromCloud } from './src/services/cloudSessions';

import { BottomTabBar, TabKey } from './src/components/BottomTabBar';
import { DashboardTab } from './src/components/DashboardTab';
import { ScreenTab } from './src/components/ScreenTab';
import { GroupsTab } from './src/components/GroupsTab';
import { AccountTab } from './src/components/AccountTab';
import { ClinicsTab } from './src/components/ClinicsTab';
import { DEFAULT_PROFILE, getProfile, saveProfile, UserProfile } from './src/services/profileStorage';

export default function App() {
  const [currentTab, setCurrentTab] = useState<TabKey>('dashboard');
  const [isPaired, setIsPaired] = useState<boolean>(false);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [syncNote, setSyncNote] = useState<string | null>(null);

  // Load offline sessions from storage on mount
  const refreshSessions = async () => {
    const data = await getStoredSessions();
    setSessions(data);
  };

  useEffect(() => {
    refreshSessionsFromCloud()
      .then(setSessions)
      .catch(() => refreshSessions());
    getProfile().then(setProfile);
  }, []);

  const updateProfile = async (next: UserProfile) => {
    setProfile(next);
    await saveProfile(next);
  };

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
      patientName: profile.name,
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
    setSyncNote(null);
    const result = await syncSessionFromDevice('192.168.4.1');
    await refreshSessions();
    if (result.success) {
      setSyncState('success');
      setTimeout(() => setSyncState('idle'), 2500);
      return;
    }
    setSyncNote(result.message);
    setSyncState('error');
  };

  const handleClearData = async () => {
    await clearAllStoredSessions();
    setSessions([]);
  };

  return (
    <SafeAreaProvider>
      <View style={styles.frame}>
      <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      {/* Main Tab Screen Content */}
      <View style={styles.content}>
        {currentTab === 'dashboard' && (
          <DashboardTab isPaired={isPaired} sessions={sessions} displayName={profile.name} />
        )}

        {currentTab === 'screen' && (
          <ScreenTab
            isPaired={isPaired}
            onPairSuccess={handlePairSuccess}
            onResetPairing={handleResetPairing}
            sessions={sessions}
            syncState={syncState}
            onSync={handleSyncData}
          />
        )}

        {currentTab === 'groups' && <GroupsTab />}

        {currentTab === 'nearby' && <ClinicsTab />}

        {currentTab === 'account' && (
          <AccountTab
            isPaired={isPaired}
            profile={profile}
            sessions={sessions}
            onProfileChange={updateProfile}
            onClearData={handleClearData}
            onSync={handleSyncData}
            syncState={syncState}
            syncNote={syncNote}
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
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  frame: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    backgroundColor: '#E7E0D4',
  },
  container: {
    flex: 1,
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#F6F0E4',
  },
  content: {
    flex: 1,
    minHeight: 0,
    backgroundColor: '#F6F0E4',
  },
});
