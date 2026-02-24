import { getAutoRefreshDisplay } from './pollingDisplay';

describe('getAutoRefreshDisplay', () => {
  it('should return paused timeout text when timeout reached', () => {
    const display = getAutoRefreshDisplay({
      isTerminalStatus: false,
      countdown: 0,
      manualRefreshing: false,
      pollTimeoutReached: true,
      pollPausedByError: false,
    });

    expect(display).toEqual({
      tagPrefix: '自动追踪',
      tagValue: '已超时暂停',
      tagColor: 'default',
      summaryText: '，自动追踪已超时暂停',
    });
  });

  it('should return paused error text when paused by consecutive errors', () => {
    const display = getAutoRefreshDisplay({
      isTerminalStatus: false,
      countdown: 0,
      manualRefreshing: false,
      pollTimeoutReached: false,
      pollPausedByError: true,
    });

    expect(display?.tagPrefix).toBe('自动追踪');
    expect(display?.tagValue).toBe('已因连续失败暂停');
    expect(display?.summaryText).toBe('，自动追踪已因连续查询失败暂停');
  });

  it('should return active countdown text in normal polling state', () => {
    const display = getAutoRefreshDisplay({
      isTerminalStatus: false,
      countdown: 2,
      manualRefreshing: false,
      pollTimeoutReached: false,
      pollPausedByError: false,
    });

    expect(display).toEqual({
      tagPrefix: '下次自动刷新',
      tagValue: '2s',
      tagColor: 'orange',
      summaryText: '，预计 2s 后自动刷新',
    });
  });

  it('should return null for terminal task', () => {
    const display = getAutoRefreshDisplay({
      isTerminalStatus: true,
      countdown: 3,
      manualRefreshing: false,
      pollTimeoutReached: false,
      pollPausedByError: false,
    });

    expect(display).toBeNull();
  });
});
