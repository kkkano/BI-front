import { useChartTaskPolling } from '@/hooks/useChartTaskPolling';
import {
  genChartByAiAsyncMqUsingPOST,
  getChartTaskStatusUsingGET,
} from '@/services/yubi/chartController';
import {
  CHART_UPLOAD_FILE_ACCEPT,
  getErrorMessage,
  getUploadFile,
  hasUsableOption,
  parseChartOption,
  validateChartUploadFile,
  type UploadFieldValue,
} from '@/utils/chart';
import { UploadOutlined } from '@ant-design/icons';
import { history } from '@umijs/max';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Divider,
  Form,
  Input,
  message,
  Result,
  Select,
  Space,
  Steps,
  Tag,
  Typography,
  Upload,
} from 'antd';
import type { UploadProps } from 'antd';
import { useForm } from 'antd/es/form/Form';
import TextArea from 'antd/es/input/TextArea';
import type { EChartsOption } from 'echarts';
import React, { useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import {
  buildFailureHint,
  getFailureDetailText,
  getFailureReasonSummary,
  getTaskStatusText,
} from '../AddChartAsync/statusCopy';
import TaskProgressPanel from './components/TaskProgressPanel';

type TaskEvent = {
  status: string;
  text: string;
  at: string;
};

type TaskStatus = 'wait' | 'running' | 'succeed' | 'failed';

type AgentStepStatus = 'wait' | 'process' | 'finish' | 'error';

type AddChartFormValues = {
  goal: string;
  name?: string;
  chartType?: string;
  file?: UploadFieldValue;
};

const EVENT_TAG_COLOR: Record<string, string> = {
  submitted: 'blue',
  retry: 'cyan',
  wait: 'default',
  running: 'processing',
  succeed: 'success',
  failed: 'error',
  warning: 'warning',
  timeout: 'warning',
  error: 'error',
  empty: 'warning',
};

const EVENT_TAG_LABEL: Record<string, string> = {
  submitted: '已提交',
  retry: '恢复追踪',
  wait: '排队中',
  running: '执行中',
  succeed: '已完成',
  failed: '执行失败',
  warning: '查询告警',
  timeout: '追踪超时',
  error: '查询失败',
  empty: '返回为空',
};

const isTerminalTaskStatus = (
  status?: string,
): status is Extract<TaskStatus, 'succeed' | 'failed'> =>
  status === 'succeed' || status === 'failed';

const getReadableEventText = (
  status?: string,
  execMessage?: string,
  failureReason?: string,
): string => {
  if (status === 'failed') {
    return buildFailureHint(failureReason || execMessage);
  }
  if (status === 'succeed') {
    return execMessage || '图表分析完成，可查看结论与可视化结果';
  }
  if (status === 'running') {
    return execMessage || '任务执行中，正在生成图表和分析结论';
  }
  if (status === 'wait') {
    return execMessage || '任务排队中，等待可用计算资源';
  }
  return execMessage || getTaskStatusText(status);
};

const getReadableError = (error: unknown): string => {
  const rawMessage = getErrorMessage(error);
  return getFailureReasonSummary(rawMessage) || rawMessage;
};

const getPollErrorHint = (messageText: string): string => {
  const normalized = messageText.toLowerCase();

  if (
    normalized.includes('network') ||
    normalized.includes('fetch') ||
    normalized.includes('timeout') ||
    normalized.includes('timed out') ||
    normalized.includes('econn')
  ) {
    return '网络连接异常，建议检查网络后重试';
  }

  if (
    normalized.includes('401') ||
    normalized.includes('403') ||
    normalized.includes('unauthorized') ||
    normalized.includes('forbidden')
  ) {
    return '登录状态可能已失效，请重新登录后再试';
  }

  if (
    normalized.includes('500') ||
    normalized.includes('502') ||
    normalized.includes('503') ||
    normalized.includes('504') ||
    normalized.includes('server')
  ) {
    return '服务端暂时不可用，建议稍后重试';
  }

  return '状态查询异常，请先手动刷新确认任务状态';
};

const getMetaText = (value?: string): string => {
  if (!value) {
    return '-';
  }
  const trimmedValue = value.trim();
  return trimmedValue || '-';
};

const formatDateTime = (value?: string): string => {
  if (!value) {
    return '-';
  }
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }
  return parsedDate.toLocaleString('zh-CN', { hour12: false });
};

/**
 * 添加图表(异步 MQ)页面 + Agent式进度追踪
 * 轮询策略：30秒一次，最多30次；连续失败达到10次才判定追踪失败
 */
const AddChartAsync: React.FC = () => {
  const [form] = useForm();
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [chartId, setChartId] = useState<number>();
  const [chartDetail, setChartDetail] = useState<API.ChartTaskStatusVO>();
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [lastSubmitValues, setLastSubmitValues] = useState<AddChartFormValues>();

  const POLL_INTERVAL_MS = 30 * 1000;
  const MAX_RETRY = 30;
  const MAX_CONSECUTIVE_ERRORS = 10;

  const statusText = useMemo(() => {
    if (chartDetail?.status) {
      return getTaskStatusText(chartDetail.status);
    }
    if (chartId) {
      return '任务已提交（等待状态回传）';
    }
    return getTaskStatusText(undefined);
  }, [chartDetail?.status, chartId]);

  const isTerminalStatus = isTerminalTaskStatus(chartDetail?.status);

  const addEvent = (status: string, text: string) => {
    setEvents((prev) => {
      if (
        prev.length > 0 &&
        prev[prev.length - 1].status === status &&
        prev[prev.length - 1].text === text
      ) {
        return prev;
      }
      return [
        ...prev,
        {
          status,
          text,
          at: new Date().toLocaleString('zh-CN', { hour12: false }),
        },
      ];
    });
  };

  const {
    countdown,
    pollCount,
    pollError,
    pollErrorDetail,
    lastPolledAt,
    manualRefreshing,
    pollTimeoutReached,
    pollPausedByError,
    consecutiveErrorCount,
    startPolling,
    stopPolling,
    resetPollingState,
    pollNow,
    retryAutoPolling,
  } = useChartTaskPolling<API.ChartTaskStatusVO>({
    pollIntervalMs: POLL_INTERVAL_MS,
    maxRetry: MAX_RETRY,
    maxConsecutiveErrors: MAX_CONSECUTIVE_ERRORS,
    fetchStatus: async (id) => {
      const res = await getChartTaskStatusUsingGET({ chartId: id });
      return res?.data;
    },
    isTerminalStatus: (data) => isTerminalTaskStatus(data.status),
    onData: (data) => {
      setChartDetail(data);

      if (data.status) {
        addEvent(
          data.status,
          getReadableEventText(data.status, data.execMessage, data.failureReason),
        );
      }
    },
    onTerminal: (data) => {
      if (data.status === 'succeed') {
        message.success('图表分析完成，可前往“我的图表”查看');
      }
    },
    formatEmptyMessage: () => ({
      message: '状态查询成功，但未返回任务详情，请稍后重试',
      detail: '接口返回 data 为空，任务可能仍在排队中。建议等待 10-30 秒后再查询',
    }),
    formatTimeoutMessage: () =>
      '自动追踪超时：已达到最大查询次数。你可以重试自动追踪，或稍后在“我的图表”查看最终结果',
    formatErrorMessage: (error, context) => {
      const rawError = getErrorMessage(error);
      const readableError = getReadableError(error);
      const pollErrorHint = getPollErrorHint(rawError);

      const errorMessage = context.paused
        ? `状态查询连续失败 ${context.consecutiveErrorCount} 次，已暂停自动追踪`
        : `状态查询失败（连续 ${context.consecutiveErrorCount}/${context.maxConsecutiveErrors} 次）：${pollErrorHint}`;

      const detail =
        readableError === rawError
          ? `异常原因：${readableError}`
          : `异常原因：${readableError}\n原始错误：${rawError}`;

      return {
        message: errorMessage,
        detail,
      };
    },
    onTimeout: (timeoutMessage) => {
      addEvent('timeout', timeoutMessage);
      message.warning(timeoutMessage);
    },
    onEmpty: ({ message: emptyMessage }) => {
      addEvent('empty', emptyMessage);
    },
    onError: ({ message: errorMessage, paused }) => {
      addEvent(paused ? 'error' : 'warning', errorMessage);
      if (paused) {
        message.error(errorMessage);
      }
    },
    onResume: ({ reason }) => {
      const retryText =
        reason === 'timeout'
          ? '已重试自动追踪，系统将继续每 30 秒刷新状态'
          : '已恢复自动追踪，系统将继续每 30 秒刷新状态';
      addEvent('retry', retryText);
      message.success(retryText);
    },
  });

  const hintText = useMemo(() => {
    if (!chartId) return '提交任务后，系统会自动追踪分析进度';
    if (pollTimeoutReached)
      return '自动追踪已超时。你可以点击“重试自动追踪”继续获取结果，或前往“我的图表”稍后查看';
    if (pollPausedByError)
      return '自动追踪已暂停：状态查询连续失败。建议先手动刷新一次，确认网络稳定后再恢复自动追踪';
    if (pollError) return pollError;
    if (chartDetail?.status === 'wait') return '任务已入队，系统正在等待可用计算资源';
    if (chartDetail?.status === 'running') return '任务执行中，可随时点击“立即刷新”获取最新进度';
    if (chartDetail?.status === 'succeed') return '图表已生成完成，建议前往“我的图表”查看详情';
    if (chartDetail?.status === 'failed')
      return buildFailureHint(chartDetail.failureReason || chartDetail.execMessage);
    return '系统正在处理中，请稍候';
  }, [
    chartDetail?.execMessage,
    chartDetail?.failureReason,
    chartDetail?.status,
    chartId,
    pollError,
    pollPausedByError,
    pollTimeoutReached,
  ]);

  const stageItems = useMemo(() => {
    const status = chartDetail?.status;
    const failureSummary =
      status === 'failed'
        ? getFailureReasonSummary(chartDetail?.failureReason || chartDetail?.execMessage)
        : '';

    const submitStatus: AgentStepStatus = chartId ? 'finish' : submitting ? 'process' : 'wait';
    const queueStatus: AgentStepStatus = !chartId
      ? 'wait'
      : status === 'wait'
        ? 'process'
        : status
          ? 'finish'
          : 'process';
    const analyzeStatus: AgentStepStatus = !chartId
      ? 'wait'
      : status === 'running'
        ? 'process'
        : status === 'succeed' || status === 'failed'
          ? 'finish'
          : 'wait';
    const deliverStatus: AgentStepStatus = !chartId
      ? 'wait'
      : status === 'succeed'
        ? 'finish'
        : status === 'failed'
          ? 'error'
          : pollPausedByError || pollTimeoutReached
            ? 'process'
            : 'wait';

    return [
      {
        title: '提交任务',
        status: submitStatus,
        description: chartId
          ? `任务 #${chartId} 已创建`
          : submitting
            ? '正在提交任务'
            : '等待提交分析任务',
      },
      {
        title: '排队调度',
        status: queueStatus,
        description: !chartId ? '未进入队列' : status === 'wait' ? '等待可用计算资源' : '调度完成',
      },
      {
        title: '执行分析',
        status: analyzeStatus,
        description:
          status === 'running'
            ? 'AI 正在生成图表与结论'
            : status === 'succeed' || status === 'failed'
              ? '分析阶段已结束'
              : '等待进入执行阶段',
      },
      {
        title: '结果回传',
        status: deliverStatus,
        description:
          status === 'succeed'
            ? '结果已返回，可查看图表'
            : status === 'failed'
              ? failureSummary || '分析失败，请查看失败原因'
              : pollPausedByError || pollTimeoutReached
                ? '回传受阻，可手动恢复追踪'
                : '等待执行结果',
      },
    ];
  }, [
    chartDetail?.execMessage,
    chartDetail?.failureReason,
    chartDetail?.status,
    chartId,
    pollPausedByError,
    pollTimeoutReached,
    submitting,
  ]);

  const progressPercent = useMemo(() => {
    const status = chartDetail?.status;
    if (status === 'succeed' || status === 'failed') return 100;
    if (status === 'running') return 60;
    if (status === 'wait') return 20;
    if (!chartId) return 0;
    const base = Math.min((pollCount / MAX_RETRY) * 80, 80);
    return Math.round(base);
  }, [chartDetail?.status, chartId, pollCount]);

  const progressStatus = useMemo(() => {
    if (chartDetail?.status === 'failed') return 'exception';
    if (chartDetail?.status === 'succeed') return 'success';
    return 'active';
  }, [chartDetail?.status]);

  const beforeUpload: UploadProps['beforeUpload'] = (file) => {
    const validationMessage = validateChartUploadFile(file);
    if (validationMessage) {
      message.error(validationMessage);
      return Upload.LIST_IGNORE;
    }
    return false;
  };

  const onRetryAutoPolling = () => {
    if (!chartId || isTerminalStatus || manualRefreshing) return;
    retryAutoPolling(chartId);
  };

  const onFinish = async (values: AddChartFormValues) => {
    if (submitting) return;

    setLastSubmitValues(values);
    setSubmitting(true);
    setChartId(undefined);
    setChartDetail(undefined);
    setEvents([]);
    stopPolling();
    resetPollingState();

    const params: API.genChartByAiAsyncMqUsingPOSTParams = {
      goal: values.goal,
      name: values.name,
      chartType: values.chartType,
    };

    try {
      const originFile = getUploadFile(values.file);
      const validationMessage = validateChartUploadFile(originFile);
      if (validationMessage) {
        message.error(validationMessage);
        return;
      }

      const res = await genChartByAiAsyncMqUsingPOST(params, {}, originFile);
      const biResponse = res?.data;
      if (!biResponse?.chartId) {
        message.error('分析任务提交失败');
        return;
      }

      const id = biResponse.chartId;
      const initialStatus = biResponse.status || 'wait';
      setChartId(id);
      setChartDetail({
        chartId: id,
        name: biResponse.name,
        goal: biResponse.goal,
        chartType: biResponse.chartType,
        status: initialStatus,
        taskPhase: biResponse.taskPhase,
        traceId: biResponse.traceId,
        failureCode: biResponse.failureCode,
        failureReason: biResponse.failureReason,
        failureTime: biResponse.failureTime,
        execMessage: biResponse.execMessage,
        createTime: biResponse.createTime,
        updateTime: biResponse.updateTime,
      });
      addEvent('submitted', `任务 #${id} 已提交，系统已开启自动追踪（每 30 秒刷新）`);
      if (biResponse.execMessage) {
        addEvent(initialStatus, biResponse.execMessage);
      }
      message.success(`分析任务提交成功（#${id}），正在自动追踪状态`);
      form.resetFields();
      startPolling(id);
    } catch (error: unknown) {
      message.error('分析失败，' + buildFailureHint(getErrorMessage(error)));
    } finally {
      setSubmitting(false);
    }
  };

  const onRetryLastSubmit = () => {
    if (!lastSubmitValues || submitting) return;
    onFinish(lastSubmitValues);
  };

  const onManualRefresh = () => {
    if (!chartId || manualRefreshing) {
      return;
    }
    pollNow(chartId);
  };

  const renderResult = () => {
    if (!chartDetail || chartDetail.status === 'wait' || chartDetail.status === 'running') {
      return (
        <TaskProgressPanel
          statusText={statusText}
          progressPercent={
            !chartDetail ? Math.max(progressPercent, chartId ? 5 : 0) : progressPercent
          }
          progressStatus={progressStatus}
          countdown={countdown}
          manualRefreshing={manualRefreshing}
          isTerminalStatus={!!chartDetail && isTerminalStatus}
          pollTimeoutReached={pollTimeoutReached}
          pollPausedByError={pollPausedByError}
          pollCount={pollCount}
          maxRetry={MAX_RETRY}
          hintText={hintText}
          pollError={pollError}
          pollErrorDetail={pollErrorDetail}
          consecutiveErrorCount={consecutiveErrorCount}
          maxConsecutiveErrors={MAX_CONSECUTIVE_ERRORS}
          lastPolledAt={lastPolledAt}
          onManualRefresh={onManualRefresh}
          onRetryAutoPolling={onRetryAutoPolling}
        />
      );
    }

    if (chartDetail.status === 'failed') {
      const failureMessage = chartDetail.failureReason || chartDetail.execMessage;
      const failureSummary = getFailureReasonSummary(failureMessage);
      const failureDetail = getFailureDetailText(failureMessage);

      return (
        <Result
          status="error"
          title={statusText}
          subTitle="任务已结束，请根据失败摘要修正后重新提交"
          extra={
            <Space direction="vertical" size={12} style={{ width: 520, maxWidth: '100%' }}>
              <Alert
                type="error"
                showIcon
                message={
                  failureSummary ? `失败摘要：${failureSummary}` : buildFailureHint(failureMessage)
                }
              />
              <Card type="inner" size="small" title="执行追踪信息">
                <Descriptions size="small" bordered column={1}>
                  <Descriptions.Item label="任务阶段">
                    {getMetaText(chartDetail.taskPhase)}
                  </Descriptions.Item>
                  <Descriptions.Item label="追踪 ID">
                    {getMetaText(chartDetail.traceId)}
                  </Descriptions.Item>
                  <Descriptions.Item label="失败代码">
                    {getMetaText(chartDetail.failureCode)}
                  </Descriptions.Item>
                  <Descriptions.Item label="失败时间">
                    {formatDateTime(chartDetail.failureTime)}
                  </Descriptions.Item>
                </Descriptions>
              </Card>
              {failureDetail ? (
                <Typography.Paragraph
                  copyable
                  ellipsis={{ rows: 2, expandable: true, symbol: '展开详情' }}
                >
                  {failureDetail}
                </Typography.Paragraph>
              ) : null}
              <Space wrap>
                {lastSubmitValues ? (
                  <Button type="primary" loading={submitting} onClick={onRetryLastSubmit}>
                    一键重试上次参数
                  </Button>
                ) : null}
                <Button onClick={() => history.push('/my_chart')}>去我的图表查看</Button>
              </Space>
            </Space>
          }
        />
      );
    }

    const option = parseChartOption<EChartsOption>(chartDetail.genChart);

    return (
      <>
        <Descriptions bordered column={1} size="small" style={{ marginBottom: 16 }}>
          <Descriptions.Item label="任务ID">{chartDetail.chartId}</Descriptions.Item>
          {chartDetail.name && (
            <Descriptions.Item label="图表名称">{chartDetail.name}</Descriptions.Item>
          )}
          {chartDetail.goal && (
            <Descriptions.Item label="分析目标">{chartDetail.goal}</Descriptions.Item>
          )}
          {chartDetail.chartType && (
            <Descriptions.Item label="图表类型">{chartDetail.chartType}</Descriptions.Item>
          )}
          <Descriptions.Item label="任务阶段">
            {getMetaText(chartDetail.taskPhase)}
          </Descriptions.Item>
          <Descriptions.Item label="追踪 ID">{getMetaText(chartDetail.traceId)}</Descriptions.Item>
          <Descriptions.Item label="状态">{statusText}</Descriptions.Item>
        </Descriptions>
        <Card type="inner" title="分析结论" style={{ marginBottom: 16 }}>
          {chartDetail.genResult || '暂无'}
        </Card>
        <Card type="inner" title="可视化结果">
          {hasUsableOption(option) ? (
            <ReactECharts option={option} />
          ) : (
            <Alert
              type="warning"
              showIcon
              message="图表配置解析失败，请前往“我的图表”查看原始结果"
            />
          )}
        </Card>
      </>
    );
  };

  const timelineItems = events.map((event) => ({
    title: (
      <Space>
        <Tag color={EVENT_TAG_COLOR[event.status] || 'default'}>
          {EVENT_TAG_LABEL[event.status] || event.status}
        </Tag>
        <Typography.Text ellipsis={{ tooltip: event.text }} style={{ maxWidth: 520 }}>
          {event.text}
        </Typography.Text>
      </Space>
    ),
    description: event.at,
  }));

  return (
    <div className="add-chart-async">
      <Card title="智能分析（异步 MQ）" extra={chartId ? `当前任务 #${chartId}` : undefined}>
        <Form
          form={form}
          name="addChart"
          labelAlign="left"
          labelCol={{ span: 4 }}
          wrapperCol={{ span: 16 }}
          onFinish={onFinish}
          initialValues={{}}
        >
          <Form.Item
            name="goal"
            label="分析目标"
            rules={[{ required: true, message: '请输入分析目标!' }]}
          >
            <TextArea placeholder="请输入你的分析需求，比如：分析网站用户的增长情况（每次消耗1积分）" />
          </Form.Item>

          <Form.Item name="name" label="图表名称">
            <Input placeholder="请输入图表名称" />
          </Form.Item>

          <Form.Item name="chartType" label="图表类型">
            <Select
              options={[
                { value: '折线图', label: '折线图' },
                { value: '柱状图', label: '柱状图' },
                { value: '堆叠图', label: '堆叠图' },
                { value: '饼图', label: '饼图' },
                { value: '雷达图', label: '雷达图' },
              ]}
            />
          </Form.Item>

          <Form.Item
            name="file"
            label="原始数据"
            rules={[{ required: true, message: '请上传数据文件（xlsx / xls / csv）' }]}
          >
            <Upload
              name="file"
              maxCount={1}
              accept={CHART_UPLOAD_FILE_ACCEPT}
              beforeUpload={beforeUpload}
            >
              <Button icon={<UploadOutlined />}>上传文件（后缀 .xlsx / .xls / .csv）</Button>
            </Upload>
          </Form.Item>
          <Form.Item wrapperCol={{ span: 16, offset: 4 }}>
            <Space>
              <Button type="primary" htmlType="submit" loading={submitting} disabled={submitting}>
                提交并追踪
              </Button>
              <Button htmlType="reset">重置</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      <Card style={{ marginTop: 16 }} title="任务轨迹（Agent Timeline）">
        {chartId ? (
          <Alert
            type={pollError ? 'warning' : 'info'}
            showIcon
            style={{ marginBottom: 12 }}
            message={`任务 #${chartId} · 当前状态：${statusText}`}
            description={`轮询进度 ${pollCount}/${MAX_RETRY}${!isTerminalStatus ? `，预计 ${countdown}s 后自动刷新` : ''}${lastPolledAt ? `，最近查询 ${lastPolledAt}` : ''}`}
          />
        ) : null}
        <Steps size="small" responsive items={stageItems} style={{ marginBottom: 12 }} />
        {events.length === 0 ? (
          <Alert type="info" showIcon message="任务开始后会自动记录执行轨迹" />
        ) : (
          <Steps direction="vertical" items={timelineItems} />
        )}
        <Divider style={{ margin: '12px 0' }} />
        {renderResult()}
      </Card>
    </div>
  );
};

export default AddChartAsync;
