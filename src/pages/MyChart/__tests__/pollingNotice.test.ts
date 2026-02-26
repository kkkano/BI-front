import {
  aggregateTaskStatusSummary,
  getTaskStatusSummaryText,
} from '../pollingNotice';

describe('pollingNotice', () => {
  it('aggregateTaskStatusSummary 应该忽略非法计数字段并完成累加', () => {
    const summary = aggregateTaskStatusSummary([
      {
        waitCount: 1,
        runningCount: 2,
        succeedCount: 3,
        failedCount: 4,
        returnedCount: 10,
        pendingCount: 3,
        terminalCount: 7,
        allFinished: false,
      },
      {
        waitCount: -1,
        runningCount: Number.NaN,
        succeedCount: undefined,
        failedCount: 2,
        returnedCount: -3,
        pendingCount: 0,
        terminalCount: 2,
        allFinished: true,
      },
      undefined,
    ]);

    expect(summary).toEqual({
      waitCount: 1,
      runningCount: 2,
      succeedCount: 3,
      failedCount: 6,
      returnedCount: 10,
      pendingCount: 3,
      terminalCount: 9,
      requestedCount: 0,
      unavailableCount: 0,
      allFinished: false,
    });
  });

  it('getTaskStatusSummaryText 在 returnedCount 缺失但状态计数有效时应返回摘要', () => {
    const summaryText = getTaskStatusSummaryText({
      waitCount: 2,
      runningCount: 1,
      succeedCount: 0,
      failedCount: 0,
      returnedCount: 0,
      pendingCount: 3,
      terminalCount: 0,
      requestedCount: 0,
      unavailableCount: 0,
      allFinished: false,
    });

    expect(summaryText).toBe('本轮状态：排队中 2 / 执行中 1（剩余处理中 3）');
  });

  it('getTaskStatusSummaryText 在所有任务完成时追加结束提示', () => {
    const summaryText = getTaskStatusSummaryText({
      waitCount: 0,
      runningCount: 0,
      succeedCount: 4,
      failedCount: 1,
      returnedCount: 5,
      pendingCount: 0,
      terminalCount: 5,
      requestedCount: 5,
      unavailableCount: 0,
      allFinished: true,
    });

    expect(summaryText).toBe('本轮状态：已完成 4 / 失败 1（全部任务已结束）');
  });

  it('getTaskStatusSummaryText 在无有效统计时返回 undefined', () => {
    const summaryText = getTaskStatusSummaryText({
      waitCount: 0,
      runningCount: 0,
      succeedCount: 0,
      failedCount: 0,
      returnedCount: 5,
      pendingCount: 0,
      terminalCount: 0,
      requestedCount: 0,
      unavailableCount: 0,
      allFinished: false,
    });

    expect(summaryText).toBeUndefined();
  });
});
