import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadow } from '../theme';
import { SessionRecord, SyncState } from '../types/session';
import { addDays, sessionDateLabel, startOfWeekMonday } from '../services/days';
import {
  DEFAULT_PROFILE,
  UserProfile,
  WEEKDAY_LABELS,
  formatGoalTime,
  initials,
  shiftGoalTime,
} from '../services/profileStorage';
import {
  buildSessionReport,
  buildWeeklyReport,
  computeWeeklyDigest,
  sendReportToDoctor,
} from '../services/doctorReport';

interface Props {
  isPaired: boolean;
  profile: UserProfile;
  sessions: SessionRecord[];
  onProfileChange: (next: UserProfile) => void;
  onClearData: () => void;
  onSync: () => void;
  syncState: SyncState;
  syncNote: string | null;
  onResetPairing: () => void;
}

type Pane =
  | 'root'
  | 'name'
  | 'details'
  | 'doctor'
  | 'preferences'
  | 'goal'
  | 'history'
  | 'reminders'
  | 'device';

const GOAL_CHOICES = [1, 3, 5, 7];

type DetailField = 'phone' | 'birthday' | 'emergencyName' | 'doctorName' | 'doctorEmail' | 'doctorClinic';

function screeningsThisWeek(sessions: SessionRecord[]): number {
  const start = startOfWeekMonday(new Date()).getTime();
  const end = addDays(new Date(start), 7).getTime();
  return sessions.filter((session) => session.timestamp >= start && session.timestamp < end).length;
}

function orderedDays(days: string[]): string[] {
  return WEEKDAY_LABELS.filter((day) => days.includes(day));
}

export const AccountTab: React.FC<Props> = ({
  isPaired,
  profile,
  sessions,
  onProfileChange,
  onClearData,
  onSync,
  syncState,
  syncNote,
  onResetPairing,
}) => {
  const [pane, setPane] = useState<Pane>('root');
  const [editing, setEditing] = useState<DetailField | null>(null);
  const [nameDraft, setNameDraft] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone);
  const [birthday, setBirthday] = useState(profile.birthday);
  const [emergencyName, setEmergencyName] = useState(profile.emergencyName);
  const [doctorName, setDoctorName] = useState(profile.doctorName);
  const [doctorEmail, setDoctorEmail] = useState(profile.doctorEmail);
  const [doctorClinic, setDoctorClinic] = useState(profile.doctorClinic);
  const [lastSynced, setLastSynced] = useState<string | null>(null);

  useEffect(() => {
    setNameDraft(profile.name);
    setPhone(profile.phone);
    setBirthday(profile.birthday);
    setEmergencyName(profile.emergencyName);
    setDoctorName(profile.doctorName);
    setDoctorEmail(profile.doctorEmail);
    setDoctorClinic(profile.doctorClinic);
  }, [
    profile.name,
    profile.phone,
    profile.birthday,
    profile.emergencyName,
    profile.doctorName,
    profile.doctorEmail,
    profile.doctorClinic,
  ]);

  useEffect(() => {
    if (syncState === 'success') {
      setLastSynced(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    }
  }, [syncState]);

  const doneThisWeek = screeningsThisWeek(sessions);
  const history = [...sessions].sort((a, b) => b.timestamp - a.timestamp);
  const reminderLabel = orderedDays(profile.reminderDays).join(' ') || 'Off';

  const confirmLogout = () => {
    Alert.alert('Log out', 'Disconnect this phone from the device? Your name and screenings stay on this phone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', onPress: onResetPairing },
    ]);
  };

  const confirmDelete = () => {
    Alert.alert('Delete account', 'Clear your name, details, and screening history on this phone?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          onProfileChange(DEFAULT_PROFILE);
          onClearData();
          onResetPairing();
          setPane('root');
        },
      },
    ]);
  };

  const saveName = () => {
    const name = nameDraft.trim();
    if (!name) return;
    onProfileChange({ ...profile, name });
    setPane('root');
  };

  const saveField = () => {
    onProfileChange({
      ...profile,
      phone: phone.trim(),
      birthday: birthday.trim(),
      emergencyName: emergencyName.trim(),
      doctorName: doctorName.trim(),
      doctorEmail: doctorEmail.trim(),
      doctorClinic: doctorClinic.trim(),
    });
    setEditing(null);
  };

  const currentDoctorProfile = (): UserProfile => ({
    ...profile,
    doctorName: doctorName.trim(),
    doctorEmail: doctorEmail.trim(),
    doctorClinic: doctorClinic.trim(),
  });

  const handleSendWeeklyFromProfile = () => {
    const nextProfile = currentDoctorProfile();
    onProfileChange(nextProfile);
    setEditing(null);
    const report = buildWeeklyReport(sessions, nextProfile);
    void sendReportToDoctor(report, nextProfile);
  };

  const handleSendLatestFromProfile = () => {
    const latest = history[0];
    if (!latest) {
      Alert.alert('No screenings yet', 'Complete a screening first to email an individual report.');
      return;
    }
    const nextProfile = currentDoctorProfile();
    onProfileChange(nextProfile);
    setEditing(null);
    const report = buildSessionReport(latest, nextProfile);
    void sendReportToDoctor(report, nextProfile);
  };

  const toggleDay = (day: string) => {
    const reminderDays = profile.reminderDays.includes(day)
      ? profile.reminderDays.filter((item) => item !== day)
      : [...profile.reminderDays, day];
    onProfileChange({ ...profile, reminderDays });
  };

  const syncLabel =
    syncState === 'syncing' ? 'Syncing' : syncState === 'error' ? 'Offline' : syncState === 'success' ? 'Synced' : lastSynced ?? 'Sync';
  const goalTimeLabel = formatGoalTime(profile.goalTime);

  if (pane !== 'root') {
    return (
      <View style={styles.container}>
        <View style={styles.detailHeader}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Back to profile"
            style={styles.backBtn}
            onPress={() => setPane('root')}
          >
            <Ionicons name="chevron-back" size={20} color={colors.ink} />
          </TouchableOpacity>
          <Text style={styles.detailTitle}>{detailTitle(pane)}</Text>
          <View style={styles.backSpacer} />
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {pane === 'name' ? (
            <View style={styles.card}>
              <View style={styles.form}>
                <Text style={styles.fieldLabel}>Name</Text>
                <TextInput
                  value={nameDraft}
                  onChangeText={setNameDraft}
                  placeholder="Your name"
                  placeholderTextColor={colors.muted}
                  style={styles.field}
                />
                <TouchableOpacity
                  accessibilityRole="button"
                  style={[styles.saveBtn, !nameDraft.trim() && styles.saveBtnOff]}
                  onPress={saveName}
                  disabled={!nameDraft.trim()}
                >
                  <Text style={styles.saveText}>Save name</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {pane === 'details' ? (
            <>
              <View style={styles.card}>
                <View style={styles.featured}>
                  <View style={styles.rowBody}>
                    <Text style={styles.fieldLabel}>Name</Text>
                    <Text style={styles.featuredValue}>{profile.name}</Text>
                  </View>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Change name"
                    style={styles.changeBtn}
                    onPress={() => setPane('name')}
                  >
                    <Text style={styles.saveText}>Change name</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={[styles.card, styles.cardGap]}>
                <FieldRow
                  label="Phone"
                  value={phone}
                  placeholder="Add"
                  editing={editing === 'phone'}
                  keyboardType="phone-pad"
                  onChangeText={setPhone}
                  onEdit={() => setEditing('phone')}
                  onSave={saveField}
                />
                <View style={styles.dividerFlush} />
                <FieldRow
                  label="Birthday"
                  value={birthday}
                  placeholder="Add"
                  editing={editing === 'birthday'}
                  onChangeText={setBirthday}
                  onEdit={() => setEditing('birthday')}
                  onSave={saveField}
                />
                <View style={styles.dividerFlush} />
                <FieldRow
                  label="Emergency contact"
                  value={emergencyName}
                  placeholder="Add"
                  editing={editing === 'emergencyName'}
                  onChangeText={setEmergencyName}
                  onEdit={() => setEditing('emergencyName')}
                  onSave={saveField}
                />
              </View>
            </>
          ) : null}

          {pane === 'doctor' ? (
            <>
              <View style={styles.card}>
                <FieldRow
                  label="Doctor name"
                  value={doctorName}
                  placeholder="Dr. Sarah Chen"
                  editing={editing === 'doctorName'}
                  onChangeText={setDoctorName}
                  onEdit={() => setEditing('doctorName')}
                  onSave={saveField}
                />
                <View style={styles.dividerFlush} />
                <FieldRow
                  label="Doctor email"
                  value={doctorEmail}
                  placeholder="doctor@clinic.org"
                  editing={editing === 'doctorEmail'}
                  keyboardType="email-address"
                  onChangeText={setDoctorEmail}
                  onEdit={() => setEditing('doctorEmail')}
                  onSave={saveField}
                />
                <View style={styles.dividerFlush} />
                <FieldRow
                  label="Clinic / practice"
                  value={doctorClinic}
                  placeholder="Memory Care Clinic"
                  editing={editing === 'doctorClinic'}
                  onChangeText={setDoctorClinic}
                  onEdit={() => setEditing('doctorClinic')}
                  onSave={saveField}
                />
              </View>

              <View style={[styles.card, styles.cardGap]}>
                <View style={styles.form}>
                  <Text style={styles.fieldLabel}>Send screening reports</Text>
                  <Text style={styles.hint}>
                    {computeWeeklyDigest(sessions).windowLabel}: {computeWeeklyDigest(sessions).count}{' '}
                    screening{computeWeeklyDigest(sessions).count === 1 ? '' : 's'} ·{' '}
                    {computeWeeklyDigest(sessions).avgScore}% average task score.
                  </Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Email weekly screening summary"
                    style={styles.doctorActionBtn}
                    onPress={handleSendWeeklyFromProfile}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="mail-outline" size={16} color={colors.white} />
                    <Text style={styles.doctorActionText}>Email weekly average</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Email latest individual screening"
                    style={styles.doctorActionBtnGhost}
                    onPress={handleSendLatestFromProfile}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="document-text-outline" size={16} color={colors.ink} />
                    <Text style={styles.doctorActionGhostText}>
                      {history[0]
                        ? `Email latest screening (${sessionDateLabel(history[0])})`
                        : 'Email latest screening'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </>
          ) : null}

          {pane === 'preferences' ? (
            <View style={styles.card}>
              <View style={styles.form}>
                <Text style={styles.fieldLabel}>Reminder time</Text>
                <Text style={styles.featuredValue}>{goalTimeLabel}</Text>
                <Text style={styles.hint}>Set this on Weekly goal. Saved on this phone.</Text>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityState={{ checked: profile.remindIfBehind }}
                  style={styles.checkRow}
                  onPress={() => onProfileChange({ ...profile, remindIfBehind: !profile.remindIfBehind })}
                >
                  <Ionicons
                    name={profile.remindIfBehind ? 'checkbox' : 'square-outline'}
                    size={18}
                    color={colors.ink}
                  />
                  <Text style={styles.checkText}>Remind me only when I am behind my goal</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {pane === 'goal' ? (
            <>
              <View style={styles.card}>
                <View style={styles.featured}>
                  <View style={styles.rowBody}>
                    <Text style={styles.fieldLabel}>Reminder time</Text>
                    <Text style={styles.featuredValue}>{goalTimeLabel}</Text>
                  </View>
                  <View style={styles.timeSteps}>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel="Earlier time"
                      style={styles.stepBtn}
                      onPress={() => onProfileChange({ ...profile, goalTime: shiftGoalTime(profile.goalTime, -30) })}
                    >
                      <Ionicons name="remove" size={18} color={colors.ink} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel="Later time"
                      style={styles.stepBtn}
                      onPress={() => onProfileChange({ ...profile, goalTime: shiftGoalTime(profile.goalTime, 30) })}
                    >
                      <Ionicons name="add" size={18} color={colors.ink} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
              <View style={[styles.card, styles.cardGap]}>
                <View style={styles.form}>
                  <Text style={styles.fieldLabel}>Screenings each week</Text>
                  <View style={styles.choiceRow}>
                    {GOAL_CHOICES.map((goal) => {
                      const active = profile.weeklyGoal === goal;
                      return (
                        <TouchableOpacity
                          key={goal}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          style={[styles.choice, active && styles.choiceOn]}
                          onPress={() => onProfileChange({ ...profile, weeklyGoal: goal })}
                        >
                          <Text style={[styles.choiceText, active && styles.choiceTextOn]}>{goal}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text style={styles.goalProgress}>
                    {doneThisWeek} of {profile.weeklyGoal} this week
                  </Text>
                </View>
              </View>
            </>
          ) : null}

          {pane === 'history' ? (
            history.length === 0 ? (
              <View style={styles.card}>
                <View style={styles.form}>
                  <Text style={styles.emptyTitle}>No screenings yet</Text>
                  <Text style={styles.hint}>A finished exam shows up here.</Text>
                </View>
              </View>
            ) : (
              <View style={styles.card}>
                {history.map((session, index) => (
                  <View key={session.id}>
                    {index > 0 ? <View style={styles.divider} /> : null}
                    <View style={styles.historyRow}>
                      <View style={styles.rowBody}>
                        <Text style={styles.rowLabel}>{sessionDateLabel(session)}</Text>
                        <Text style={styles.rowValue}>{session.timeStr}</Text>
                      </View>
                      <Text style={styles.historyScore}>{session.score}%</Text>
                    </View>
                  </View>
                ))}
              </View>
            )
          ) : null}

          {pane === 'reminders' ? (
            <View style={styles.card}>
              <View style={styles.form}>
                <Text style={styles.hint}>
                  {goalTimeLabel}
                  {profile.remindIfBehind ? ', only if you are behind' : ''}. Saved on this phone.
                </Text>
                <View style={styles.choiceRow}>
                  {WEEKDAY_LABELS.map((day) => {
                    const active = profile.reminderDays.includes(day);
                    return (
                      <TouchableOpacity
                        key={day}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={`${active ? 'Remove' : 'Add'} ${day} reminder`}
                        style={[styles.dayChip, active && styles.choiceOn]}
                        onPress={() => toggleDay(day)}
                      >
                        <Text style={[styles.choiceText, active && styles.choiceTextOn]}>{day}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </View>
          ) : null}

          {pane === 'device' ? (
            <View style={styles.card}>
              <InfoRow label="Status" value={isPaired ? 'Paired' : 'Unpaired'} />
              <View style={styles.divider} />
              <InfoRow label="Model" value="ESP32-S3 round screen" />
              <View style={styles.divider} />
              <InfoRow label="Patient" value="#PT-8F24" />
            </View>
          ) : null}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Change your name"
          style={styles.card}
          onPress={() => setPane('name')}
        >
          <View style={styles.identity}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials(profile.name)}</Text>
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.identityName}>{profile.name}</Text>
              <Text style={styles.identityMeta}>Patient #PT-8F24</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </View>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          <Row
            icon="person-outline"
            label="Personal details"
            value={profile.phone || 'Add'}
            onPress={() => setPane('details')}
          />
          <View style={styles.divider} />
          <Row
            icon="medkit-outline"
            label="Health professional"
            value={profile.doctorName || profile.doctorEmail || 'Add'}
            onPress={() => setPane('doctor')}
          />
          <View style={styles.divider} />
          <Row
            icon="options-outline"
            label="Preferences"
            value={goalTimeLabel}
            onPress={() => setPane('preferences')}
          />
          <View style={styles.divider} />
          <Row
            icon="hardware-chip-outline"
            label="Device"
            value={isPaired ? 'Paired' : 'Unpaired'}
            onPress={() => setPane('device')}
          />
        </View>

        <Text style={styles.sectionTitle}>Goals and tracking</Text>
        <View style={styles.card}>
          <Row
            icon="flag-outline"
            label="Weekly goal"
            value={goalTimeLabel}
            onPress={() => setPane('goal')}
          />
          <View style={styles.divider} />
          <Row
            icon="calendar-outline"
            label="Screening history"
            value={String(history.length)}
            onPress={() => setPane('history')}
          />
          <View style={styles.divider} />
          <Row
            icon="alarm-outline"
            label="Tracking reminders"
            value={reminderLabel}
            onPress={() => setPane('reminders')}
          />
        </View>

        <Text style={styles.sectionTitle}>On this phone</Text>
        <View style={styles.card}>
          <Row icon="refresh-outline" label="Sync session data" value={syncLabel} onPress={onSync} />
        </View>
        {syncState === 'error' && syncNote ? <Text style={styles.syncNote}>{syncNote}</Text> : null}

        <Text style={styles.sectionTitle}>Account actions</Text>
        <View style={styles.card}>
          <Row icon="log-out-outline" label="Logout" onPress={confirmLogout} />
          <View style={styles.divider} />
          <Row icon="person-remove-outline" label="Delete account" muted onPress={confirmDelete} />
        </View>
      </ScrollView>
    </View>
  );
};

function detailTitle(pane: Pane): string {
  switch (pane) {
    case 'name':
      return 'Your name';
    case 'details':
      return 'Personal details';
    case 'doctor':
      return 'Health professional';
    case 'preferences':
      return 'Preferences';
    case 'goal':
      return 'Weekly goal';
    case 'history':
      return 'Screening history';
    case 'reminders':
      return 'Tracking reminders';
    case 'device':
      return 'Device';
    default:
      return 'Profile';
  }
}

function FieldRow({
  label,
  value,
  placeholder,
  editing,
  keyboardType,
  onChangeText,
  onEdit,
  onSave,
}: {
  label: string;
  value: string;
  placeholder: string;
  editing: boolean;
  keyboardType?: 'default' | 'phone-pad' | 'email-address';
  onChangeText: (text: string) => void;
  onEdit: () => void;
  onSave: () => void;
}) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldRowLabel}>{label}</Text>
      {editing ? (
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          style={styles.fieldEdit}
          keyboardType={keyboardType}
          autoFocus
          onSubmitEditing={onSave}
        />
      ) : (
        <Text style={[styles.fieldRowValue, !value && styles.fieldRowEmpty]} numberOfLines={1}>
          {value || placeholder}
        </Text>
      )}
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={editing ? `Save ${label}` : `Edit ${label}`}
        onPress={editing ? onSave : onEdit}
        style={styles.pencilBtn}
      >
        <Ionicons name={editing ? 'checkmark' : 'pencil'} size={16} color={colors.ink} />
      </TouchableOpacity>
    </View>
  );
}

function Row({
  icon,
  label,
  value,
  muted,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  muted?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} style={styles.row} onPress={onPress}>
      <Ionicons name={icon} size={20} color={muted ? colors.muted : colors.ink} />
      <Text style={[styles.rowLabel, muted && styles.mutedLabel]}>{label}</Text>
      {value ? (
        <Text style={styles.rowValue} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
    </TouchableOpacity>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
    paddingTop: 18,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.ink,
    letterSpacing: -0.6,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: colors.ink,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.hard,
  },
  backSpacer: {
    width: 40,
  },
  detailTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '900',
    color: colors.ink,
    textAlign: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 40,
    gap: 0,
  },
  sectionTitle: {
    marginTop: 22,
    marginBottom: 8,
    marginLeft: 4,
    fontSize: 16,
    fontWeight: '800',
    color: colors.muted,
  },
  card: {
    backgroundColor: colors.white,
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 22,
    ...shadow.hard,
  },
  cardGap: {
    marginTop: 14,
  },
  featured: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
  },
  featuredValue: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.ink,
  },
  changeBtn: {
    flexShrink: 0,
    backgroundColor: colors.ink,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  timeSteps: {
    flexDirection: 'row',
    gap: 8,
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: colors.ink,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  fieldRowLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.ink,
  },
  fieldRowValue: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'right',
  },
  fieldRowEmpty: {
    color: colors.muted,
    fontWeight: '700',
  },
  fieldEdit: {
    flex: 1,
    height: 36,
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 10,
    backgroundColor: colors.paper,
    paddingHorizontal: 8,
    color: colors.ink,
    fontWeight: '700',
    textAlign: 'right',
  },
  pencilBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dividerFlush: {
    height: 2,
    backgroundColor: colors.ink,
    opacity: 0.1,
  },
  syncNote: {
    marginTop: 8,
    marginLeft: 4,
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
    lineHeight: 18,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.accent,
    borderWidth: 3,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.white,
  },
  identityName: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.ink,
  },
  identityMeta: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: colors.ink,
  },
  mutedLabel: {
    color: colors.muted,
  },
  rowValue: {
    maxWidth: 120,
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
    textAlign: 'right',
  },
  divider: {
    height: 2,
    marginLeft: 46,
    backgroundColor: colors.ink,
    opacity: 0.1,
  },
  form: {
    padding: 16,
    gap: 8,
  },
  fieldLabel: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '800',
    color: colors.ink,
  },
  field: {
    height: 44,
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 12,
    backgroundColor: colors.paper,
    paddingHorizontal: 10,
    color: colors.ink,
    fontWeight: '700',
  },
  saveBtn: {
    alignSelf: 'flex-start',
    marginTop: 8,
    backgroundColor: colors.ink,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  saveBtnOff: {
    opacity: 0.4,
  },
  saveText: {
    color: colors.white,
    fontWeight: '800',
    fontSize: 13,
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  choice: {
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.white,
  },
  dayChip: {
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: colors.white,
  },
  choiceOn: {
    backgroundColor: colors.accent,
  },
  choiceText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.ink,
  },
  choiceTextOn: {
    color: colors.white,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  checkText: {
    flex: 1,
    color: colors.ink,
    fontSize: 14,
    fontWeight: '800',
  },
  goalProgress: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.ink,
  },
  hint: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
    lineHeight: 18,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.ink,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 12,
  },
  historyScore: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.ink,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  infoValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'right',
  },
  doctorActionBtn: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  doctorActionText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.white,
  },
  doctorActionBtnGhost: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.paper,
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  doctorActionGhostText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.ink,
  },
});
