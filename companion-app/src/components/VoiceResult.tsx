import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SessionRecord, voiceResultLabel, voiceResultPercent } from '../types/session';
import { colors, shadow } from '../theme';

interface Props {
  listening: boolean;
  session: SessionRecord | null;
  onClose: () => void;
}

function confidenceLine(session: SessionRecord): string {
  if (!session.voiceConfidence || !session.voicePrediction) return 'The recording did not reach the phone.';
  const picked = voiceResultPercent(session.voicePrediction, session.voiceConfidence);
  const cut = session.voiceStatus === 'truncated' ? ' The clip was cut at 150 seconds.' : '';
  return `${picked}% confidence.${cut}`;
}

export const VoiceResult: React.FC<Props> = ({ listening, session, onClose }) => {
  const title = listening ? 'Listening' : session?.voicePrediction ? voiceResultLabel(session.voicePrediction) : 'Exam finished';
  const body = listening
    ? 'The phone is listening to the recording from the board.'
    : session
      ? confidenceLine(session)
      : '';
  return (
    <View style={styles.scrim}>
      <View style={styles.card}>
        <Text style={styles.kicker}>{listening ? 'JUST NOW' : 'VOICE MODEL'}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
        {session && !listening ? (
          <Text style={styles.meta}>Tasks finished {session.score}</Text>
        ) : null}
        <TouchableOpacity accessibilityRole="button" style={styles.done} onPress={onClose} activeOpacity={0.85}>
          <Text style={styles.doneText}>{listening ? 'Dismiss' : 'Done'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(20, 20, 20, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.paper,
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 28,
    padding: 22,
    ...shadow.hard,
  },
  kicker: {
    fontSize: 11,
    letterSpacing: 1.2,
    fontWeight: '800',
    color: colors.muted,
  },
  title: {
    marginTop: 10,
    fontSize: 32,
    lineHeight: 36,
    fontWeight: '900',
    color: colors.ink,
  },
  body: {
    marginTop: 8,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    color: colors.muted,
  },
  meta: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '800',
    color: colors.ink,
  },
  done: {
    marginTop: 18,
    backgroundColor: colors.accent,
    borderWidth: 3,
    borderColor: colors.ink,
    paddingVertical: 12,
    alignItems: 'center',
  },
  doneText: {
    color: colors.white,
    fontWeight: '800',
    fontSize: 16,
  },
});
