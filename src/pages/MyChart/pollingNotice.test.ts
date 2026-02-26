import { aggregateTaskStatusSummary, getTaskStatusSummaryText } from './pollingNotice';

describe('pollingNotice helpers', () => {
  it('aggregates batch status counters', () => {
    const summary = aggregateTaskStatusSummary([
      {
        waitCount: 2,
        runningCount: 1,
        succeedCount: 3,
        failedCount: 0,
        returnedCount: 6,
        pendingCount: 3,
        terminalCount: 3,
        requestedCount: 6,
        unavailableCount: 0,
        allFinished: false,
      },
      {
        waitCount: 1,
        runningCount: 0,
        succeedCount: 2,
        failedCount: 1,
        returnedCount: 4,
        pendingCount: 1,
        terminalCount: 3,
        requestedCount: 4,
        unavailableCount: 1,
        allFinished: false,
      },
    ]);

    expect(summary).toEqual({
      waitCount: 3,
      runningCount: 1,
      succeedCount: 5,
      failedCount: 1,
      returnedCount: 10,
      pendingCount: 4,
      terminalCount: 6,
      requestedCount: 10,
      unavailableCount: 1,
      allFinished: false,
    });
  });

  it('ignores invalid counters and falls back to wait/running for pending', () => {
    const summary = aggregateTaskStatusSummary([
      {
        waitCount: 2,
        runningCount: 1,
        pendingCount: -1,
        terminalCount: Number.NaN,
        succeedCount: undefined,
        failedCount: 2,
        returnedCount: 2,
        allFinished: false,
      },
    ]);

    expect(summary).toEqual({
      waitCount: 2,
      runningCount: 1,
      succeedCount: 0,
      failedCount: 2,
      returnedCount: 2,
      pendingCount: 3,
      terminalCount: 2,
      requestedCount: 0,
      unavailableCount: 0,
      allFinished: false,
    });
  });

  it('builds readable status summary text', () => {
    const text = getTaskStatusSummaryText({
      waitCount: 2,
      runningCount: 1,
      succeedCount: 3,
      failedCount: 1,
      returnedCount: 7,
      pendingCount: 3,
      terminalCount: 4,
      requestedCount: 7,
      unavailableCount: 0,
      allFinished: false,
    });

    expect(text).toBe('本轮状态：排队中 2 / 执行中 1 / 已完成 3 / 失败 1（剩余处理中 3）');
  });

  it('appends all-finished hint when all chunks are completed', () => {
    const text = getTaskStatusSummaryText({
      waitCount: 0,
      runningCount: 0,
      succeedCount: 5,
      failedCount: 1,
      returnedCount: 6,
      pendingCount: 0,
      terminalCount: 6,
      requestedCount: 6,
      unavailableCount: 0,
      allFinished: true,
    });

    expect(text).toBe('本轮状态：已完成 5 / 失败 1（全部任务已结束）');
  });

  it('returns undefined when no meaningful status should be displayed', () => {
    expect(
      getTaskStatusSummaryText({
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
      }),
    ).toBeUndefined();

    expect(
      getTaskStatusSummaryText({
        waitCount: 0,
        runningCount: 0,
        succeedCount: 0,
        failedCount: 0,
        returnedCount: 3,
        pendingCount: 0,
        terminalCount: 0,
        requestedCount: 3,
        unavailableCount: 0,
        allFinished: false,
      }),
    ).toBeUndefined();
  });
});
