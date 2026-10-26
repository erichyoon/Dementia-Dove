import { Alert, Linking, Share } from 'react-native';
import { SessionRecord, voiceResultLabel, voiceResultPercent } from '../types/session';
import { addDays, sessionDateLabel, startOfDay } from './days';
import { UserProfile } from './profileStorage';

export interface DoctorReportPayload {
  subject: string;
  body: string;
}

export interface WeeklyDigestSummary {
  windowLabel: string;
  count: number;
  avgScore: number;
  avgDurationSeconds: number;
  scoredVoiceCount: number;
  healthyCount: number;
  atRiskCount: number;
  avgSpeechRate: number | null;
  avgPauseCount: number | null;
  avgPitchHz: number | null;
  avgSilenceRatio: number | null;
  sessions: SessionRecord[];
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const rem = Math.round(seconds % 60);
  if (mins <= 0) return `${rem}s`;
  return rem > 0 ? `${mins}m ${rem}s` : `${mins}m`;
}

function formatCompletionStatus(status: SessionRecord['completionStatus']): string {
  if (status === 'completed') return 'Completed (all 6 speech tasks finished)';
  if (status === 'partial') return 'Partially completed';
  return 'In progress';
}

function buildPatientProfileBlock(profile: UserProfile): string[] {
  const rows: string[] = [
    'PATIENT OVERVIEW',
    `Patient Name:       ${profile.name}`,
    'Patient ID:         #PT-8F24',
  ];
  if (profile.birthday.trim()) {
    rows.push(`Date of Birth:      ${profile.birthday.trim()}`);
  }
  if (profile.phone.trim()) {
    rows.push(`Contact Phone:      ${profile.phone.trim()}`);
  }
  if (profile.emergencyName.trim()) {
    rows.push(`Emergency Contact:  ${profile.emergencyName.trim()}`);
  }
  if (profile.doctorClinic.trim()) {
    rows.push(`Receiving Clinic:   ${profile.doctorClinic.trim()}`);
  }
  return rows;
}

function buildSignOff(profile: UserProfile): string[] {
  const lines: string[] = [
    'Please let me know if you would like to review these results together at my next visit or if any follow-up evaluation is recommended.',
    '',
    'Warm regards,',
    profile.name,
  ];
  if (profile.phone.trim()) {
    lines.push(profile.phone.trim());
  }
  lines.push('Patient ID #PT-8F24 · Sent via Dementia Dove');
  return lines;
}

export function computeWeeklyDigest(allSessions: SessionRecord[]): WeeklyDigestSummary {
  const sorted = [...allSessions].sort((a, b) => b.timestamp - a.timestamp);
  const cutoff = addDays(startOfDay(new Date()), -6).getTime();
  const recent = sorted.filter((s) => s.timestamp >= cutoff);
  const useList = recent.length > 0 ? recent : sorted.slice(0, 7);
  const windowLabel =
    recent.length > 0
      ? 'Past 7 days'
      : useList.length > 0
        ? `Recent ${useList.length} screening${useList.length === 1 ? '' : 's'}`
        : 'Past 7 days';

  if (useList.length === 0) {
    return {
      windowLabel,
      count: 0,
      avgScore: 0,
      avgDurationSeconds: 0,
      scoredVoiceCount: 0,
      healthyCount: 0,
      atRiskCount: 0,
      avgSpeechRate: null,
      avgPauseCount: null,
      avgPitchHz: null,
      avgSilenceRatio: null,
      sessions: [],
    };
  }

  const count = useList.length;
  const avgScore = Math.round(useList.reduce((acc, s) => acc + s.score, 0) / count);
  const avgDurationSeconds = Math.round(
    useList.reduce((acc, s) => acc + s.durationSeconds, 0) / count
  );

  const withPrediction = useList.filter((s) => Boolean(s.voicePrediction && s.voiceConfidence));
  let healthyCount = 0;
  let atRiskCount = 0;
  for (const s of withPrediction) {
    if (voiceResultLabel(s.voicePrediction) === 'At risk of dementia') {
      atRiskCount += 1;
    } else {
      healthyCount += 1;
    }
  }

  const withFeatures = useList.filter((s) => Boolean(s.voiceFeatures));
  const fCount = withFeatures.length;
  const avgSpeechRate =
    fCount > 0
      ? round2(withFeatures.reduce((acc, s) => acc + (s.voiceFeatures?.speech_rate || 0), 0) / fCount)
      : null;
  const avgPauseCount =
    fCount > 0
      ? round1(withFeatures.reduce((acc, s) => acc + (s.voiceFeatures?.pause_count || 0), 0) / fCount)
      : null;
  const avgPitchHz =
    fCount > 0
      ? round1(withFeatures.reduce((acc, s) => acc + (s.voiceFeatures?.pitch_mean || 0), 0) / fCount)
      : null;
  const avgSilenceRatio =
    fCount > 0
      ? round1(withFeatures.reduce((acc, s) => acc + (s.voiceFeatures?.silence_ratio || 0), 0) / fCount)
      : null;

  return {
    windowLabel,
    count,
    avgScore,
    avgDurationSeconds,
    scoredVoiceCount: withPrediction.length,
    healthyCount,
    atRiskCount,
    avgSpeechRate,
    avgPauseCount,
    avgPitchHz,
    avgSilenceRatio,
    sessions: useList,
  };
}

export function buildSessionReport(
  session: SessionRecord,
  profile: UserProfile
): DoctorReportPayload {
  const dateLabel = sessionDateLabel(session);
  const subject = `Speech & Cognitive Screening Report — ${profile.name} (${dateLabel})`;

  const greeting = profile.doctorName.trim()
    ? `Dear ${profile.doctorName.trim()},`
    : 'Dear Doctor,';

  const voiceOutcome =
    session.voicePrediction && session.voiceConfidence
      ? `${voiceResultLabel(session.voicePrediction)} (${voiceResultPercent(
          session.voicePrediction,
          session.voiceConfidence
        )}% model confidence)`
      : session.voiceStatus === 'unscored'
        ? 'Audio transfer incomplete (unscored on phone)'
        : 'Pending voice analysis';

  const confidenceBreakdown =
    session.voicePrediction && session.voiceConfidence
      ? `Healthy probability: ${session.voiceConfidence.healthy}%  |  At-risk probability: ${session.voiceConfidence.alzheimer}%`
      : null;

  const f = session.voiceFeatures;
  const featureLines = f
    ? [
        `  • Analyzed Speech Duration:  ${f.duration} seconds`,
        `  • Estimated Speech Rate:     ${f.speech_rate} syllables / sec`,
        `  • Vocal Pause Count:         ${f.pause_count} pauses`,
        `  • Silence-to-Speech Ratio:   ${f.silence_ratio}%`,
        `  • Fundamental Pitch (F0):    ${f.pitch_mean} Hz`,
      ].join('\n')
    : '  • Acoustic biomarker features were not captured for this session.';

  const lines: (string | null)[] = [
    greeting,
    '',
    `I am sharing the results from my Dementia Dove home speech screening completed on ${dateLabel} at ${session.timeStr}. Please find the structured clinical and acoustic summary below for my chart.`,
    '',
    ...buildPatientProfileBlock(profile),
    '',
    'SESSION SUMMARY',
    `Session Reference:  ${session.id}`,
    `Date & Time:        ${dateLabel} at ${session.timeStr}`,
    `Completion Status:  ${formatCompletionStatus(session.completionStatus)}`,
    `Session Duration:   ${formatDuration(session.durationSeconds)}`,
    `Task Adherence:     ${session.score}% (6-part protocol: room tone, sustained phonation, sentence reading, picture description, semantic fluency, and personal narrative)`,
    `Device Engagement:  ${session.touchInteractions} touch responses, ${session.buttonPresses} physical button presses`,
    '',
    'VOICE BIOMARKER & ACOUSTIC ANALYSIS',
    `Screening Outcome:  ${voiceOutcome}`,
    confidenceBreakdown ? `Classifier Split:   ${confidenceBreakdown}` : null,
    '',
    'Acoustic Biomarkers:',
    featureLines,
    '',
    'PROTOCOL & EXAM NOTES',
    session.patientFeedback || 'Self-guided 6-task Dementia Dove speech examination completed on onboard hardware.',
    '',
    ...buildSignOff(profile),
    '',
    'Clinical Disclaimer: This report is generated by the Dementia Dove home screening companion app and on-device acoustic SVM model. It is intended to support longitudinal clinical monitoring and does not constitute a standalone medical diagnosis.',
  ];

  return {
    subject,
    body: lines.filter((line): line is string => line !== null).join('\n'),
  };
}

export function buildWeeklyReport(
  allSessions: SessionRecord[],
  profile: UserProfile
): DoctorReportPayload {
  const digest = computeWeeklyDigest(allSessions);
  const todayLabel = new Date().toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const subject = `Weekly Speech Screening Summary — ${profile.name} (${todayLabel})`;

  const greeting = profile.doctorName.trim()
    ? `Dear ${profile.doctorName.trim()},`
    : 'Dear Doctor,';

  const acousticLines =
    digest.avgSpeechRate !== null
      ? [
          `  • Mean Speech Rate:          ${digest.avgSpeechRate} syllables / sec`,
          `  • Mean Vocal Pause Count:    ${digest.avgPauseCount} pauses / session`,
          `  • Mean Silence Ratio:        ${digest.avgSilenceRatio}%`,
          `  • Mean Fundamental Pitch:    ${digest.avgPitchHz} Hz`,
        ].join('\n')
      : '  • Scored acoustic biomarker averages are not yet available for this period.';

  const sessionBreakdown =
    digest.sessions.length > 0
      ? digest.sessions
          .map((s, idx) => {
            const vLabel =
              s.voicePrediction && s.voiceConfidence
                ? `${voiceResultLabel(s.voicePrediction)} (${voiceResultPercent(s.voicePrediction, s.voiceConfidence)}% confidence)`
                : 'Audio unscored';
            const fLine = s.voiceFeatures
              ? ` | Speech ${s.voiceFeatures.speech_rate}/s, ${s.voiceFeatures.pause_count} pauses, Pitch ${s.voiceFeatures.pitch_mean} Hz`
              : '';
            return `  ${idx + 1}. ${sessionDateLabel(s)} at ${s.timeStr} (${s.id})\n     Adherence: ${s.score}% · Duration: ${formatDuration(s.durationSeconds)} · Voice Model: ${vLabel}${fLine}`;
          })
          .join('\n\n')
      : '  • No completed screenings recorded during this period.';

  const lines: (string | null)[] = [
    greeting,
    '',
    `I am sending my ${digest.windowLabel.toLowerCase()} Dementia Dove speech screening summary (${todayLabel}) so you can track my progress and vocal biomarkers between appointments.`,
    '',
    ...buildPatientProfileBlock(profile),
    '',
    `WEEKLY OVERVIEW (${digest.windowLabel.toUpperCase()})`,
    `Screenings Completed: ${digest.count} of ${profile.weeklyGoal} weekly goal`,
    `Mean Task Adherence:  ${digest.avgScore}%`,
    `Mean Exam Duration:   ${formatDuration(digest.avgDurationSeconds)}`,
    `Voice Model Summary:  ${digest.scoredVoiceCount} scored (${digest.healthyCount} Healthy, ${digest.atRiskCount} At risk of dementia)`,
    '',
    'AVERAGED ACOUSTIC BIOMARKERS',
    acousticLines,
    '',
    'CHRONOLOGICAL SESSION LOG',
    sessionBreakdown,
    '',
    ...buildSignOff(profile),
    '',
    'Clinical Disclaimer: This longitudinal summary is generated by the Dementia Dove home screening companion app and on-device acoustic SVM model. It is intended to support clinical monitoring and does not constitute a standalone medical diagnosis.',
  ];

  return {
    subject,
    body: lines.filter((line): line is string => line !== null).join('\n'),
  };
}

export async function sendReportToDoctor(
  payload: DoctorReportPayload,
  profile: UserProfile
): Promise<void> {
  const recipient = profile.doctorEmail.trim();
  const mailtoUrl = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(
    payload.subject
  )}&body=${encodeURIComponent(payload.body)}`;

  try {
    const canOpen = await Linking.canOpenURL(mailtoUrl);
    if (canOpen) {
      await Linking.openURL(mailtoUrl);
      return;
    }
  } catch {
    /* fallback to native share sheet below */
  }

  try {
    await Share.share(
      {
        title: payload.subject,
        message: `${payload.subject}\n\n${payload.body}`,
      },
      {
        subject: payload.subject,
      }
    );
  } catch {
    Alert.alert('Could not open email', 'Please check that an email app is configured on this phone.');
  }
}
