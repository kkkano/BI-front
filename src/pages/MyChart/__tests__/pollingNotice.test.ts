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
      },
      {
        waitCount: -1,
        runningCount: Number.NaN,
        succeedCount: undefined,
        failedCount: 2,
        returnedCount: -3,
      },
      undefined,
    ]);

    expect(summary).toEqual({
      waitCount: 1,
      runningCount: 2,
      succeedCount: 3,
      failedCount: 6,
      returnedCount: 10,
    });
  });

  it('getTaskStatusSummaryText 在 returnedCount 缺失但状态计数有效时应返回摘要', () => {
    const summaryText = getTaskStatusSummaryText({
      waitCount: 2,
      runningCount: 1,
      succeedCount: 0,
      failedCount: 0,
      returnedCount: 0,
    });

    expect(summaryText).toBe('本轮状态：排队中 2 / 执行中 1');
  });

  it('getTaskStatusSummaryText 在无有效统计时返回 undefined', () => {
    const summaryText = getTaskStatusSummaryText({
      waitCount: 0,
      runningCount: 0,
      succeedCount: 0,
      failedCount: 0,
      returnedCount: 5,
    });

    expect(summaryText).toBeUndefined();
  });
});
