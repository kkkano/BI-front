import { Alert, Button, Progress, Result, Space, Tag, Typography } from 'antd';
import React from 'react';
import { getAutoRefreshDisplay } from '../pollingDisplay';

type TaskProgressPanelProps = {
  statusText: string;
  progressPercent: number;
  progressStatus: 'active' | 'success' | 'exception';
  countdown: number;
  manualRefreshing: boolean;
  isTerminalStatus: boolean;
  taskPhaseText: string;
  pollTimeoutReached: boolean;
  pollPausedByError: boolean;
  pollCount: number;
  maxRetry: number;
  hintText: string;
  pollError?: string;
  pollErrorDetail?: string;
  consecutiveErrorCount: number;
  maxConsecutiveErrors: number;
  lastPolledAt?: string;
  onManualRefresh: () => void;
  onRetryAutoPolling: () => void;
};

const TaskProgressPanel: React.FC<TaskProgressPanelProps> = ({
  statusText,
  progressPercent,
  progressStatus,
  countdown,
  manualRefreshing,
  isTerminalStatus,
  taskPhaseText,
  pollTimeoutReached,
  pollPausedByError,
  pollCount,
  maxRetry,
  hintText,
  pollError,
  pollErrorDetail,
  consecutiveErrorCount,
  maxConsecutiveErrors,
  lastPolledAt,
  onManualRefresh,
  onRetryAutoPolling,
}) => {
  const shouldShowRetry = pollTimeoutReached || pollPausedByError;
  const retryButtonText = pollTimeoutReached ? '重试自动追踪' : '恢复自动追踪';

  const actionHint = pollTimeoutReached
    ? '自动追踪已暂停，点击“重试自动追踪”可恢复每 30 秒自动刷新。'
    : pollPausedByError
      ? '自动追踪已因连续查询失败而暂停，点击“恢复自动追踪”后系统会继续自动刷新。'
      : pollError
        ? '可先点击“立即刷新”确认最新状态，再决定是否继续等待。'
        : '系统会继续自动刷新，你也可以随时手动刷新查看最新进度。';

  const autoRefreshDisplay = getAutoRefreshDisplay({
    isTerminalStatus,
    countdown,
    manualRefreshing,
    pollTimeoutReached,
    pollPausedByError,
  });

  return (
    <Result
      status="info"
      title={statusText}
      subTitle={pollError ? '状态查询遇到问题，请参考下方提示处理' : hintText}
      extra={
        <Space direction="vertical" size={8} style={{ width: 420, maxWidth: '100%' }}>
          <Progress
            percent={progressPercent}
            status={progressStatus}
            format={() => `${progressPercent}%`}
          />
          <Space wrap>
            <Button
              onClick={onManualRefresh}
              loading={manualRefreshing}
              disabled={isTerminalStatus || manualRefreshing}
            >
              立即刷新
            </Button>
            {shouldShowRetry ? (
              <Button
                type="primary"
                onClick={onRetryAutoPolling}
                disabled={isTerminalStatus || manualRefreshing}
              >
                {retryButtonText}
              </Button>
            ) : null}
            {autoRefreshDisplay ? (
              <Tag color={autoRefreshDisplay.tagColor}>
                {autoRefreshDisplay.tagPrefix}：{autoRefreshDisplay.tagValue}
              </Tag>
            ) : null}
            <Tag color="processing">
              已查询：{pollCount}/{maxRetry}
            </Tag>
            <Tag color="geekblue">当前阶段：{taskPhaseText}</Tag>
            {pollError && consecutiveErrorCount > 0 ? (
              <Tag color={pollPausedByError ? 'error' : 'warning'}>
                连续失败：{consecutiveErrorCount}/{maxConsecutiveErrors}
              </Tag>
            ) : null}
            {lastPolledAt ? <Tag>最近查询：{lastPolledAt}</Tag> : null}
          </Space>
          <Alert
            showIcon
            type={pollError || pollTimeoutReached ? 'warning' : 'info'}
            message={pollError || hintText}
            description={
              <Space direction="vertical" size={2} style={{ width: '100%' }}>
                <span>{actionHint}</span>
                {pollErrorDetail ? (
                  <Typography.Paragraph
                    type="secondary"
                    copyable
                    ellipsis={{ rows: 2, expandable: true, symbol: '展开异常详情' }}
                    style={{ marginBottom: 0 }}
                  >
                    {pollErrorDetail}
                  </Typography.Paragraph>
                ) : null}
              </Space>
            }
          />
        </Space>
      }
    />
  );
};

export default TaskProgressPanel;
