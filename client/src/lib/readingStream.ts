export type ReadingStreamInput = {
  question: string;
  originalKey: string;
  originalName: string;
  originalBits: string;
  changedKey: string | null;
  changedName: string | null;
  changedBits: string | null;
  movingLines: number[];
  guaCi: string;
  xiangYue: string;
  yaoCi: Array<{ position: number; text: string }>;
  linesJson: string;
};

export type ReadingStreamResult = {
  integratedReading: string;
  hexagramReading: string;
  readingId: number | null;
};

type ReadingStreamOptions = {
  signal?: AbortSignal;
  onDelta: (section: 'integrated' | 'hexagram', text: string) => void;
};

function getEventPayload(block: string) {
  let event = 'message';
  const data: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith(':')) continue;
    if (line.startsWith('event:')) event = line.slice(6).trim();
    if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  }
  if (data.length === 0) return null;
  return { event, data: data.join('\n') };
}

export async function streamReading(
  input: ReadingStreamInput,
  { signal, onDelta }: ReadingStreamOptions,
): Promise<ReadingStreamResult> {
  const response = await fetch('/api/reading/stream', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? '解读生成失败，请稍后重试。');
  }
  if (!response.body) throw new Error('当前浏览器不支持流式解读。');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completed: ReadingStreamResult | null = null;

  const processBlock = (block: string) => {
    const payload = getEventPayload(block);
    if (!payload) return;
    const parsed = JSON.parse(payload.data) as Record<string, unknown>;
    if (payload.event === 'delta') {
      const section = parsed.section;
      const text = parsed.text;
      if ((section === 'integrated' || section === 'hexagram') && typeof text === 'string') {
        onDelta(section, text);
      }
      return;
    }
    if (payload.event === 'complete') {
      if (typeof parsed.integratedReading !== 'string' || typeof parsed.hexagramReading !== 'string') {
        throw new Error('解读返回格式无效，请稍后重试。');
      }
      completed = {
        integratedReading: parsed.integratedReading,
        hexagramReading: parsed.hexagramReading,
        readingId: typeof parsed.readingId === 'number' ? parsed.readingId : null,
      };
      return;
    }
    if (payload.event === 'error') {
      throw new Error(typeof parsed.message === 'string' ? parsed.message : '解读生成失败，请稍后重试。');
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, '\n');
    let boundary = buffer.indexOf('\n\n');
    while (boundary >= 0) {
      processBlock(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf('\n\n');
    }
    if (done) break;
  }

  if (buffer.trim()) processBlock(buffer);
  if (!completed) throw new Error('解读连接提前结束，请稍后重试。');
  return completed;
}
