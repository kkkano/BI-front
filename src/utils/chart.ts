export type UploadFieldValue = {
  file?: {
    originFileObj?: File;
  };
  fileList?: {
    originFileObj?: File;
  }[];
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export const getErrorMessage = (error: unknown, fallback = '未知错误'): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  return fallback;
};

export const getUploadFile = (fileField?: UploadFieldValue): File | undefined =>
  fileField?.file?.originFileObj ?? fileField?.fileList?.[0]?.originFileObj;

export const parseChartOption = <T extends object>(raw?: string): T | null => {
  if (!raw) {
    return null;
  }

  const payload = raw.trim();
  if (!payload) {
    return null;
  }

  for (const candidate of [payload, payload.replace(/'/g, '"')]) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (isObject(parsed)) {
        return parsed as T;
      }
    } catch {
      continue;
    }
  }

  return null;
};

export const hasUsableOption = <T extends object>(option: T | null): option is T =>
  !!option && Object.keys(option as Record<string, unknown>).length > 0;
