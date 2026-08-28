import { describe, expect, it } from 'vitest';
import { extractPartialJsonString } from './readingStream';

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
