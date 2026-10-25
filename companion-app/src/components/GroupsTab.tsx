import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { AppleEmojiGlyph } from './AppleEmoji';
import { PhotoCrop } from './PhotoCrop';
import { FolderCard } from './FolderCard';
import { colors, shadow } from '../theme';
import {
  CareCircleMember,
  CareRole,
  addCareCircleMember,
  getCareCircle,
  removeCareCircleMember,
} from '../services/careCircleStorage';
import {
  SupportGroup,
  createSupportGroup,
  getLocalMember,
  groupCreatorId,
  loadSupportGroups,
  removeSupportGroup,
  setGroupMembership,
} from '../services/supportGroups';
import {
  APPLE_CATEGORIES,
  APPLE_CATEGORY_LABELS,
  AppleCategory,
  appleEmojiByChar,
  appleEmojiIn,
  searchAppleEmoji,
} from '../services/appleEmoji';

type CropSource = { uri: string; width: number; height: number };

export const GroupsTab: React.FC = () => {
  const [members, setMembers] = useState<CareCircleMember[]>([]);
  const [name, setName] = useState('');
  const [role, setRole] = useState<CareRole>('Family');
  const [groups, setGroups] = useState<SupportGroup[]>([]);
  const [shared, setShared] = useState(true);
  const [memberId, setMemberId] = useState('');
  const [groupName, setGroupName] = useState('');
  const [groupNote, setGroupNote] = useState('');
  const [groupMark, setGroupMark] = useState('');
  const [groupImage, setGroupImage] = useState('');
  const [markError, setMarkError] = useState<string | null>(null);
  const [cropSource, setCropSource] = useState<CropSource | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiCategory, setEmojiCategory] = useState<AppleCategory>('Smileys & Emotion');
  const [emojiQuery, setEmojiQuery] = useState('');

  const refreshGroups = async () => {
    const [me, result] = await Promise.all([getLocalMember(), loadSupportGroups()]);
    setMemberId(me.id);
    setGroups(result.groups);
    setShared(result.shared);
  };

  useEffect(() => {
    getCareCircle().then(setMembers);
    refreshGroups();
  }, []);

  const addMember = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setMembers(await addCareCircleMember({ name: trimmed, role }));
    setName('');
  };

  const removeMember = async (id: string) => {
    setMembers(await removeCareCircleMember(id));
  };

  const createGroup = async () => {
    const trimmed = groupName.trim();
    if (!trimmed) return;
    const next = await createSupportGroup(trimmed, groupNote.trim(), groupMark, groupImage);
    setGroups(next);
    setShared(next.every((group) => !group.pending));
    setGroupName('');
    setGroupNote('');
    setGroupMark('');
    setEmojiQuery('');
    setEmojiOpen(false);
    setGroupImage('');
    setMarkError(null);
  };

  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setMarkError('Photo access was not granted. Pick an emoji instead.');
      return;
    }
    if (Platform.OS !== 'web') {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.35,
        base64: true,
      });
      const pickedAsset = picked.canceled ? null : picked.assets?.[0];
      if (!pickedAsset?.base64) return;
      setGroupImage(`data:${pickedAsset.mimeType || 'image/jpeg'};base64,${pickedAsset.base64}`);
      setMarkError(null);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    let width = asset.width;
    let height = asset.height;
    if (!width || !height) {
      const measured = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        Image.getSize(asset.uri, (nextWidth, nextHeight) => resolve({ width: nextWidth, height: nextHeight }), reject);
      });
      width = measured.width;
      height = measured.height;
    }
    if (!width || !height) {
      setMarkError('Could not read that photo. Pick an emoji instead.');
      return;
    }
    setMarkError(null);
    setCropSource({ uri: asset.uri, width, height });
  };

  const chosenEmoji = appleEmojiByChar(groupMark);
  const emojiChoices = useMemo(() => {
    const query = emojiQuery.trim();
    return query ? searchAppleEmoji(query) : appleEmojiIn(emojiCategory);
  }, [emojiQuery, emojiCategory]);

  const toggleJoin = async (group: SupportGroup) => {
    const joined = group.members.some((person) => person.id === memberId);
    setGroups(await setGroupMembership(group, !joined));
  };

  const removeGroup = async (group: SupportGroup) => {
    setGroups(await removeSupportGroup(group));
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Your people.</Text>
        <Text style={styles.subtitle}>Care circle on this phone. Groups exist only after someone makes one.</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.sectionTitle}>Care circle</Text>
        <FolderCard>
          <View style={styles.addCard}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Name"
              placeholderTextColor={colors.muted}
              style={styles.input}
              onSubmitEditing={addMember}
              returnKeyType="done"
            />
            <View style={styles.roleRow}>
              {(['Family', 'Caregiver'] as CareRole[]).map((option) => {
                const active = role === option;
                return (
                  <TouchableOpacity
                    key={option}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={[styles.roleChip, active && styles.roleChipOn]}
                    onPress={() => setRole(option)}
                  >
                    <Text style={[styles.roleText, active && styles.roleTextOn]}>{option}</Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Add to care circle"
                style={[styles.addBtn, !name.trim() && styles.addBtnOff]}
                onPress={addMember}
                disabled={!name.trim()}
              >
                <Text style={styles.addBtnText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </FolderCard>

        {members.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No one here yet</Text>
            <Text style={styles.emptyDesc}>Add a family member or caregiver to your care circle.</Text>
          </View>
        ) : (
          members.map((member) => (
            <FolderCard key={member.id}>
              <View style={styles.memberCard}>
                <View style={styles.memberAvatar}>
                  <Text style={styles.memberInitial}>{member.name.slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.memberName}>{member.name}</Text>
                  <Text style={styles.memberRole}>{member.role}</Text>
                </View>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${member.name}`}
                  onPress={() => removeMember(member.id)}
                  style={styles.removeBtn}
                >
                  <Ionicons name="close" size={16} color={colors.ink} />
                </TouchableOpacity>
              </View>
            </FolderCard>
          ))
        )}

        <Text style={[styles.sectionTitle, styles.sectionGap]}>Groups</Text>
        <Text style={styles.sectionHint}>
          {shared
            ? 'Create one, then someone else on the app can find it and join.'
            : 'Saved on this phone. Other people can join once this computer is connected.'}
        </Text>

        <FolderCard>
          <View style={styles.addCard}>
            <TextInput
              value={groupName}
              onChangeText={setGroupName}
              placeholder="Group name"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
            <TextInput
              value={groupNote}
              onChangeText={setGroupNote}
              placeholder="Description"
              placeholderTextColor={colors.muted}
              style={[styles.input, styles.noteInput]}
              multiline
              maxLength={500}
            />
            <View style={styles.markHead}>
              <Text style={styles.markHint}>Add an emoji or a photo if you want one.</Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Choose an emoji"
                style={[styles.photoBtn, chosenEmoji && !groupImage ? styles.photoBtnOn : null]}
                onPress={() => setEmojiOpen(true)}
              >
                {chosenEmoji && !groupImage ? (
                  <AppleEmojiGlyph emoji={chosenEmoji} size={28} />
                ) : (
                  <Ionicons name="happy-outline" size={18} color={colors.ink} />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Upload a photo"
                style={[styles.photoBtn, groupImage ? styles.photoBtnOn : null]}
                onPress={pickPhoto}
              >
                {groupImage ? (
                  <Image source={{ uri: groupImage }} style={styles.photoPreview} />
                ) : (
                  <Ionicons name="image-outline" size={18} color={colors.ink} />
                )}
              </TouchableOpacity>
            </View>
            {markError ? <Text style={styles.markError}>{markError}</Text> : null}
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Create group"
              style={[styles.createBtn, !groupName.trim() && styles.addBtnOff]}
              onPress={createGroup}
              disabled={!groupName.trim()}
            >
              <Text style={styles.addBtnText}>Create group</Text>
            </TouchableOpacity>
          </View>
        </FolderCard>

        {groups.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No groups yet</Text>
            <Text style={styles.emptyDesc}>Nothing to join until someone creates a group.</Text>
          </View>
        ) : (
          groups.map((group) => {
            const joined = group.members.some((person) => person.id === memberId);
            const createdHere = groupCreatorId(group) === memberId;
            const markEmoji = appleEmojiByChar(group.mark);
            return (
              <FolderCard key={group.id}>
                <View style={styles.groupCard}>
                  <View style={styles.groupTop}>
                    {group.image ? (
                      <View style={styles.groupMark}>
                        <Image source={{ uri: group.image }} style={styles.groupPhoto} />
                      </View>
                    ) : markEmoji ? (
                      <AppleEmojiGlyph emoji={markEmoji} size={36} />
                    ) : null}
                    <Text style={[styles.memberName, styles.groupTitle]}>{group.name}</Text>
                  </View>
                  {group.note ? <Text style={styles.groupNote}>{group.note}</Text> : null}
                  <Text style={styles.memberRole}>
                    {group.members.length} {group.members.length === 1 ? 'member' : 'members'}
                    {group.pending ? ' · on this phone' : ''}
                  </Text>
                  <Text style={styles.memberList}>
                    {group.members.map((person) => person.name).join(', ') || 'No members yet'}
                  </Text>
                  <View style={styles.groupActions}>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={joined ? `Leave ${group.name}` : `Join ${group.name}`}
                      style={[styles.joinBtn, joined && styles.joinBtnOn]}
                      onPress={() => toggleJoin(group)}
                    >
                      <Text style={[styles.joinText, joined && styles.joinTextOn]}>
                        {joined ? 'Leave' : 'Join'}
                      </Text>
                    </TouchableOpacity>
                    {createdHere ? (
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${group.name}`}
                        style={styles.removeGroupBtn}
                        onPress={() => removeGroup(group)}
                      >
                        <Text style={styles.joinTextOn}>Remove</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              </FolderCard>
            );
          })
        )}
      </ScrollView>
      <Modal
        visible={emojiOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setEmojiOpen(false)}
      >
        <View style={styles.emojiScrim}>
          <View style={styles.emojiSheet}>
            <Text style={styles.emojiTitle}>Emoji</Text>
            <TextInput
              value={emojiQuery}
              onChangeText={setEmojiQuery}
              placeholder="Search emoji"
              placeholderTextColor={colors.muted}
              style={styles.input}
              autoCorrect={false}
            />
            {emojiQuery.trim() ? null : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoryRow}
              >
                {APPLE_CATEGORIES.map((category) => {
                  const active = category === emojiCategory;
                  return (
                    <TouchableOpacity
                      key={category}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      style={[styles.categoryChip, active && styles.categoryChipOn]}
                      onPress={() => setEmojiCategory(category)}
                    >
                      <Text style={[styles.categoryText, active && styles.categoryTextOn]}>
                        {APPLE_CATEGORY_LABELS[category]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
            <ScrollView
              style={styles.emojiGrid}
              contentContainerStyle={styles.emojiWrap}
              keyboardShouldPersistTaps="handled"
            >
              {emojiChoices.map((emoji) => {
                const active = !groupImage && groupMark === emoji.char;
                return (
                  <TouchableOpacity
                    key={emoji.shortName}
                    accessibilityRole="button"
                    accessibilityLabel={`Use ${emoji.name.toLowerCase()}`}
                    accessibilityState={{ selected: active }}
                    style={styles.emojiCell}
                    onPress={() => {
                      setGroupMark(emoji.char);
                      setGroupImage('');
                      setMarkError(null);
                      setEmojiQuery('');
                      setEmojiOpen(false);
                    }}
                  >
                    {active ? <View style={styles.emojiSelected} /> : null}
                    <AppleEmojiGlyph emoji={emoji} />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Close emoji"
              style={styles.emojiClose}
              onPress={() => setEmojiOpen(false)}
            >
              <Text style={styles.emojiOpenText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {cropSource ? (
        <PhotoCrop
          uri={cropSource.uri}
          width={cropSource.width}
          height={cropSource.height}
          onCancel={() => setCropSource(null)}
          onUse={(dataUrl) => {
            setGroupImage(dataUrl);
            setCropSource(null);
            setMarkError(null);
          }}
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  header: {
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.ink,
    letterSpacing: -0.7,
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 8,
    fontSize: 14,
    fontWeight: '700',
    color: colors.muted,
    lineHeight: 20,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingBottom: 28,
  },
  sectionTitle: {
    marginTop: 8,
    marginBottom: 8,
    fontSize: 18,
    fontWeight: '900',
    color: colors.ink,
  },
  sectionGap: {
    marginTop: 18,
  },
  sectionHint: {
    marginTop: -4,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
    lineHeight: 18,
  },
  addCard: {
    padding: 14,
    gap: 10,
  },
  input: {
    height: 46,
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 14,
    backgroundColor: colors.paper,
    paddingHorizontal: 12,
    color: colors.ink,
    fontWeight: '700',
  },
  noteInput: {
    height: 96,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  markHint: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
  },
  markHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryRow: {
    gap: 8,
    paddingVertical: 2,
  },
  categoryChip: {
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: colors.white,
  },
  categoryChipOn: {
    backgroundColor: colors.accent,
  },
  categoryText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.ink,
  },
  categoryTextOn: {
    color: colors.white,
  },
  emojiOpenText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.ink,
  },
  emojiScrim: {
    flex: 1,
    backgroundColor: 'rgba(20, 20, 20, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emojiSheet: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.white,
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 18,
    padding: 14,
    gap: 10,
    ...shadow.hard,
  },
  emojiTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
  },
  emojiGrid: {
    maxHeight: 280,
  },
  emojiWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  emojiCell: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiSelected: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accentSoft,
  },
  emojiClose: {
    alignSelf: 'flex-end',
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: colors.white,
  },
  photoBtn: {
    width: 40,
    height: 40,
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 12,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoBtnOn: {
    backgroundColor: colors.accentSoft,
  },
  photoPreview: {
    width: 40,
    height: 40,
  },
  markError: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
    lineHeight: 18,
  },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  roleChip: {
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.white,
  },
  roleChipOn: {
    backgroundColor: colors.accent,
  },
  roleText: {
    fontWeight: '800',
    color: colors.ink,
  },
  roleTextOn: {
    color: colors.white,
  },
  addBtn: {
    marginLeft: 'auto',
    backgroundColor: colors.ink,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  addBtnOff: {
    opacity: 0.4,
  },
  addBtnText: {
    color: colors.white,
    fontWeight: '800',
  },
  createBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.ink,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  emptyCard: {
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 18,
    backgroundColor: colors.white,
    padding: 16,
    marginBottom: 12,
    ...shadow.hard,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.ink,
  },
  emptyDesc: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
    lineHeight: 18,
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: colors.ink,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberInitial: {
    fontWeight: '900',
    color: colors.ink,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.ink,
  },
  memberRole: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
  },
  removeBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupCard: {
    padding: 14,
  },
  groupTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  groupTitle: {
    flex: 1,
  },
  groupMark: {
    width: 52,
    height: 52,
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 16,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  groupEmoji: {
    fontSize: 26,
  },
  groupPhoto: {
    width: 52,
    height: 52,
  },
  groupNote: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
    lineHeight: 20,
  },
  memberList: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
  },
  groupActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  joinBtn: {
    alignSelf: 'flex-start',
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: colors.accent,
  },
  joinBtnOn: {
    backgroundColor: colors.white,
  },
  joinText: {
    color: colors.white,
    fontWeight: '800',
  },
  joinTextOn: {
    color: colors.ink,
  },
  removeGroupBtn: {
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: colors.white,
  },
});
