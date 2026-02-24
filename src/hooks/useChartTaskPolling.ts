import { useCallback, useEffect, useRef, useState } from 'react';

export type PollSource = 'auto' | 'manual';
export type ResumeReason = 'timeout' | 'error';

type PollMessage = {
  message: string;
  detail?: string;
};

type PollErrorFormatter = (
  error: unknown,
  context: {
    consecutiveErrorCount: number;
    maxConsecutiveErrors: number;
    paused: boolean;
  },
) => PollMessage;

type UseChartTaskPollingOptions<TData> = {
  pollIntervalMs: number;
  maxRetry: number;
  maxConsecutiveErrors: number;
  fetchStatus: (taskId: number) => Promise<TData | null | undefined>;
  isTerminalStatus: (data: TData) => boolean;
  onData: (data: TData, source: PollSource) => void;
  onTerminal?: (data: TData) => void;
  formatEmptyMessage?: () => PollMessage;
  formatTimeoutMessage?: (context: { maxRetry: number }) => string;
  formatErrorMessage: PollErrorFormatter;
  onEmpty?: (payload: PollMessage) => void;
  onTimeout?: (message: string) => void;
  onError?: (payload: PollMessage & { paused: boolean; consecutiveErrorCount: number }) => void;
  onResume?: (context: { reason: ResumeReason }) => void;
  getLastPolledAt?: () => string;
};

type UseChartTaskPollingResult = {
  countdown: number;
  pollCount: number;
  pollError: string;
  pollErrorDetail: string;
  lastPolledAt: string;
  manualRefreshing: boolean;
  pollTimeoutReached: boolean;
  pollPausedByError: boolean;
  consecutiveErrorCount: number;
  activeTaskId?: number;
  canResumeAutoPolling: boolean;
  startPolling: (taskId: number) => void;
  stopPolling: () => void;
  resetPollingState: () => void;
  pollNow: (taskId?: number) => void;
  retryAutoPolling: (taskId?: number) => boolean;
};

const DEFAULT_EMPTY_MESSAGE = '状态查询成功，但未返回任务详情，请稍后重试';
const DEFAULT_TIMEOUT_MESSAGE =
  '自动追踪超时：已达到最大查询次数。你可以重试自动追踪，或稍后在“我的图表”查看最终结果';

const getCurrentTime = (): string =>
  new Date().toLocaleTimeString('zh-CN', {
    hour12: false,
  });

export function useChartTaskPolling<TData>(
  options: UseChartTaskPollingOptions<TData>,
): UseChartTaskPollingResult {
  const {
    pollIntervalMs,
    maxRetry,
    maxConsecutiveErrors,
    fetchStatus,
    isTerminalStatus,
    onData,
    onTerminal,
    formatEmptyMessage,
    formatTimeoutMessage,
    formatErrorMessage,
    onEmpty,
    onTimeout,
    onError,
    onResume,
    getLastPolledAt = getCurrentTime,
  } = options;

  const [countdown, setCountdown] = useState<number>(0);
  const [pollCount, setPollCount] = useState<number>(0);
  const [pollError, setPollError] = useState<string>('');
  const [pollErrorDetail, setPollErrorDetail] = useState<string>('');
  const [lastPolledAt, setLastPolledAt] = useState<string>('');
  const [manualRefreshing, setManualRefreshing] = useState<boolean>(false);
  const [pollTimeoutReached, setPollTimeoutReached] = useState<boolean>(false);
  const [pollPausedByError, setPollPausedByError] = useState<boolean>(false);
  const [consecutiveErrorCount, setConsecutiveErrorCount] = useState<number>(0);

  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const countdownTimerRef = useRef<ReturnType<typeof setInterval>>();
  const pollCountRef = useRef<number>(0);
  const errorCountRef = useRef<number>(0);
  const activeTaskIdRef = useRef<number>();
  const pollSessionRef = useRef<number>(0);
  const inFlightTaskIdRef = useRef<number>();
  const inFlightSessionRef = useRef<number>();
  const isMountedRef = useRef<boolean>(true);

  const isCurrentPollSession = useCallback((taskId: number, session: number): boolean => {
    return (
      isMountedRef.current &&
      activeTaskIdRef.current === taskId &&
      pollSessionRef.current === session
    );
  }, []);

  const isRequestInFlight = useCallback((taskId: number, session: number): boolean => {
    return inFlightTaskIdRef.current === taskId && inFlightSessionRef.current === session;
  }, []);

  const markRequestInFlight = useCallback((taskId: number, session: number): void => {
    inFlightTaskIdRef.current = taskId;
    inFlightSessionRef.current = session;
  }, []);

  const clearRequestInFlight = useCallback((taskId: number, session: number): void => {
    if (inFlightTaskIdRef.current === taskId && inFlightSessionRef.current === session) {
      inFlightTaskIdRef.current = undefined;
      inFlightSessionRef.current = undefined;
    }
  }, []);

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = undefined;
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = undefined;
    }
    inFlightTaskIdRef.current = undefined;
    inFlightSessionRef.current = undefined;
    pollSessionRef.current += 1;
    if (isMountedRef.current) {
      setManualRefreshing(false);
      setCountdown(0);
    }
  }, []);

  const resetPollingState = useCallback(() => {
    pollCountRef.current = 0;
    errorCountRef.current = 0;
    if (isMountedRef.current) {
      setPollCount(0);
      setConsecutiveErrorCount(0);
      setLastPolledAt('');
      setPollError('');
      setPollErrorDetail('');
      setPollTimeoutReached(false);
      setPollPausedByError(false);
    }
  }, []);

  const runPolling = useCallback(
    async (
      taskId: number,
      source: PollSource = 'auto',
      session: number = pollSessionRef.current,
    ) => {
      if (!isCurrentPollSession(taskId, session)) {
        return;
      }

      if (source === 'auto' && pollCountRef.current >= maxRetry) {
        const timeoutMessage = formatTimeoutMessage?.({ maxRetry }) ?? DEFAULT_TIMEOUT_MESSAGE;
        if (isMountedRef.current) {
          setPollTimeoutReached(true);
          setPollPausedByError(false);
          setPollError(timeoutMessage);
          setPollErrorDetail('');
        }
        onTimeout?.(timeoutMessage);
        stopPolling();
        return;
      }

      // 避免同一任务在同一轮询会话内并发触发多个请求，导致状态乱序或计数失真
      if (isRequestInFlight(taskId, session)) {
        return;
      }
      markRequestInFlight(taskId, session);

      if (source === 'manual' && isMountedRef.current) {
        setManualRefreshing(true);
        setCountdown(pollIntervalMs / 1000);
      }

      // 仅自动轮询计入重试次数，避免用户手动刷新过多导致自动追踪提前超时
      if (source === 'auto') {
        pollCountRef.current += 1;
        if (isMountedRef.current) {
          setPollCount(pollCountRef.current);
        }
      }

      try {
        const data = await fetchStatus(taskId);
        if (!isCurrentPollSession(taskId, session)) {
          return;
        }

        if (isMountedRef.current) {
          setLastPolledAt(getLastPolledAt());
        }

        if (!data) {
          const emptyPayload = formatEmptyMessage?.() ?? { message: DEFAULT_EMPTY_MESSAGE };
          if (isMountedRef.current) {
            setPollError(emptyPayload.message);
            setPollErrorDetail(emptyPayload.detail ?? '');
          }
          onEmpty?.(emptyPayload);
          return;
        }

        errorCountRef.current = 0;
        if (isMountedRef.current) {
          setConsecutiveErrorCount(0);
          setPollPausedByError(false);
          setPollError('');
          setPollErrorDetail('');
        }

        onData(data, source);

        if (isTerminalStatus(data)) {
          stopPolling();
          onTerminal?.(data);
        }
      } catch (error: unknown) {
        if (!isCurrentPollSession(taskId, session)) {
          return;
        }

        errorCountRef.current += 1;
        const paused = errorCountRef.current >= maxConsecutiveErrors;

        if (isMountedRef.current) {
          setConsecutiveErrorCount(errorCountRef.current);
          setLastPolledAt(getLastPolledAt());
        }

        const errorPayload = formatErrorMessage(error, {
          consecutiveErrorCount: errorCountRef.current,
          maxConsecutiveErrors,
          paused,
        });

        if (isMountedRef.current) {
          setPollError(errorPayload.message);
          setPollErrorDetail(errorPayload.detail ?? '');
        }

        if (paused) {
          if (isMountedRef.current) {
            setPollPausedByError(true);
            setPollTimeoutReached(false);
          }
          stopPolling();
        }

        onError?.({
          ...errorPayload,
          paused,
          consecutiveErrorCount: errorCountRef.current,
        });
      } finally {
        clearRequestInFlight(taskId, session);
        if (source === 'manual' && isCurrentPollSession(taskId, session) && isMountedRef.current) {
          setManualRefreshing(false);
        }
      }
    },
    [
      clearRequestInFlight,
      fetchStatus,
      formatEmptyMessage,
      formatErrorMessage,
      formatTimeoutMessage,
      getLastPolledAt,
      isCurrentPollSession,
      isRequestInFlight,
      isTerminalStatus,
      markRequestInFlight,
      maxConsecutiveErrors,
      maxRetry,
      onData,
      onEmpty,
      onError,
      onTerminal,
      onTimeout,
      pollIntervalMs,
      stopPolling,
    ],
  );

  const startPolling = useCallback(
    (taskId: number) => {
      stopPolling();
      resetPollingState();

      activeTaskIdRef.current = taskId;
      pollSessionRef.current += 1;
      const session = pollSessionRef.current;

      if (isMountedRef.current) {
        setCountdown(pollIntervalMs / 1000);
      }

      void runPolling(taskId, 'auto', session);

      timerRef.current = setInterval(() => {
        if (isMountedRef.current) {
          setCountdown(pollIntervalMs / 1000);
        }
        void runPolling(taskId, 'auto', session);
      }, pollIntervalMs);

      countdownTimerRef.current = setInterval(() => {
        if (isMountedRef.current) {
          setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
        }
      }, 1000);
    },
    [pollIntervalMs, resetPollingState, runPolling, stopPolling],
  );

  const pollNow = useCallback(
    (taskId?: number) => {
      const nextTaskId = taskId ?? activeTaskIdRef.current;
      const session = pollSessionRef.current;
      if (!nextTaskId || manualRefreshing || isRequestInFlight(nextTaskId, session)) {
        return;
      }
      void runPolling(nextTaskId, 'manual', session);
    },
    [isRequestInFlight, manualRefreshing, runPolling],
  );

  const retryAutoPolling = useCallback(
    (taskId?: number): boolean => {
      const nextTaskId = taskId ?? activeTaskIdRef.current;
      if (!nextTaskId || manualRefreshing) {
        return false;
      }
      if (!pollTimeoutReached && !pollPausedByError) {
        return false;
      }

      const reason: ResumeReason = pollTimeoutReached ? 'timeout' : 'error';

      if (isMountedRef.current) {
        setPollError('');
        setPollErrorDetail('');
        setConsecutiveErrorCount(0);
        setPollPausedByError(false);
        setPollTimeoutReached(false);
      }

      onResume?.({ reason });
      startPolling(nextTaskId);
      return true;
    },
    [manualRefreshing, onResume, pollPausedByError, pollTimeoutReached, startPolling],
  );

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }
    };
  }, []);

  return {
    countdown,
    pollCount,
    pollError,
    pollErrorDetail,
    lastPolledAt,
    manualRefreshing,
    pollTimeoutReached,
    pollPausedByError,
    consecutiveErrorCount,
    activeTaskId: activeTaskIdRef.current,
    canResumeAutoPolling: pollTimeoutReached || pollPausedByError,
    startPolling,
    stopPolling,
    resetPollingState,
    pollNow,
    retryAutoPolling,
  };
}
