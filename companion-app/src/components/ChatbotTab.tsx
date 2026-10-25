import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  type ScrollViewInstance,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { colors, shadow } from '../theme';
import { ChatMessage, CHAT_STARTERS, replyToPatient } from '../services/chatbot';

interface Props {
  isPaired: boolean;
  name?: string;
}

let msgSeq = 1;

function greeting(name: string) {
  return `Hi ${name}. I am your RECALL companion. Ask how to start, what each task is, or where to find a caregiver.`;
}

export const ChatbotTab: React.FC<Props> = ({ isPaired, name = 'Omar' }) => {
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'm0',
      role: 'bot',
      text: greeting(name),
    },
  ]);

  useEffect(() => {
    setMessages((prev) =>
      prev.map((message) => (message.id === 'm0' ? { ...message, text: greeting(name) } : message))
    );
  }, [name]);
  const scrollRef = useRef<ScrollViewInstance>(null);

  const pushExchange = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const user: ChatMessage = { id: `u${msgSeq++}`, role: 'user', text: trimmed };
    const bot: ChatMessage = {
      id: `b${msgSeq++}`,
      role: 'bot',
      text: replyToPatient(trimmed, isPaired, name),
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
      <Text style={styles.title}>Ask anything.</Text>
      <Text style={styles.subtitle}>
        {isPaired ? 'Device paired · exam can run on hardware' : 'Unpaired · scan the code in Screening first'}
      </Text>

      <View style={styles.threadCard}>
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

      <View style={styles.starters}>
        {CHAT_STARTERS.map((item) => (
          <TouchableOpacity
            key={item.label}
            activeOpacity={0.8}
            onPress={() => pushExchange(item.text)}
            style={styles.chip}
            accessibilityRole="button"
            accessibilityLabel={item.text}
          >
            <Text style={styles.chipText}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

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
    minHeight: 0,
    width: '100%',
    backgroundColor: colors.paper,
    paddingTop: 8,
    paddingHorizontal: 18,
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    color: colors.ink,
    letterSpacing: -0.6,
    lineHeight: 30,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  threadCard: {
    flex: 1,
    minHeight: 72,
    marginTop: 6,
    marginBottom: 6,
    backgroundColor: colors.white,
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 22,
    overflow: 'hidden',
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
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 4,
    paddingBottom: 0,
  },
  chip: {
    borderWidth: 3,
    borderColor: colors.ink,
    backgroundColor: colors.white,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  chipText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '800',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: 8,
    paddingBottom: 0,
  },
  input: {
    flex: 1,
    minWidth: 0,
    width: 0,
    height: 44,
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 14,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    color: colors.ink,
    fontWeight: '600',
  },
  sendBtn: {
    flexShrink: 0,
    height: 44,
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
