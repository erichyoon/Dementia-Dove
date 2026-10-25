import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SessionRecord } from '../types/session';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadow } from '../theme';
import { sessionDateLabel } from '../services/days';

interface Props {
  session: SessionRecord;
}

function voiceLine(session: SessionRecord): string | null {
  if (session.voicePrediction && session.voiceConfidence) {
    const mark = session.voiceStatus === 'truncated' ? ' · clip cut at 150s' : '';
    return `${session.voicePrediction} · ${session.voiceConfidence.alzheimer}% Alzheimer${mark}`;
  }
  if (session.voiceStatus === 'unscored') return 'Voice recorded · model not running';
  return null;
}

function voiceDetail(session: SessionRecord): string {
  const features = session.voiceFeatures;
  const summary = voiceLine(session) || 'No voice score';
  if (!features) return summary;
  return [
    summary,
    `${features.duration}s · ${features.pause_count} pauses · ${features.speech_rate}/s speech`,
    `Pitch ${features.pitch_mean} Hz · ${features.silence_ratio}% silence`,
  ].join('\n');
}

export const SessionCard: React.FC<Props> = ({ session }) => {
  const [expanded, setExpanded] = useState(false);
  const durationMin = Math.round(session.durationSeconds / 60);

  return (
    <View style={styles.card}>
      {/* Clickable Card Header */}
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => setExpanded(!expanded)}
        style={styles.cardHeader}
      >
        <View style={styles.headerLeft}>
          <View style={styles.calendarIcon}>
            <Ionicons name="radio-button-on" size={16} color={colors.white} />
          </View>
          <View>
            <Text style={styles.sessionDate}>
              {sessionDateLabel(session)} • {session.timeStr}
            </Text>
            <Text style={styles.sessionDuration}>{durationMin} min duration</Text>
            {voiceLine(session) ? <Text style={styles.voiceLine}>{voiceLine(session)}</Text> : null}
          </View>
        </View>

        <View style={styles.headerRight}>
          <View style={styles.scoreBadge}>
            <Text style={styles.scoreText}>{session.score}%</Text>
          </View>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.muted}
          />
        </View>
      </TouchableOpacity>

      {/* Expanded Analytics Details */}
      {expanded && (
        <View style={styles.detailsContent}>
          {/* Patient-Friendly Feedback Note */}
          <View style={styles.feedbackBox}>
            <Text style={styles.feedbackLabel}>DOCTOR / SYSTEM NOTE:</Text>
            <Text style={styles.feedbackText}>{session.patientFeedback}</Text>
          </View>

          {session.voiceStatus ? (
            <View style={styles.feedbackBox}>
              <Text style={styles.feedbackLabel}>VOICE MODEL</Text>
              <Text style={styles.feedbackText}>{voiceDetail(session)}</Text>
            </View>
          ) : null}

          {/* 3 Metric Pills */}
          <View style={styles.metricsRow}>
            {/* Physical Button Presses */}
            <View style={styles.metricPill}>
              <Text style={styles.metricPillVal}>{session.buttonPresses}</Text>
              <Text style={styles.metricPillLabel}>TOP BUTTON</Text>
            </View>

            {/* Touch Screen Interactions */}
            <View style={styles.metricPill}>
              <Text style={styles.metricPillVal}>{session.touchInteractions}</Text>
              <Text style={styles.metricPillLabel}>TOUCHES</Text>
            </View>

            {/* Reaction Time */}
            <View style={styles.metricPill}>
              <Text style={styles.metricPillVal}>{session.avgReactionTimeMs} ms</Text>
              <Text style={styles.metricPillLabel}>REACTION</Text>
            </View>
          </View>

          {/* Activity Timeline Bar */}
          {session.timeline && session.timeline.length > 0 && (
            <View style={styles.timelineSection}>
              <Text style={styles.timelineTitle}>ACTIVITY TIMELINE</Text>
              <View style={styles.timelineBars}>
                {session.timeline.map((point, index) => (
                  <View key={index} style={styles.timelineBarCol}>
                    <View
                      style={[
                        styles.timelineBarFill,
                        { height: `${Math.max(15, point.activityLevel)}%` },
                      ]}
                    />
                    <Text style={styles.timelineMinLabel}>{point.minute}m</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 22,
    marginBottom: 12,
    borderWidth: 3,
    borderColor: colors.ink,
    overflow: 'hidden',
    ...shadow.hard,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  calendarIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.accent,
    borderWidth: 3,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionDate: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.ink,
  },
  sessionDuration: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
    fontWeight: '600',
  },
  voiceLine: {
    fontSize: 12,
    color: colors.ink,
    marginTop: 4,
    fontWeight: '800',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  scoreBadge: {
    backgroundColor: colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: colors.ink,
  },
  scoreText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.white,
  },
  detailsContent: {
    borderTopWidth: 3,
    borderTopColor: colors.ink,
    padding: 14,
    backgroundColor: colors.paper,
  },
  feedbackBox: {
    backgroundColor: colors.accentSoft,
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  feedbackLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.muted,
    marginBottom: 4,
  },
  feedbackText: {
    fontSize: 12,
    color: colors.ink,
    lineHeight: 18,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  metricPill: {
    flex: 1,
    backgroundColor: colors.white,
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricPillVal: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.ink,
  },
  metricPillLabel: {
    fontSize: 9,
    color: colors.muted,
    fontWeight: '800',
    marginTop: 3,
  },
  timelineSection: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: colors.ink,
    padding: 10,
  },
  timelineTitle: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.muted,
    marginBottom: 8,
  },
  timelineBars: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 50,
  },
  timelineBarCol: {
    alignItems: 'center',
    width: 24,
    height: '100%',
    justifyContent: 'flex-end',
  },
  timelineBarFill: {
    width: 12,
    backgroundColor: colors.accent,
    borderRadius: 3,
  },
  timelineMinLabel: {
    fontSize: 9,
    color: colors.muted,
    marginTop: 4,
  },
});
