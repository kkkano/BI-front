export const TASK_STATUS_LABELS: Record<string, string> = {
  wait: '排队中',
  running: '分析执行中',
  succeed: '分析完成',
  failed: '分析失败',
};

export const DEFAULT_IDLE_STATUS_TEXT = '未开始';

export const DEFAULT_FAILURE_TIP =
  '任务执行失败，建议先根据失败原因调整数据字段、分析目标或图表类型，再点击“重试自动追踪”或重新提交任务';

export const getTaskStatusText = (status?: string): string => {
  if (!status) return DEFAULT_IDLE_STATUS_TEXT;
  return TASK_STATUS_LABELS[status] || '状态更新';
};

export const buildFailureHint = (execMessage?: string): string => {
  if (!execMessage) return DEFAULT_FAILURE_TIP;
  return `失败原因：${execMessage}。建议先根据失败原因调整数据字段、分析目标或图表类型，再点击“重试自动追踪”或重新提交任务`;
};
