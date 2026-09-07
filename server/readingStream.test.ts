import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DeepSeekStreamError,
  extractPartialJsonString,
  streamDeepSeekReading,
} from './readingStream';

afterEach(() => vi.unstubAllGlobals());

describe('DeepSeek 流式 JSON 字段解析', () => {
  it('字段尚未闭合时也能提取已到达的文字', () => {
    const partial = '{"integrated_reading":"## 卦象总论\\n当前宜稳';
    expect(extractPartialJsonString(partial, 'integrated_reading')).toBe('## 卦象总论\n当前宜稳');
  });

  it('正确处理引号、反斜线和 Unicode 转义', () => {
    const partial = '{"integrated_reading":"宜守\\"正\\"，路径 C:\\\\temp，\\u5409';
    expect(extractPartialJsonString(partial, 'integrated_reading')).toBe('宜守"正"，路径 C:\\temp，吉');
  });

  it('不展示尚未完整的转义序列', () => {
    expect(extractPartialJsonString('{"integrated_reading":"正文\\', 'integrated_reading')).toBe('正文');
    expect(extractPartialJsonString('{"integrated_reading":"正文\\u54', 'integrated_reading')).toBe('正文');
  });

  it('能够分别读取两个解读字段', () => {
    const content = '{"integrated_reading":"综合","hexagram_reading":"## 一、释义\\n内容"}';
    expect(extractPartialJsonString(content, 'integrated_reading')).toBe('综合');
    expect(extractPartialJsonString(content, 'hexagram_reading')).toBe('## 一、释义\n内容');
  });
});

describe('DeepSeek 流式诊断信息', () => {
  it('记录上游状态、结束原因与内容长度', async () => {
    const content = JSON.stringify({
      integrated_reading: '综合内容',
      hexagram_reading: '卦象内容',
    });
    const body = [
      `data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: null }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`,
      'data: [DONE]\n\n',
    ].join('');
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as { max_tokens: number };
      expect(request.max_tokens).toBe(4_096);
      return new Response(body, {
        status: 200,
        headers: { 'x-request-id': 'deepseek-trace-1' },
      });
    }));

    const result = await streamDeepSeekReading({
      apiKey: 'test-key',
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: 'test' }],
      timeoutMs: 5_000,
      onDelta: vi.fn(),
    });

    expect(result.integrated_reading).toBe('综合内容');
    expect(result.diagnostics).toMatchObject({
      upstreamStatus: 200,
      upstreamRequestId: 'deepseek-trace-1',
      accumulatedLength: content.length,
      integratedLength: 4,
      hexagramLength: 4,
      finishReason: 'stop',
      receivedDone: true,
    });
  });

  it('JSON 被 length 截断时把结束原因带入错误', async () => {
    const partial = '{"integrated_reading":"只生成了一半';
    const body = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: partial }, finish_reason: null }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'length' }] })}\n\n`,
      'data: [DONE]\n\n',
    ].join('');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 200 })));

    const error = await streamDeepSeekReading({
      apiKey: 'test-key',
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: 'test' }],
      timeoutMs: 5_000,
      onDelta: vi.fn(),
    }).catch(caught => caught);

    expect(error).toBeInstanceOf(DeepSeekStreamError);
    expect(error).toMatchObject({
      kind: 'invalid_response',
      diagnostics: {
        finishReason: 'length',
        receivedDone: true,
        integratedLength: 6,
      },
    });
  });
});
