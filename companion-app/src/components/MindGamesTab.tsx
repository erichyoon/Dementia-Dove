import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { FolderCard } from './FolderCard';
import { colors, shadow } from '../theme';

type GameKey = 'hub' | 'memory' | 'sequence' | 'scramble';

const MEMORY_FACES = ['SUN', 'HOUSE', 'TREE', 'BREAD'];
const SEQ_COLORS = [colors.accent, colors.ink, colors.paperDeep, colors.white];
const SEQ_LABELS = ['Purple', 'Ink', 'Cream', 'Paper'];
const WORDS = ['ELEPHANT', 'GIRAFFE', 'PANDA', 'SPARROW', 'DOLPHIN'];

function shuffle<T>(list: T[]): T[] {
  const next = [...list];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function scrambleWord(word: string) {
  let mixed = word;
  for (let i = 0; i < 8 && mixed === word; i++) {
    mixed = shuffle(word.split('')).join('');
  }
  return mixed;
}

export const MindGamesTab: React.FC = () => {
  const [game, setGame] = useState<GameKey>('hub');

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mind games.{'\n'}Stay sharp.</Text>
      {game === 'hub' && <GameHub onPick={setGame} />}
      {game === 'memory' && <MemoryGame onBack={() => setGame('hub')} />}
      {game === 'sequence' && <SequenceGame onBack={() => setGame('hub')} />}
      {game === 'scramble' && <ScrambleGame onBack={() => setGame('hub')} />}
    </View>
  );
};

const GameHub: React.FC<{ onPick: (key: GameKey) => void }> = ({ onPick }) => (
  <ScrollView contentContainerStyle={styles.hub} showsVerticalScrollIndicator={false}>
    <HubCard
      kicker="01"
      title="Memory match"
      body="Flip tiles. Find the sun, house, tree, and bread pairs from the exam picture and sentence."
      onPress={() => onPick('memory')}
    />
    <HubCard
      kicker="02"
      title="Sequence"
      body="Watch the four tiles light up, then tap them back in order. Span grows each round."
      onPress={() => onPick('sequence')}
    />
    <HubCard
      kicker="03"
      title="Animal scramble"
      body="Unscramble animal names. Same category as the 60-second fluency task."
      onPress={() => onPick('scramble')}
    />
  </ScrollView>
);

const HubCard: React.FC<{ kicker: string; title: string; body: string; onPress: () => void }> = ({
  kicker,
  title,
  body,
  onPress,
}) => (
  <TouchableOpacity activeOpacity={0.85} onPress={onPress} accessibilityRole="button">
    <FolderCard>
      <View style={styles.hubInner}>
        <Text style={styles.kicker}>{kicker}</Text>
        <Text style={styles.hubTitle}>{title}</Text>
        <Text style={styles.hubBody}>{body}</Text>
        <Text style={styles.playLink}>Play →</Text>
      </View>
    </FolderCard>
  </TouchableOpacity>
);

function MemoryGame({ onBack }: { onBack: () => void }) {
  const [deck, setDeck] = useState(() =>
    shuffle([...MEMORY_FACES, ...MEMORY_FACES].map((face, i) => ({ id: i, face, flipped: false, matched: false })))
  );
  const [open, setOpen] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const matchedCount = deck.filter((c) => c.matched).length / 2;
  const won = matchedCount === MEMORY_FACES.length;

  const tap = (index: number) => {
    if (won || deck[index].flipped || deck[index].matched || open.length === 2) return;
    const next = deck.map((card, i) => (i === index ? { ...card, flipped: true } : card));
    const nextOpen = [...open, index];
    setDeck(next);
    setOpen(nextOpen);
    if (nextOpen.length === 2) {
      setMoves((m) => m + 1);
      const [a, b] = nextOpen;
      if (next[a].face === next[b].face) {
        setTimeout(() => {
          setDeck((d) => d.map((card, i) => (i === a || i === b ? { ...card, matched: true } : card)));
          setOpen([]);
        }, 280);
      } else {
        setTimeout(() => {
          setDeck((d) =>
            d.map((card, i) => (i === a || i === b ? { ...card, flipped: false } : card))
          );
          setOpen([]);
        }, 700);
      }
    }
  };

  return (
    <View style={styles.gameWrap}>
      <BackRow onBack={onBack} stat={`${moves} moves · ${matchedCount}/4`} />
      <View style={styles.grid}>
        {deck.map((card, i) => (
          <TouchableOpacity
            key={card.id}
            style={[styles.tile, (card.flipped || card.matched) && styles.tileOpen]}
            onPress={() => tap(i)}
            accessibilityRole="button"
          >
            <Text style={styles.tileText}>{card.flipped || card.matched ? card.face : '?'}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {won && <Text style={styles.win}>Matched. Nice recall.</Text>}
    </View>
  );
}

function SequenceGame({ onBack }: { onBack: () => void }) {
  const [pattern, setPattern] = useState<number[]>(() => [Math.floor(Math.random() * 4)]);
  const [lit, setLit] = useState<number | null>(null);
  const [step, setStep] = useState(0);
  const [lock, setLock] = useState(true);
  const [score, setScore] = useState(0);
  const [miss, setMiss] = useState(false);

  const playPattern = (seq: number[]) => {
    setLock(true);
    setLit(null);
    seq.forEach((idx, i) => {
      setTimeout(() => setLit(idx), 420 * i + 200);
      setTimeout(() => setLit(null), 420 * i + 500);
    });
    setTimeout(() => {
      setLock(false);
      setStep(0);
    }, 420 * seq.length + 280);
  };

  useEffect(() => {
    playPattern(pattern);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tap = (idx: number) => {
    if (lock || miss) return;
    if (pattern[step] !== idx) {
      setMiss(true);
      return;
    }
    const nextStep = step + 1;
    if (nextStep >= pattern.length) {
      const grown = [...pattern, Math.floor(Math.random() * 4)];
      setScore(pattern.length);
      setPattern(grown);
      playPattern(grown);
    } else {
      setStep(nextStep);
    }
  };

  return (
    <View style={styles.gameWrap}>
      <BackRow onBack={onBack} stat={miss ? 'Missed' : `Span ${pattern.length} · best ${score}`} />
      <View style={styles.seqGrid}>
        {SEQ_COLORS.map((bg, i) => (
          <TouchableOpacity
            key={SEQ_LABELS[i]}
            style={[styles.seqTile, { backgroundColor: bg }, lit === i && styles.seqLit]}
            onPress={() => tap(i)}
            accessibilityRole="button"
          >
            <Text style={[styles.seqLabel, i === 1 && { color: colors.white }]}>{SEQ_LABELS[i]}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {miss && (
        <TouchableOpacity
          style={styles.retry}
          onPress={() => {
            const fresh = [Math.floor(Math.random() * 4)];
            setMiss(false);
            setScore(0);
            setPattern(fresh);
            playPattern(fresh);
          }}
          accessibilityRole="button"
        >
          <Text style={styles.retryText}>Try again</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function ScrambleGame({ onBack }: { onBack: () => void }) {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [pool, setPool] = useState<string[]>(() => scrambleWord(WORDS[0]).split(''));
  const [score, setScore] = useState(0);
  const word = WORDS[index];
  const deal = useMemo(() => scrambleWord(word).split(''), [word]);
  const guess = picked.join('');
  const correct = guess === word;
  const done = index >= WORDS.length - 1 && correct;

  const resetRound = (nextIndex: number) => {
    const nextWord = WORDS[nextIndex];
    setIndex(nextIndex);
    setPicked([]);
    setPool(scrambleWord(nextWord).split(''));
  };

  return (
    <View style={styles.gameWrap}>
      <BackRow onBack={onBack} stat={`${correct ? index + 1 : score}/${WORDS.length} solved`} />
      <Text style={styles.prompt}>Unscramble the animal</Text>
      <View style={styles.answerRow}>
        {(guess || '—').split('').map((ch, i) => (
          <View key={`${ch}${i}`} style={styles.answerCell}>
            <Text style={styles.answerText}>{ch}</Text>
          </View>
        ))}
      </View>
      <View style={styles.letterRow}>
        {pool.map((letter, i) => (
          <TouchableOpacity
            key={`${letter}-${i}-${pool.join('')}`}
            style={styles.letter}
            onPress={() => {
              if (correct) return;
              setPicked((p) => [...p, letter]);
              setPool((current) => current.filter((_, idx) => idx !== i));
            }}
            accessibilityRole="button"
          >
            <Text style={styles.letterText}>{letter}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.rowBtns}>
        <TouchableOpacity
          style={styles.ghostBtn}
          onPress={() => {
            setPicked([]);
            setPool(deal);
          }}
          accessibilityRole="button"
        >
          <Text style={styles.ghostText}>Clear</Text>
        </TouchableOpacity>
        {correct && !done && (
          <TouchableOpacity
            style={styles.retry}
            onPress={() => {
              setScore((s) => s + 1);
              resetRound(index + 1);
            }}
            accessibilityRole="button"
          >
            <Text style={styles.retryText}>Next animal</Text>
          </TouchableOpacity>
        )}
        {correct && done && (
          <Text style={styles.win}>Fluency round complete.</Text>
        )}
      </View>
      {correct && !done && <Text style={styles.win}>Correct.</Text>}
      {guess.length === word.length && !correct && (
        <Text style={styles.miss}>Not that animal. Clear and try again.</Text>
      )}
    </View>
  );
}

const BackRow: React.FC<{ onBack: () => void; stat: string }> = ({ onBack, stat }) => (
  <View style={styles.backRow}>
    <TouchableOpacity onPress={onBack} style={styles.backBtn} accessibilityRole="button">
      <Text style={styles.backText}>← Games</Text>
    </TouchableOpacity>
    <Text style={styles.stat}>{stat}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
    paddingTop: 18,
    paddingHorizontal: 18,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.ink,
    letterSpacing: -0.7,
    lineHeight: 36,
    marginBottom: 12,
  },
  hub: {
    paddingBottom: 24,
  },
  hubInner: {
    padding: 18,
  },
  kicker: {
    color: colors.accent,
    fontWeight: '900',
    fontSize: 12,
    marginBottom: 4,
  },
  hubTitle: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '900',
  },
  hubBody: {
    color: colors.muted,
    marginTop: 8,
    lineHeight: 20,
    fontWeight: '600',
  },
  playLink: {
    marginTop: 12,
    color: colors.ink,
    fontWeight: '800',
  },
  gameWrap: {
    flex: 1,
  },
  backRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  backBtn: {
    borderWidth: 3,
    borderColor: colors.ink,
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 10,
    ...shadow.hard,
  },
  backText: {
    fontWeight: '800',
    color: colors.ink,
  },
  stat: {
    color: colors.muted,
    fontWeight: '800',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tile: {
    width: '47%',
    height: 72,
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 16,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.hard,
  },
  tileOpen: {
    backgroundColor: colors.accentSoft,
  },
  tileText: {
    fontWeight: '900',
    color: colors.ink,
    letterSpacing: 0.6,
  },
  win: {
    marginTop: 16,
    fontWeight: '800',
    color: colors.ink,
  },
  miss: {
    marginTop: 12,
    color: colors.muted,
    fontWeight: '700',
  },
  seqGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  seqTile: {
    width: '47%',
    height: 88,
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.hard,
  },
  seqLit: {
    transform: [{ scale: 0.96 }],
    borderWidth: 5,
  },
  seqLabel: {
    fontWeight: '900',
    color: colors.ink,
  },
  retry: {
    marginTop: 16,
    alignSelf: 'flex-start',
    backgroundColor: colors.accent,
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    ...shadow.hard,
  },
  retryText: {
    color: colors.white,
    fontWeight: '800',
  },
  prompt: {
    fontWeight: '800',
    color: colors.muted,
    marginBottom: 12,
  },
  answerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 16,
  },
  answerCell: {
    minWidth: 28,
    height: 36,
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  answerText: {
    fontWeight: '900',
    color: colors.ink,
  },
  letterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  letter: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: colors.ink,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letterText: {
    fontWeight: '900',
    color: colors.ink,
  },
  rowBtns: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  ghostBtn: {
    borderWidth: 3,
    borderColor: colors.ink,
    backgroundColor: colors.white,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  ghostText: {
    fontWeight: '800',
    color: colors.ink,
  },
});
