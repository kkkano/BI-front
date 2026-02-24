export const TASK_PHASE_LABELS: Record<API.ChartTaskPhaseEnum, string> = {
  created: '任务已创建',
  status_running_updated: '状态更新为执行中',
  ai_generating: 'AI 正在生成结果',
  ai_result_parsed: 'AI 结果解析完成',
  result_persisting: '正在持久化分析结果',
  result_succeed_updated: '状态更新为成功',
  finished: '任务处理完成',
  failed: '任务执行失败',
};

export const getTaskPhaseText = (taskPhase?: API.ChartTaskPhaseEnum | string): string => {
  if (!taskPhase) {
    return '待开始';
  }
  return TASK_PHASE_LABELS[taskPhase as API.ChartTaskPhaseEnum] || taskPhase;
};
