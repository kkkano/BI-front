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
      },
      {
        waitCount: 1,
        runningCount: 0,
        succeedCount: 2,
        failedCount: 1,
        returnedCount: 4,
      },
    ]);

    expect(summary).toEqual({
      waitCount: 3,
      runningCount: 1,
      succeedCount: 5,
      failedCount: 1,
      returnedCount: 10,
    });
  });

  it('ignores invalid counters', () => {
    const summary = aggregateTaskStatusSummary([
      {
        waitCount: -1,
        runningCount: Number.NaN,
        succeedCount: undefined,
        failedCount: 2,
        returnedCount: 2,
      },
    ]);

    expect(summary).toEqual({
      waitCount: 0,
      runningCount: 0,
      succeedCount: 0,
      failedCount: 2,
      returnedCount: 2,
    });
  });

  it('builds readable status summary text', () => {
    const text = getTaskStatusSummaryText({
      waitCount: 2,
      runningCount: 1,
      succeedCount: 3,
      failedCount: 1,
      returnedCount: 7,
    });

    expect(text).toBe('本轮状态：排队中 2 / 执行中 1 / 已完成 3 / 失败 1');
  });

  it('returns undefined when no meaningful status should be displayed', () => {
    expect(
      getTaskStatusSummaryText({
        waitCount: 0,
        runningCount: 0,
        succeedCount: 0,
        failedCount: 0,
        returnedCount: 0,
      }),
    ).toBeUndefined();

    expect(
      getTaskStatusSummaryText({
        waitCount: 0,
        runningCount: 0,
        succeedCount: 0,
        failedCount: 0,
        returnedCount: 3,
      }),
    ).toBeUndefined();
  });
});
