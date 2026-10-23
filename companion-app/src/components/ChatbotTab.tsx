import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { FolderCard } from './FolderCard';
import { colors, shadow } from '../theme';
import { ChatMessage, CHAT_STARTERS, replyToPatient } from '../services/chatbot';

interface Props {
  isPaired: boolean;
}

let msgSeq = 1;

export const ChatbotTab: React.FC<Props> = ({ isPaired }) => {
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'm0',
      role: 'bot',
      text: 'Hi Omar. I am your RECALL companion. Ask how to start, what each task is, or where to find a clinic.',
    },
  ]);
  const scrollRef = useRef<ScrollView>(null);

  const pushExchange = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const user: ChatMessage = { id: `u${msgSeq++}`, role: 'user', text: trimmed };
    const bot: ChatMessage = {
      id: `b${msgSeq++}`,
      role: 'bot',
      text: replyToPatient(trimmed, isPaired),
    };
    setMessages((prev) => [...prev, user, bot]);
    setDraft('');
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>Ask anything.{'\n'}Stay on track.</Text>
      <Text style={styles.subtitle}>
        {isPaired ? 'Device paired · exam can run on hardware' : 'Unpaired · scan the code in Lab first'}
      </Text>

      <FolderCard style={{ flex: 1, width: '100%' }}>
        <View style={styles.threadWrap}>
          <ScrollView
            ref={scrollRef}
            style={styles.thread}
            contentContainerStyle={styles.threadContent}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          >
            {messages.map((msg) => (
              <View
                key={msg.id}
                style={[styles.bubble, msg.role === 'user' ? styles.bubbleUser : styles.bubbleBot]}
              >
                <Text style={[styles.bubbleText, msg.role === 'user' && styles.bubbleTextUser]}>
                  {msg.text}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </FolderCard>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.starters}
      >
        {CHAT_STARTERS.map((item) => (
          <TouchableOpacity
            key={item}
            activeOpacity={0.8}
            onPress={() => pushExchange(item)}
            style={styles.chip}
            accessibilityRole="button"
          >
            <Text style={styles.chipText}>{item}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.composer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Ask about the exam…"
          placeholderTextColor={colors.muted}
          style={styles.input}
          onSubmitEditing={() => pushExchange(draft)}
          returnKeyType="send"
        />
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => pushExchange(draft)}
          style={styles.sendBtn}
          accessibilityRole="button"
        >
          <Text style={styles.sendText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

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
    marginBottom: 6,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
  },
  threadWrap: {
    flex: 1,
    minHeight: 220,
  },
  thread: {
    flex: 1,
  },
  threadContent: {
    padding: 14,
    gap: 10,
  },
  bubble: {
    maxWidth: '88%',
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  bubbleBot: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accentSoft,
  },
  bubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: colors.accent,
  },
  bubbleText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  bubbleTextUser: {
    color: colors.white,
    fontWeight: '700',
  },
  starters: {
    gap: 8,
    paddingVertical: 10,
  },
  chip: {
    borderWidth: 3,
    borderColor: colors.ink,
    backgroundColor: colors.white,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    ...shadow.hard,
  },
  chipText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '800',
  },
  composer: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 8,
  },
  input: {
    flex: 1,
    height: 48,
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 14,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    color: colors.ink,
    fontWeight: '600',
  },
  sendBtn: {
    height: 48,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: colors.ink,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.hard,
  },
  sendText: {
    color: colors.white,
    fontWeight: '800',
  },
});
