export type AutoRefreshDisplay = {
  tagPrefix: string;
  tagValue: string;
  tagColor: string;
  summaryText: string;
};

type GetAutoRefreshDisplayParams = {
  isTerminalStatus: boolean;
  countdown: number;
  manualRefreshing: boolean;
  pollTimeoutReached: boolean;
  pollPausedByError: boolean;
};

export const getAutoRefreshDisplay = (
  params: GetAutoRefreshDisplayParams,
): AutoRefreshDisplay | null => {
  const { isTerminalStatus, countdown, manualRefreshing, pollTimeoutReached, pollPausedByError } =
    params;

  if (isTerminalStatus) {
    return null;
  }

  if (pollTimeoutReached) {
    return {
      tagPrefix: '自动追踪',
      tagValue: '已超时暂停',
      tagColor: 'default',
      summaryText: '，自动追踪已超时暂停',
    };
  }

  if (pollPausedByError) {
    return {
      tagPrefix: '自动追踪',
      tagValue: '已因连续失败暂停',
      tagColor: 'warning',
      summaryText: '，自动追踪已因连续查询失败暂停',
    };
  }

  if (manualRefreshing) {
    return {
      tagPrefix: '自动追踪',
      tagValue: '同步中...',
      tagColor: 'processing',
      summaryText: '，正在同步最新状态',
    };
  }

  const safeCountdown = Math.max(countdown, 0);
  return {
    tagPrefix: '下次自动刷新',
    tagValue: `${safeCountdown}s`,
    tagColor: safeCountdown <= 3 ? 'orange' : 'blue',
    summaryText: `，预计 ${safeCountdown}s 后自动刷新`,
  };
};
