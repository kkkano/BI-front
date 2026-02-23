export const TASK_STATUS_LABELS: Record<string, string> = {
  wait: '排队中',
  running: '分析执行中',
  succeed: '分析完成',
  failed: '分析失败',
};

export const DEFAULT_IDLE_STATUS_TEXT = '未开始';

export const DEFAULT_FAILURE_TIP =
  '任务执行失败，建议先根据失败原因调整数据字段、分析目标或图表类型，再点击“重试自动追踪”或重新提交任务';

const STACK_TRACE_PREFIX = 'at ';
const MAX_SUMMARY_LENGTH = 120;

const stripExceptionPrefix = (line: string): string =>
  line.replace(/^([A-Za-z_$][\w$]*\.)*[A-Za-z_$][\w$]*(Exception|Error):\s*/, '');

const getMeaningfulLines = (execMessage?: string): string[] => {
  if (!execMessage) return [];

  return execMessage
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith(STACK_TRACE_PREFIX))
    .map((line) => stripExceptionPrefix(line));
};

export const getFailureReasonSummary = (execMessage?: string): string => {
  const lines = getMeaningfulLines(execMessage);
  const reason = lines.find(Boolean);
  if (!reason) return '';
  if (reason.length <= MAX_SUMMARY_LENGTH) return reason;
  return `${reason.slice(0, MAX_SUMMARY_LENGTH)}...`;
};

export const getFailureDetailText = (execMessage?: string): string => {
  const lines = getMeaningfulLines(execMessage);
  if (!lines.length) return '';
  return lines.slice(0, 3).join('；');
};

export const getTaskStatusText = (status?: string): string => {
  if (!status) return DEFAULT_IDLE_STATUS_TEXT;
  return TASK_STATUS_LABELS[status] || '状态更新';
};

export const buildFailureHint = (execMessage?: string): string => {
  const reason = getFailureReasonSummary(execMessage);
  if (!reason) return DEFAULT_FAILURE_TIP;
  return `失败原因：${reason}。建议先根据失败原因调整数据字段、分析目标或图表类型，再点击“重试自动追踪”或重新提交任务`;
};
