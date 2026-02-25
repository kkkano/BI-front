export type TaskStatusSummary = {
  waitCount: number;
  runningCount: number;
  succeedCount: number;
  failedCount: number;
  returnedCount: number;
};

const sumCount = (value: number | undefined): number => {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    return 0;
  }
  return value;
};

export const aggregateTaskStatusSummary = (
  batchDataList: Array<API.ChartTaskStatusBatchVO | undefined>,
): TaskStatusSummary => {
  return batchDataList.reduce<TaskStatusSummary>(
    (acc, batchData) => ({
      waitCount: acc.waitCount + sumCount(batchData?.waitCount),
      runningCount: acc.runningCount + sumCount(batchData?.runningCount),
      succeedCount: acc.succeedCount + sumCount(batchData?.succeedCount),
      failedCount: acc.failedCount + sumCount(batchData?.failedCount),
      returnedCount: acc.returnedCount + sumCount(batchData?.returnedCount),
    }),
    {
      waitCount: 0,
      runningCount: 0,
      succeedCount: 0,
      failedCount: 0,
      returnedCount: 0,
    },
  );
};

export const getTaskStatusSummaryText = (summary: TaskStatusSummary): string | undefined => {
  const statusCountTotal =
    sumCount(summary.waitCount) +
    sumCount(summary.runningCount) +
    sumCount(summary.succeedCount) +
    sumCount(summary.failedCount);

  // 兼容后端分批统计字段 returnedCount 缺失或延迟同步的场景
  const effectiveReturnedCount = Math.max(sumCount(summary.returnedCount), statusCountTotal);
  if (effectiveReturnedCount <= 0) {
    return undefined;
  }

  const segments: string[] = [];
  if (summary.waitCount > 0) {
    segments.push(`排队中 ${summary.waitCount}`);
  }
  if (summary.runningCount > 0) {
    segments.push(`执行中 ${summary.runningCount}`);
  }
  if (summary.succeedCount > 0) {
    segments.push(`已完成 ${summary.succeedCount}`);
  }
  if (summary.failedCount > 0) {
    segments.push(`失败 ${summary.failedCount}`);
  }

  if (segments.length === 0) {
    return undefined;
  }

  return `本轮状态：${segments.join(' / ')}`;
};
