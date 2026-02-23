export const TASK_STATUS_LABELS: Record<string, string> = {
  wait: '排队中',
  running: '分析执行中',
  succeed: '分析完成',
  failed: '分析失败',
};

export const DEFAULT_IDLE_STATUS_TEXT = '未开始';

export const DEFAULT_FAILURE_TIP =
  '任务执行失败，建议检查数据字段完整性、分析目标描述和图表类型后重试';

export const getTaskStatusText = (status?: string): string => {
  if (!status) return DEFAULT_IDLE_STATUS_TEXT;
  return TASK_STATUS_LABELS[status] || '状态更新';
};

export const buildFailureHint = (execMessage?: string): string => {
  if (!execMessage) return DEFAULT_FAILURE_TIP;
  return `失败原因：${execMessage}。建议检查数据字段完整性、分析目标描述和图表类型后重试`;
};
