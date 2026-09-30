import { describe, expect, it } from 'vitest';
import type { TrpcContext } from './_core/context';
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
  it('关闭缺少 Turnstile 与预算保护的旧整包解读入口', async () => {
    const caller = appRouter.createCaller(createAnonymousContext());
    await expect(caller.reading.generate(readingInput)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: '此解读入口已停用，请刷新页面后重试。',
    });
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
