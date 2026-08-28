import { afterEach, describe, expect, it, vi } from 'vitest';
import { streamReading, type ReadingStreamInput } from './readingStream';

const input: ReadingStreamInput = {
  question: '测试问题',
  originalKey: '01',
  originalName: '乾为天',
  originalBits: '111111',
  changedKey: null,
  changedName: null,
  changedBits: null,
  movingLines: [],
  guaCi: '元亨利贞。',
  xiangYue: '天行健。',
  yaoCi: [],
  linesJson: '[7,7,7,7,7,7]',
};

afterEach(() => vi.unstubAllGlobals());

describe('浏览器流式解读客户端', () => {
  it('按到达顺序追加 delta，并读取最终完整结果', async () => {
    const encoder = new TextEncoder();
    const chunks = [
      ': connected\n\n',
      'event: delta\ndata: {"section":"integrated","text":"第一"}\n\n',
      'event: delta\ndata: {"section":"integrated","text":"段"}\n\n',
      'event: complete\ndata: {"integratedReading":"第一段","hexagramReading":"第二段","readingId":null}\n\n',
    ];
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({
      start(controller) {
        chunks.forEach(chunk => controller.enqueue(encoder.encode(chunk)));
        controller.close();
      },
    }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } })));

    const received: string[] = [];
    const result = await streamReading(input, {
      onDelta: (section, text) => received.push(`${section}:${text}`),
    });

    expect(received).toEqual(['integrated:第一', 'integrated:段']);
    expect(result).toEqual({ integratedReading: '第一段', hexagramReading: '第二段', readingId: null });
  });

  it('把服务端流式错误转换为可显示的错误', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      'event: error\ndata: {"message":"解读生成超时，请稍后重试。"}\n\n',
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
    )));

    await expect(streamReading(input, { onDelta: vi.fn() })).rejects.toThrow('解读生成超时');
  });
});
