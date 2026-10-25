type RawEmoji = {
  name: string;
  unified: string;
  short_name: string;
  short_names?: string[];
  category: string;
  sheet_x: number;
  sheet_y: number;
  sort_order: number;
  has_img_apple?: boolean;
  obsoleted_by?: string;
};

export const APPLE_CATEGORIES = [
  'Smileys & Emotion',
  'People & Body',
  'Animals & Nature',
  'Food & Drink',
  'Travel & Places',
  'Activities',
  'Objects',
  'Symbols',
  'Flags',
] as const;

export type AppleCategory = (typeof APPLE_CATEGORIES)[number];

export const APPLE_CATEGORY_LABELS: Record<AppleCategory, string> = {
  'Smileys & Emotion': 'Smileys',
  'People & Body': 'People',
  'Animals & Nature': 'Nature',
  'Food & Drink': 'Food',
  'Travel & Places': 'Places',
  Activities: 'Activity',
  Objects: 'Objects',
  Symbols: 'Symbols',
  Flags: 'Flags',
};

export type AppleEmoji = {
  char: string;
  name: string;
  shortName: string;
  names: string[];
  category: AppleCategory;
  sheetX: number;
  sheetY: number;
  sortOrder: number;
};

const GLYPH = 32;
const BORDER = 1;
export const APPLE_SHEET_CELL = GLYPH + BORDER * 2;
export const APPLE_SHEET_COLUMNS = 62;
export const APPLE_SHEET_PIXELS = APPLE_SHEET_COLUMNS * APPLE_SHEET_CELL;

export const APPLE_SHEET = require('emoji-datasource-apple/img/apple/sheets-clean/32.png');

function unifiedToChar(unified: string): string {
  return String.fromCodePoint(...unified.split('-').map((part) => parseInt(part, 16)));
}

const raw = require('emoji-datasource-apple/emoji.json') as RawEmoji[];

export const APPLE_EMOJIS: AppleEmoji[] = raw
  .filter(
    (emoji): emoji is RawEmoji & { category: AppleCategory } =>
      Boolean(emoji.has_img_apple) &&
      !emoji.obsoleted_by &&
      APPLE_CATEGORIES.includes(emoji.category as AppleCategory)
  )
  .map((emoji) => ({
    char: unifiedToChar(emoji.unified),
    name: emoji.name,
    shortName: emoji.short_name,
    names: emoji.short_names || [emoji.short_name],
    category: emoji.category,
    sheetX: emoji.sheet_x,
    sheetY: emoji.sheet_y,
    sortOrder: emoji.sort_order,
  }))
  .sort((a, b) => a.sortOrder - b.sortOrder);

const byChar = new Map(APPLE_EMOJIS.map((emoji) => [emoji.char, emoji]));

export const DEFAULT_APPLE_EMOJI =
  APPLE_EMOJIS.find((emoji) => emoji.shortName === 'busts_in_silhouette') || APPLE_EMOJIS[0];

export function appleEmojiByChar(char: string | undefined): AppleEmoji | undefined {
  if (!char) return undefined;
  return byChar.get(char);
}

export function appleEmojiIn(category: AppleCategory): AppleEmoji[] {
  return APPLE_EMOJIS.filter((emoji) => emoji.category === category);
}

export function searchAppleEmoji(query: string): AppleEmoji[] {
  const needle = query.trim().toLowerCase().replace(/\s+/g, '_');
  if (!needle) return [];
  return APPLE_EMOJIS.filter((emoji) =>
    emoji.names.some((name) => name.includes(needle)) || emoji.name.toLowerCase().includes(needle)
  ).slice(0, 80);
}

export function sheetOrigin(emoji: AppleEmoji): { x: number; y: number } {
  return {
    x: emoji.sheetX * APPLE_SHEET_CELL + BORDER,
    y: emoji.sheetY * APPLE_SHEET_CELL + BORDER,
  };
}
