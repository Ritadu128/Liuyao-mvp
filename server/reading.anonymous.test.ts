import { describe, expect, it } from 'vitest';
import type { TrpcContext } from './_core/context';
import { ENV } from './_core/env';
import { appRouter } from './routers';

const readingInput = {
  question: '此次求职能否顺利？',
  originalKey: '01',
  originalName: '乾为天',
  originalBits: '111111',
  changedKey: null,
  changedName: null,
  changedBits: null,
  movingLines: [],
  guaCi: '元亨利贞。',
  xiangYue: '天行健，君子以自强不息。',
  yaoCi: [],
  linesJson: '[7,7,7,7,7,7]',
};

function createAnonymousContext(): TrpcContext {
  return {
    user: null,
    req: {
      headers: {},
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
    } as TrpcContext['req'],
    res: {} as TrpcContext['res'],
  };
}

describe('匿名解读接口', () => {
  it('未配置 DeepSeek Key 时返回受控错误，且不会尝试调用外部服务', async () => {
    const originalApiKey = ENV.deepseekApiKey;
    ENV.deepseekApiKey = '';

    try {
      const caller = appRouter.createCaller(createAnonymousContext());
      await expect(caller.reading.generate(readingInput)).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
        message: '解读服务尚未配置，请稍后再试。',
      });
    } finally {
      ENV.deepseekApiKey = originalApiKey;
    }
  });

  it('在调用模型前拒绝无效卦象格式和重复动爻', async () => {
    const caller = appRouter.createCaller(createAnonymousContext());
    await expect(caller.reading.generate({ ...readingInput, originalBits: '1102xx' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    await expect(caller.reading.generate({ ...readingInput, movingLines: [1, 1] })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('匿名用户不会从服务端读取历史记录', async () => {
    const caller = appRouter.createCaller(createAnonymousContext());
    await expect(caller.reading.list({ limit: 20 })).resolves.toEqual([]);
  });

  it('匿名用户不能访问未来 OAuth 版本的服务端历史详情', async () => {
    const caller = appRouter.createCaller(createAnonymousContext());
    await expect(caller.reading.getById({ id: 1 })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: '无权访问此记录',
    });
  });
});
