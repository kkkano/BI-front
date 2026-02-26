export type TaskStatusSummary = {
  waitCount: number;
  runningCount: number;
  succeedCount: number;
  failedCount: number;
  returnedCount: number;
  pendingCount: number;
  terminalCount: number;
  requestedCount: number;
  unavailableCount: number;
  allFinished: boolean;
};

const sumCount = (value: number | undefined): number => {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    return 0;
  }
  return value;
};

const resolvePendingCount = (batchData?: API.ChartTaskStatusBatchVO): number => {
  if (!batchData) {
    return 0;
  }
  const waitAndRunning = sumCount(batchData.waitCount) + sumCount(batchData.runningCount);
  return Math.max(sumCount(batchData.pendingCount), waitAndRunning);
};

const resolveTerminalCount = (batchData?: API.ChartTaskStatusBatchVO): number => {
  if (!batchData) {
    return 0;
  }
  const succeedAndFailed = sumCount(batchData.succeedCount) + sumCount(batchData.failedCount);
  return Math.max(sumCount(batchData.terminalCount), succeedAndFailed);
};

export const aggregateTaskStatusSummary = (
  batchDataList: Array<API.ChartTaskStatusBatchVO | undefined>,
): TaskStatusSummary => {
  let hasBatchData = false;
  let allFinished = true;

  const summary = batchDataList.reduce<TaskStatusSummary>((acc, batchData) => {
    if (!batchData) {
      return acc;
    }

    hasBatchData = true;
    const pendingCount = resolvePendingCount(batchData);
    const terminalCount = resolveTerminalCount(batchData);

    const batchAllFinished =
      typeof batchData.allFinished === 'boolean' ? batchData.allFinished : pendingCount <= 0;
    allFinished = allFinished && batchAllFinished;

    return {
      waitCount: acc.waitCount + sumCount(batchData.waitCount),
      runningCount: acc.runningCount + sumCount(batchData.runningCount),
      succeedCount: acc.succeedCount + sumCount(batchData.succeedCount),
      failedCount: acc.failedCount + sumCount(batchData.failedCount),
      returnedCount: acc.returnedCount + sumCount(batchData.returnedCount),
      pendingCount: acc.pendingCount + pendingCount,
      terminalCount: acc.terminalCount + terminalCount,
      requestedCount: acc.requestedCount + sumCount(batchData.requestedCount),
      unavailableCount: acc.unavailableCount + sumCount(batchData.unavailableCount),
      allFinished: false,
    };
  }, {
    waitCount: 0,
    runningCount: 0,
    succeedCount: 0,
    failedCount: 0,
    returnedCount: 0,
    pendingCount: 0,
    terminalCount: 0,
    requestedCount: 0,
    unavailableCount: 0,
    allFinished: false,
  });

  summary.allFinished = hasBatchData ? allFinished && summary.pendingCount <= 0 : false;
  return summary;
};

export const getTaskStatusSummaryText = (summary: TaskStatusSummary): string | undefined => {
  const statusCountTotal =
    sumCount(summary.waitCount) +
    sumCount(summary.runningCount) +
    sumCount(summary.succeedCount) +
    sumCount(summary.failedCount);

  const effectivePendingCount = Math.max(
    sumCount(summary.pendingCount),
    sumCount(summary.waitCount) + sumCount(summary.runningCount),
  );
  const effectiveTerminalCount = Math.max(
    sumCount(summary.terminalCount),
    sumCount(summary.succeedCount) + sumCount(summary.failedCount),
  );

  // 兼容后端分批统计字段延迟同步的场景
  const effectiveReturnedCount = Math.max(
    sumCount(summary.returnedCount),
    statusCountTotal,
    effectivePendingCount + effectiveTerminalCount,
  );
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
    if (effectivePendingCount > 0) {
      segments.push(`处理中 ${effectivePendingCount}`);
    }
    if (effectiveTerminalCount > 0) {
      segments.push(`已结束 ${effectiveTerminalCount}`);
    }
  }

  if (segments.length === 0) {
    return undefined;
  }

  const completedSuffix = summary.allFinished
    ? '（全部任务已结束）'
    : effectivePendingCount > 0
      ? `（剩余处理中 ${effectivePendingCount}）`
      : '';

  return `本轮状态：${segments.join(' / ')}${completedSuffix}`;
};
