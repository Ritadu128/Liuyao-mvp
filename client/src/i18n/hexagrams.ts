import type { HexagramInfo } from '@/contexts/DivinationContext';
import type { Locale } from './I18nContext';

const ENGLISH_NAMES: Record<string, string> = {
  '01': 'The Creative', '02': 'The Receptive', '03': 'Difficulty at the Beginning', '04': 'Youthful Folly',
  '05': 'Waiting', '06': 'Conflict', '07': 'The Army', '08': 'Holding Together',
  '09': 'Small Taming', '10': 'Treading', '11': 'Peace', '12': 'Standstill',
  '13': 'Fellowship', '14': 'Great Possession', '15': 'Modesty', '16': 'Enthusiasm',
  '17': 'Following', '18': 'Work on What Has Been Spoiled', '19': 'Approach', '20': 'Contemplation',
  '21': 'Biting Through', '22': 'Grace', '23': 'Splitting Apart', '24': 'Return',
  '25': 'Innocence', '26': 'Great Taming', '27': 'Nourishment', '28': 'Great Preponderance',
  '29': 'The Abysmal Water', '30': 'The Clinging Fire', '31': 'Influence', '32': 'Duration',
  '33': 'Retreat', '34': 'Great Power', '35': 'Progress', '36': 'Darkening of the Light',
  '37': 'The Family', '38': 'Opposition', '39': 'Obstruction', '40': 'Deliverance',
  '41': 'Decrease', '42': 'Increase', '43': 'Breakthrough', '44': 'Coming to Meet',
  '45': 'Gathering Together', '46': 'Pushing Upward', '47': 'Oppression', '48': 'The Well',
  '49': 'Revolution', '50': 'The Cauldron', '51': 'The Arousing Thunder', '52': 'Keeping Still Mountain',
  '53': 'Development', '54': 'The Marrying Maiden', '55': 'Abundance', '56': 'The Wanderer',
  '57': 'The Gentle Wind', '58': 'The Joyous Lake', '59': 'Dispersion', '60': 'Limitation',
  '61': 'Inner Truth', '62': 'Small Preponderance', '63': 'After Completion', '64': 'Before Completion',
};

const ENGLISH_TRIGRAMS: Record<string, string> = {
  乾: 'Heaven', 兑: 'Lake', 离: 'Fire', 震: 'Thunder', 巽: 'Wind', 坎: 'Water', 艮: 'Mountain', 坤: 'Earth',
};

const TRADITIONAL_CHARACTERS: Record<string, string> = {
  众: '眾', 见: '見', 为: '為', 风: '風', 泽: '澤', 讼: '訟', 师: '師', 谦: '謙', 随: '隨', 蛊: '蠱',
  临: '臨', 观: '觀', 贲: '賁', 剥: '剝', 复: '復', 无: '無', 颐: '頤', 过: '過',
  离: '離', 壮: '壯', 晋: '晉', 损: '損', 渐: '漸', 归: '歸', 丰: '豐', 兑: '兌',
  涣: '渙', 节: '節', 济: '濟', 既: '既', 妹: '妹', 震: '震', 巽: '巽',
};

function traditionalName(value: string) {
  return Array.from(value, character => TRADITIONAL_CHARACTERS[character] ?? character).join('');
}

export function localizeHexagram(info: HexagramInfo | null, locale: Locale): HexagramInfo | null {
  if (!info || locale === 'zh-CN') return info;
  if (locale === 'zh-TW') return {
    ...info,
    name: traditionalName(info.name),
    upper: traditionalName(info.upper),
    lower: traditionalName(info.lower),
  };
  return {
    ...info,
    name: ENGLISH_NAMES[info.key] ?? `Hexagram ${Number(info.key)}`,
    upper: ENGLISH_TRIGRAMS[info.upper] ?? info.upper,
    lower: ENGLISH_TRIGRAMS[info.lower] ?? info.lower,
  };
}

export function localizedHexagramName(key: string, chineseName: string, locale: Locale) {
  if (locale === 'en-US') return ENGLISH_NAMES[key] ?? `Hexagram ${Number(key)}`;
  return locale === 'zh-TW' ? traditionalName(chineseName) : chineseName;
}
