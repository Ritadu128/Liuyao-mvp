export type ReadingSection = 'integrated' | 'hexagram';

export type StreamedReading = {
  integrated_reading: string;
  hexagram_reading: string;
};

export class DeepSeekStreamError extends Error {
  constructor(
    public readonly kind: 'timeout' | 'upstream' | 'invalid_response',
    cause?: unknown,
  ) {
    super(kind);
    this.cause = cause;
  }
}

/**
 * 从尚未完成的 JSON 文本中读取某个字符串字段。
 * DeepSeek 会把 JSON 分成许多 SSE delta；此解析器允许字段还没闭合时，
 * 先把已完整收到的字符交给浏览器展示。
 */
export function extractPartialJsonString(source: string, field: string): string {
  const key = JSON.stringify(field);
  const keyIndex = source.indexOf(key);
  if (keyIndex < 0) return '';

  let cursor = keyIndex + key.length;
  while (cursor < source.length && /\s/.test(source[cursor]!)) cursor += 1;
  if (source[cursor] !== ':') return '';
  cursor += 1;
  while (cursor < source.length && /\s/.test(source[cursor]!)) cursor += 1;
  if (source[cursor] !== '"') return '';
  cursor += 1;

  let value = '';
  while (cursor < source.length) {
    const character = source[cursor]!;
    if (character === '"') break;
    if (character !== '\\') {
      value += character;
      cursor += 1;
      continue;
    }

    if (cursor + 1 >= source.length) break;
    const escaped = source[cursor + 1]!;
    const simpleEscapes: Record<string, string> = {
      '"': '"',
      '\\': '\\',
      '/': '/',
      b: '\b',
      f: '\f',
      n: '\n',
      r: '\r',
      t: '\t',
    };
    if (escaped in simpleEscapes) {
      value += simpleEscapes[escaped];
      cursor += 2;
      continue;
    }
    if (escaped === 'u') {
      const unicode = source.slice(cursor + 2, cursor + 6);
      if (!/^[0-9a-fA-F]{4}$/.test(unicode)) break;
      value += String.fromCharCode(Number.parseInt(unicode, 16));
      cursor += 6;
      continue;
    }

    // 非法或尚未完整的转义不应被展示，等待后续 delta 补齐。
    break;
  }

  return value;
}

type StreamDeepSeekOptions = {
  apiKey: string;
  model: string;
  messages: { role: 'system' | 'user'; content: string }[];
  timeoutMs: number;
  signal?: AbortSignal;
  onDelta: (section: ReadingSection, text: string) => void;
};

export async function streamDeepSeekReading({
  apiKey,
  model,
  messages,
  timeoutMs,
  signal,
  onDelta,
}: StreamDeepSeekOptions): Promise<StreamedReading> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener('abort', abortFromCaller, { once: true });

  let accumulated = '';
  let emittedIntegrated = '';
  let emittedHexagram = '';

  const emitNewText = () => {
    const integrated = extractPartialJsonString(accumulated, 'integrated_reading');
    if (integrated.startsWith(emittedIntegrated) && integrated.length > emittedIntegrated.length) {
      onDelta('integrated', integrated.slice(emittedIntegrated.length));
      emittedIntegrated = integrated;
    }

    const hexagram = extractPartialJsonString(accumulated, 'hexagram_reading');
    if (hexagram.startsWith(emittedHexagram) && hexagram.length > emittedHexagram.length) {
      onDelta('hexagram', hexagram.slice(emittedHexagram.length));
      emittedHexagram = hexagram;
    }
  };

  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        max_tokens: 2_048,
        response_format: { type: 'json_object' },
        stream: true,
      }),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      throw new DeepSeekStreamError('upstream');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let lineBuffer = '';
    let finished = false;

    const processDataLine = (line: string) => {
      if (!line.startsWith('data:')) return false;
      const data = line.slice(5).trim();
      if (!data) return false;
      if (data === '[DONE]') return true;

      let event: unknown;
      try {
        event = JSON.parse(data);
      } catch {
        throw new DeepSeekStreamError('invalid_response');
      }
      const content = (event as {
        choices?: Array<{ delta?: { content?: string | null } }>;
      }).choices?.[0]?.delta?.content;
      if (typeof content === 'string' && content) {
        accumulated += content;
        emitNewText();
      }
      return false;
    };

    while (!finished) {
      const { done, value } = await reader.read();
      lineBuffer += decoder.decode(value, { stream: !done });
      const lines = lineBuffer.split(/\r?\n/);
      lineBuffer = lines.pop() ?? '';

      for (const line of lines) {
        if (processDataLine(line)) {
          finished = true;
          break;
        }
      }

      if (done) break;
    }
    if (!finished && lineBuffer.trim()) processDataLine(lineBuffer.trim());

    let parsed: unknown;
    try {
      parsed = JSON.parse(accumulated);
    } catch {
      throw new DeepSeekStreamError('invalid_response');
    }
    const reading = parsed as Partial<StreamedReading>;
    if (typeof reading.integrated_reading !== 'string' || typeof reading.hexagram_reading !== 'string') {
      throw new DeepSeekStreamError('invalid_response');
    }
    return {
      integrated_reading: reading.integrated_reading,
      hexagram_reading: reading.hexagram_reading,
    };
  } catch (error) {
    if (error instanceof DeepSeekStreamError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new DeepSeekStreamError(timedOut ? 'timeout' : 'upstream', error);
    }
    throw new DeepSeekStreamError('upstream', error);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}
