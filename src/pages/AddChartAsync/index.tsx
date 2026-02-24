import { useChartTaskPolling } from '@/hooks/useChartTaskPolling';
import {
  genChartByAiAsyncUsingPOST,
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
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Divider,
  Form,
  Input,
  message,
  Progress,
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
import { history } from '@umijs/max';
import {
  buildFailureHint,
  getFailureDetailText,
  getFailureReasonSummary,
  getTaskStatusText,
} from './statusCopy';

type TaskEvent = {
  status: string;
  text: string;
  at: string;
};

type TaskStatus = 'idle' | 'wait' | 'running' | 'succeed' | 'failed';

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

const TASK_PHASE_LABELS: Record<API.ChartTaskPhaseEnum, string> = {
  created: '任务已创建',
  status_running_updated: '状态更新为执行中',
  ai_generating: 'AI 正在生成结果',
  ai_result_parsed: 'AI 结果解析完成',
  result_persisting: '正在持久化分析结果',
  result_succeed_updated: '状态更新为成功',
  finished: '任务处理完成',
  failed: '任务执行失败',
};

const getTaskPhaseText = (taskPhase?: API.ChartTaskPhaseEnum): string => {
  if (!taskPhase) return '待开始';
  return TASK_PHASE_LABELS[taskPhase] || taskPhase;
};

const isTerminalTaskStatus = (
  status?: string,
): status is Extract<TaskStatus, 'succeed' | 'failed'> =>
  status === 'succeed' || status === 'failed';

const toTaskStatus = (status?: string): TaskStatus => {
  if (status === 'wait' || status === 'running' || status === 'succeed' || status === 'failed') {
    return status;
  }
  return 'running';
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
 * 添加图表（异步 线程池）页面
 * 优化点：
 * 1）轮询倒计时更稳定（支持手动刷新后重置）
 * 2）状态提示更明确（排队/执行/失败原因/下一步建议）
 * 3）失败保护更完善（最大轮询次数 + 连续查询失败上限）
 */
const AddChartAsync: React.FC = () => {
  const [form] = useForm();
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [chartId, setChartId] = useState<number>();
  const [chartDetail, setChartDetail] = useState<API.ChartTaskStatusVO>();
  const [status, setStatus] = useState<TaskStatus>('idle');
  const [execMessage, setExecMessage] = useState<string>('');
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [lastSubmitValues, setLastSubmitValues] = useState<AddChartFormValues>();

  const POLL_INTERVAL_MS = 15 * 1000;
  const MAX_RETRY = 40;
  const MAX_CONSECUTIVE_ERRORS = 5;

  const addEvent = (eventStatus: string, text: string) => {
    setEvents((prev) => {
      if (
        prev.length > 0 &&
        prev[prev.length - 1].status === eventStatus &&
        prev[prev.length - 1].text === text
      ) {
        return prev;
      }

      return [
        ...prev,
        {
          status: eventStatus,
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
      const nextStatus = toTaskStatus(data.status);
      const nextFailureMessage = data.failureReason || data.execMessage || '';
      const nextExecMessage = data.execMessage || '';

      setChartDetail(data);
      setStatus(nextStatus);
      setExecMessage(nextFailureMessage || nextExecMessage);

      if (data.status) {
        const eventText =
          data.status === 'failed'
            ? buildFailureHint(nextFailureMessage || nextExecMessage)
            : nextExecMessage || getTaskStatusText(data.status);
        addEvent(data.status, eventText);
      }
    },
    onTerminal: (data) => {
      if (data.status === 'succeed') {
        message.success('图表分析完成，可前往“我的图表”查看');
      }
    },
    formatEmptyMessage: () => ({
      message: '状态查询成功，但未返回任务详情，请稍后重试',
    }),
    formatTimeoutMessage: () =>
      '自动追踪超时：已达到最大查询次数。你可以重试自动追踪，或稍后在“我的图表”查看最终结果',
    formatErrorMessage: (error, context) => {
      const errMsg = getErrorMessage(error);
      if (context.paused) {
        return {
          message: '状态查询连续失败次数过多，已暂停自动追踪，请稍后手动刷新',
        };
      }
      return {
        message: `状态查询失败（连续 ${context.consecutiveErrorCount}/${context.maxConsecutiveErrors} 次）：${errMsg}`,
      };
    },
    onTimeout: (timeoutMessage) => {
      addEvent('timeout', timeoutMessage);
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
          ? '已重试自动追踪，请稍候查看最新状态'
          : '已恢复自动追踪，请稍候查看最新状态';
      addEvent('retry', retryText);
      message.success(retryText);
    },
  });

  const statusText = useMemo(() => getTaskStatusText(status), [status]);
  const taskPhaseText = useMemo(
    () => getTaskPhaseText(chartDetail?.taskPhase),
    [chartDetail?.taskPhase],
  );
  const isTerminalStatus = isTerminalTaskStatus(status);

  const progressPercent = useMemo(() => {
    if (status === 'succeed' || status === 'failed') return 100;
    if (status === 'running') return 65;
    if (status === 'wait') return 25;
    if (!chartId) return 0;
    return Math.min(Math.round((pollCount / MAX_RETRY) * 90), 90);
  }, [chartId, pollCount, status]);

  const hintText = useMemo(() => {
    if (!chartId) return '提交任务后，系统会自动追踪分析进度';
    if (pollTimeoutReached)
      return '自动追踪已超时。你可以点击“重试自动追踪”继续获取结果，或前往“我的图表”稍后查看';
    if (pollPausedByError)
      return '自动追踪已暂停：状态查询连续失败。建议先手动刷新一次，确认网络稳定后再恢复自动追踪';
    if (pollError) return pollError;
    if (status === 'wait') return '任务已入队，系统正在等待可用计算资源';
    if (status === 'running') return '任务执行中，可随时点击“立即刷新”获取最新进度';
    if (status === 'succeed') return '图表已生成完成，建议前往“我的图表”查看详情';
    if (status === 'failed') return buildFailureHint(chartDetail?.failureReason || execMessage);
    return '系统正在处理中，请稍候';
  }, [
    chartDetail?.failureReason,
    chartId,
    execMessage,
    pollError,
    pollPausedByError,
    pollTimeoutReached,
    status,
  ]);

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
    setStatus('idle');
    setExecMessage('');
    setEvents([]);
    stopPolling();
    resetPollingState();

    const params: API.genChartByAiAsyncUsingPOSTParams = {
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

      const res = await genChartByAiAsyncUsingPOST(params, {}, originFile);
      const biResponse = res?.data;
      const id = biResponse?.chartId;
      if (!id) {
        message.error('分析任务提交失败');
        return;
      }

      const initialStatus = toTaskStatus(biResponse?.status || 'wait');
      const initialFailureMessage = biResponse?.failureReason || biResponse?.execMessage || '';
      const initialExecMessage = biResponse?.execMessage || '';
      setChartId(id);
      setStatus(initialStatus);
      setExecMessage(initialFailureMessage || initialExecMessage);
      setChartDetail({
        chartId: id,
        name: biResponse?.name,
        goal: biResponse?.goal,
        chartType: biResponse?.chartType,
        status: biResponse?.status || 'wait',
        taskPhase: biResponse?.taskPhase,
        traceId: biResponse?.traceId,
        failureCode: biResponse?.failureCode,
        failureReason: biResponse?.failureReason,
        failureTime: biResponse?.failureTime,
        execMessage: biResponse?.execMessage,
        createTime: biResponse?.createTime,
        updateTime: biResponse?.updateTime,
      });
      addEvent('submitted', `任务 #${id} 已提交，系统正在自动追踪执行进度`);
      if (initialExecMessage) {
        addEvent(initialStatus, initialExecMessage);
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

  const renderResult = () => {
    if (status === 'succeed') {
      const option = parseChartOption<EChartsOption>(chartDetail?.genChart);

      return (
        <>
          <Descriptions bordered column={1} size="small" style={{ marginBottom: 16 }}>
            <Descriptions.Item label="任务ID">{chartDetail?.chartId || chartId}</Descriptions.Item>
            {chartDetail?.name ? (
              <Descriptions.Item label="图表名称">{chartDetail.name}</Descriptions.Item>
            ) : null}
            {chartDetail?.goal ? (
              <Descriptions.Item label="分析目标">{chartDetail.goal}</Descriptions.Item>
            ) : null}
            {chartDetail?.chartType ? (
              <Descriptions.Item label="图表类型">{chartDetail.chartType}</Descriptions.Item>
            ) : null}
            <Descriptions.Item label="状态">{statusText}</Descriptions.Item>
            <Descriptions.Item label="执行阶段">{taskPhaseText}</Descriptions.Item>
            <Descriptions.Item label="追踪 ID">
              {getMetaText(chartDetail?.traceId)}
            </Descriptions.Item>
            <Descriptions.Item label="最近更新时间">
              {formatDateTime(chartDetail?.updateTime)}
            </Descriptions.Item>
          </Descriptions>
          <Card type="inner" title="分析结论" style={{ marginBottom: 16 }}>
            {chartDetail?.genResult || '暂无'}
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
    }

    if (status === 'failed') {
      const failureMessage = chartDetail?.failureReason || execMessage;
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
                  <Descriptions.Item label="任务阶段">{taskPhaseText}</Descriptions.Item>
                  <Descriptions.Item label="追踪 ID">
                    {getMetaText(chartDetail?.traceId)}
                  </Descriptions.Item>
                  <Descriptions.Item label="失败代码">
                    {getMetaText(chartDetail?.failureCode)}
                  </Descriptions.Item>
                  <Descriptions.Item label="失败时间">
                    {formatDateTime(chartDetail?.failureTime)}
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

    return (
      <Result
        status="info"
        title={statusText}
        subTitle={execMessage || '系统正在处理中，请稍候'}
        extra={
          <Space direction="vertical" size={8} style={{ width: 420, maxWidth: '100%' }}>
            <Progress percent={progressPercent} status="active" />
            <Space wrap>
              <Button
                onClick={() => pollNow(chartId)}
                loading={manualRefreshing}
                disabled={isTerminalStatus || manualRefreshing}
              >
                立即刷新
              </Button>
              {pollTimeoutReached || pollPausedByError ? (
                <Button
                  type="primary"
                  onClick={onRetryAutoPolling}
                  disabled={isTerminalStatus || manualRefreshing}
                >
                  {pollTimeoutReached ? '重试自动追踪' : '恢复自动追踪'}
                </Button>
              ) : null}
              {!isTerminalStatus ? (
                <Tag color={countdown <= 3 ? 'orange' : 'blue'}>
                  下次自动刷新：{manualRefreshing ? '同步中...' : `${countdown}s`}
                </Tag>
              ) : null}
              <Tag color="processing">
                已查询：{pollCount}/{MAX_RETRY}
              </Tag>
              {lastPolledAt ? <Tag>最近查询：{lastPolledAt}</Tag> : null}
            </Space>
            <Alert
              showIcon
              type={pollError ? 'warning' : 'info'}
              message={hintText}
              description={pollErrorDetail || undefined}
            />
          </Space>
        }
      />
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
      <Card title="智能分析（异步 线程池）" extra={chartId ? `任务 #${chartId}` : undefined}>
        <Form
          form={form}
          name="addChart"
          labelAlign="left"
          labelCol={{ span: 4 }}
          wrapperCol={{ span: 16 }}
          onFinish={onFinish}
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
              <Button icon={<UploadOutlined />}>上传数据文件（.xlsx / .xls / .csv）</Button>
            </Upload>
          </Form.Item>
          <Form.Item wrapperCol={{ span: 16, offset: 4 }}>
            <Space>
              <Button type="primary" htmlType="submit" loading={submitting} disabled={submitting}>
                提交
              </Button>
              <Button htmlType="reset">重置</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      {chartId ? (
        <Card style={{ marginTop: 16 }} title="任务轨迹（Agent Timeline）">
          <Alert
            type={pollError ? 'warning' : 'info'}
            showIcon
            style={{ marginBottom: 12 }}
            message={`任务 #${chartId} · 当前状态：${statusText} · 当前阶段：${taskPhaseText}`}
            description={`轮询进度 ${pollCount}/${MAX_RETRY}${!isTerminalStatus ? `，预计 ${countdown}s 后自动刷新` : ''}${lastPolledAt ? `，最近查询 ${lastPolledAt}` : ''}`}
          />
          {events.length === 0 ? (
            <Alert type="info" showIcon message="任务开始后会自动记录执行轨迹" />
          ) : (
            <Steps direction="vertical" items={timelineItems} />
          )}
          <Divider style={{ margin: '12px 0' }} />
          {renderResult()}
        </Card>
      ) : null}
    </div>
  );
};

export default AddChartAsync;
