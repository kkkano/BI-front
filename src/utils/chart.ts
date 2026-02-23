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

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const pickFirstString = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (isNonEmptyString(value)) {
      return value.trim();
    }
  }
  return undefined;
};

export const getErrorMessage = (error: unknown, fallback = '未知错误'): string => {
  if (error instanceof Error && isNonEmptyString(error.message)) {
    return error.message;
  }

  if (isNonEmptyString(error)) {
    return error.trim();
  }

  if (isObject(error)) {
    const data = isObject(error.data) ? error.data : undefined;
    const message = pickFirstString(
      error.message,
      error.msg,
      error.errorMessage,
      data?.message,
      data?.msg,
    );
    if (message) {
      return message;
    }
  }

  return fallback;
};

export const getUploadFile = (fileField?: UploadFieldValue): File | undefined =>
  fileField?.file?.originFileObj ?? fileField?.fileList?.[0]?.originFileObj;

const CHART_UPLOAD_FILE_NAME_REGEX = /\.(xlsx|xls|csv)$/i;

export const CHART_UPLOAD_FILE_ACCEPT = '.xlsx,.xls,.csv';
export const MAX_CHART_UPLOAD_FILE_SIZE = 1024 * 1024;

export const validateChartUploadFile = (file?: Pick<File, 'name' | 'size'>): string | undefined => {
  if (!file) {
    return '请上传数据文件';
  }

  if (!isNonEmptyString(file.name) || !CHART_UPLOAD_FILE_NAME_REGEX.test(file.name)) {
    return '仅支持 .xlsx / .xls / .csv 文件';
  }

  if (typeof file.size === 'number' && file.size > MAX_CHART_UPLOAD_FILE_SIZE) {
    return '文件大小不能超过 1MB';
  }

  return undefined;
};

const extractCodeFencePayload = (payload: string): string | undefined => {
  const match = payload.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const fencedContent = match?.[1]?.trim();
  return fencedContent || undefined;
};

const extractObjectPayload = (payload: string): string | undefined => {
  const start = payload.indexOf('{');
  const end = payload.lastIndexOf('}');
  if (start === -1 || end <= start) {
    return undefined;
  }

  const objectPayload = payload.slice(start, end + 1).trim();
  return objectPayload || undefined;
};

const normalizeSingleQuotedJson = (payload: string): string =>
  payload
    .replace(/([{,]\s*)'([^'\\]+?)'(\s*:)/g, '$1"$2"$3')
    .replace(
      /(:\s*)'([^'\\]*(?:\\.[^'\\]*)*)'(\s*[,}])/g,
      (_match, prefix: string, rawValue: string, suffix: string) =>
        `${prefix}"${rawValue.replace(/"/g, '\\"')}"${suffix}`,
    );

const buildParseCandidates = (payload: string): string[] => {
  const candidates = [payload];

  const fencedPayload = extractCodeFencePayload(payload);
  if (fencedPayload) {
    candidates.push(fencedPayload);
  }

  const objectPayload = extractObjectPayload(payload);
  if (objectPayload) {
    candidates.push(objectPayload);
  }

  const normalizedCandidates: string[] = [];
  candidates.forEach((candidate) => {
    normalizedCandidates.push(candidate);
    normalizedCandidates.push(normalizeSingleQuotedJson(candidate));
    normalizedCandidates.push(candidate.replace(/'/g, '"'));
  });

  return Array.from(
    new Set(normalizedCandidates.map((candidate) => candidate.trim()).filter(Boolean)),
  );
};

export const parseChartOption = <T extends object>(raw?: string): T | null => {
  if (!raw) {
    return null;
  }

  const payload = raw.trim();
  if (!payload) {
    return null;
  }

  const candidates = buildParseCandidates(payload);

  for (const candidate of candidates) {
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
