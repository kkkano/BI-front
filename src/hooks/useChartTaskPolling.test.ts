import { act, renderHook } from '@testing-library/react';

import { useChartTaskPolling } from './useChartTaskPolling';

type MockTaskStatus = {
  status: string;
};

const flushPromises = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

describe('useChartTaskPolling', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('should not count manual refresh toward auto polling retry count', async () => {
    const fetchStatus = jest.fn<Promise<MockTaskStatus>, [number]>().mockResolvedValue({
      status: 'running',
    });

    const { result, unmount } = renderHook(() =>
      useChartTaskPolling<MockTaskStatus>({
        pollIntervalMs: 1000,
        maxRetry: 5,
        maxConsecutiveErrors: 3,
        fetchStatus,
        isTerminalStatus: () => false,
        onData: jest.fn(),
        formatErrorMessage: () => ({ message: 'error' }),
      }),
    );

    act(() => {
      result.current.startPolling(1001);
    });
    await flushPromises();

    expect(fetchStatus).toHaveBeenCalledTimes(1);
    expect(result.current.pollCount).toBe(1);

    act(() => {
      result.current.pollNow(1001);
    });
    await flushPromises();

    expect(fetchStatus).toHaveBeenCalledTimes(2);
    expect(result.current.pollCount).toBe(1);

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    await flushPromises();

    expect(fetchStatus).toHaveBeenCalledTimes(3);
    expect(result.current.pollCount).toBe(2);

    act(() => {
      result.current.stopPolling();
    });
    unmount();
  });
});
