/**
 * useLocalHistory
 * 为未登录用户提供基于 localStorage 的历史记录存储。
 * 已登录用户的记录由后端数据库管理，此 hook 仅作补充。
 */

const STORAGE_KEY = 'liuyao_local_history';
const MAX_LOCAL_RECORDS = 30;

export interface LocalReading {
  id: string;           // 本地唯一 ID（时间戳字符串）
  question: string;
  linesJson: string;
  originalKey: string;
  originalName: string;
  originalBits: string;
  changedKey: string | null;
  changedName: string | null;
  changedBits: string | null;
  movingLinesJson: string;
  integratedReading: string | null;
  hexagramReading: string | null;
  createdAt: string;    // ISO 字符串
  isLocal: true;        // 标记为本地记录
}

function loadAll(): LocalReading[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as LocalReading[];
  } catch {
    return [];
  }
}

function saveAll(records: LocalReading[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // localStorage 写入失败（隐私模式等）时静默忽略
  }
}

/** 添加一条本地历史记录，超出上限时删除最旧的 */
export function addLocalReading(record: Omit<LocalReading, 'id' | 'createdAt' | 'isLocal'>): LocalReading {
  const all = loadAll();
  const newRecord: LocalReading = {
    ...record,
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
    isLocal: true,
  };
  const updated = [newRecord, ...all].slice(0, MAX_LOCAL_RECORDS);
  saveAll(updated);
  return newRecord;
}

/** 读取所有本地历史记录（按时间倒序） */
export function getLocalReadings(): LocalReading[] {
  return loadAll();
}

/** 根据本地 ID 获取单条记录 */
export function getLocalReadingById(id: string): LocalReading | null {
  return loadAll().find(r => r.id === id) ?? null;
}
