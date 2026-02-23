import { Alert, Button, Progress, Result, Space, Tag } from 'antd';
import React from 'react';

type TaskProgressPanelProps = {
  statusText: string;
  progressPercent: number;
  progressStatus: 'active' | 'success' | 'exception';
  countdown: number;
  manualRefreshing: boolean;
  isTerminalStatus: boolean;
  pollTimeoutReached: boolean;
  pollCount: number;
  maxRetry: number;
  hintText: string;
  pollError?: string;
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
  pollTimeoutReached,
  pollCount,
  maxRetry,
  hintText,
  pollError,
  lastPolledAt,
  onManualRefresh,
  onRetryAutoPolling,
}) => {
  const actionHint = pollTimeoutReached
    ? '自动追踪已暂停，点击“重试自动追踪”可恢复每 30 秒自动刷新。'
    : pollError
      ? '可先点击“立即刷新”确认最新状态，再决定是否继续等待。'
      : '系统会继续自动刷新，你也可以随时手动刷新查看最新进度。';

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
            {pollTimeoutReached ? (
              <Button
                type="primary"
                onClick={onRetryAutoPolling}
                disabled={isTerminalStatus || manualRefreshing}
              >
                重试自动追踪
              </Button>
            ) : null}
            {!isTerminalStatus ? (
              <Tag color={countdown <= 3 ? 'orange' : 'blue'}>
                下次自动刷新：{manualRefreshing ? '同步中...' : `${countdown}s`}
              </Tag>
            ) : null}
            <Tag color="processing">
              已查询：{pollCount}/{maxRetry}
            </Tag>
            {lastPolledAt ? <Tag>最近查询：{lastPolledAt}</Tag> : null}
          </Space>
          <Alert
            showIcon
            type={pollError || pollTimeoutReached ? 'warning' : 'info'}
            message={pollError || hintText}
            description={actionHint}
          />
        </Space>
      }
    />
  );
};

export default TaskProgressPanel;
