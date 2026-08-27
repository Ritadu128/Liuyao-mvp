function normalizeHttpsUrl(value: string | undefined): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** 公开内容配置：可通过构建时环境变量覆盖；不得用于 API Key 等敏感值。 */
export const PUBLIC_CONFIG = {
  contactEmail: import.meta.env.VITE_CONTACT_EMAIL?.trim() || 'ritadu1128@gmail.com',
  kofiUrl: normalizeHttpsUrl(import.meta.env.VITE_KOFI_URL) || 'https://ko-fi.com/rita128128',
  policyUpdatedAt: '2026-08-28',
};
