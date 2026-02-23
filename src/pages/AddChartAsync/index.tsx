import {
  genChartByAiAsyncUsingPOST,
  getChartTaskStatusUsingGET,
} from '@/services/yubi/chartController';
import {
  getErrorMessage,
  getUploadFile,
  hasUsableOption,
  parseChartOption,
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
import React, { useEffect, useMemo, useRef, useState } from 'react';
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
type PollSource = 'auto' | 'manual';

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

const toTaskStatus = (status?: string): TaskStatus => {
  if (status === 'wait' || status === 'running' || status === 'succeed' || status === 'failed') {
    return status;
  }
  return 'running';
};

const getCurrentTime = (): string => new Date().toLocaleTimeString('zh-CN', { hour12: false });

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
  const [countdown, setCountdown] = useState<number>(0);
  const [pollCount, setPollCount] = useState<number>(0);
  const [pollError, setPollError] = useState<string>('');
  const [lastPolledAt, setLastPolledAt] = useState<string>('');
  const [manualRefreshing, setManualRefreshing] = useState<boolean>(false);
  const [pollTimeoutReached, setPollTimeoutReached] = useState<boolean>(false);
  const [pollPausedByError, setPollPausedByError] = useState<boolean>(false);
  const [lastSubmitValues, setLastSubmitValues] = useState<AddChartFormValues>();

  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const countdownTimerRef = useRef<ReturnType<typeof setInterval>>();
  const pollCountRef = useRef<number>(0);
  const consecutiveErrorRef = useRef<number>(0);

  const POLL_INTERVAL_MS = 15 * 1000;
  const MAX_RETRY = 40;
  const MAX_CONSECUTIVE_ERRORS = 5;

  const statusText = useMemo(() => getTaskStatusText(status), [status]);

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
    if (status === 'failed') return buildFailureHint(execMessage);
    return '系统正在处理中，请稍候';
  }, [chartId, execMessage, pollError, pollPausedByError, pollTimeoutReached, status]);

  const beforeUpload: UploadProps['beforeUpload'] = (file) => {
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      message.error('仅支持 .xlsx / .xls / .csv 文件');
      return Upload.LIST_IGNORE;
    }
    return false;
  };

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

  const stopPolling = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = undefined;
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = undefined;
    }
    setCountdown(0);
  };

  const resetPollingMeta = () => {
    pollCountRef.current = 0;
    consecutiveErrorRef.current = 0;
    setPollCount(0);
    setLastPolledAt('');
    setPollError('');
    setPollTimeoutReached(false);
    setPollPausedByError(false);
  };

  const resetCountdown = () => {
    setCountdown(POLL_INTERVAL_MS / 1000);
  };

  useEffect(() => {
    return () => stopPolling();
  }, []);

  const doFetchChartStatus = async (id: number, source: PollSource = 'auto') => {
    if (source === 'auto' && pollCountRef.current >= MAX_RETRY) {
      const timeoutMessage =
        '自动追踪超时：已达到最大查询次数。你可以重试自动追踪，或稍后在“我的图表”查看最终结果';
      stopPolling();
      setPollTimeoutReached(true);
      setPollPausedByError(false);
      setPollError(timeoutMessage);
      addEvent('timeout', timeoutMessage);
      return;
    }

    if (source === 'manual') {
      setManualRefreshing(true);
      resetCountdown();
    }

    pollCountRef.current += 1;
    setPollCount(pollCountRef.current);

    try {
      const res = await getChartTaskStatusUsingGET({ chartId: id });
      const data = res?.data;
      setLastPolledAt(getCurrentTime());

      if (!data) {
        const emptyMessage = '状态查询成功，但未返回任务详情，请稍后重试';
        setPollError(emptyMessage);
        addEvent('empty', emptyMessage);
        return;
      }

      const nextStatus = toTaskStatus(data.status);
      const nextExecMessage = data.execMessage || '';

      consecutiveErrorRef.current = 0;
      setChartDetail(data);
      setStatus(nextStatus);
      setExecMessage(nextExecMessage);
      setPollPausedByError(false);
      setPollError('');

      if (data.status) {
        const eventText =
          data.status === 'failed'
            ? buildFailureHint(nextExecMessage)
            : nextExecMessage || getTaskStatusText(data.status);
        addEvent(data.status, eventText);
      }

      if (nextStatus === 'succeed') {
        stopPolling();
        message.success('图表分析完成，可前往“我的图表”查看');
        return;
      }

      if (nextStatus === 'failed') {
        stopPolling();
        setPollError(buildFailureHint(nextExecMessage));
      }
    } catch (error: unknown) {
      consecutiveErrorRef.current += 1;
      setLastPolledAt(getCurrentTime());

      const errMsg = getErrorMessage(error);
      const errorMessage =
        consecutiveErrorRef.current >= MAX_CONSECUTIVE_ERRORS
          ? '状态查询连续失败次数过多，已暂停自动追踪，请稍后手动刷新'
          : `状态查询失败（连续 ${consecutiveErrorRef.current}/${MAX_CONSECUTIVE_ERRORS} 次）：${errMsg}`;

      setPollError(errorMessage);

      if (consecutiveErrorRef.current >= MAX_CONSECUTIVE_ERRORS) {
        stopPolling();
        setPollPausedByError(true);
        addEvent('error', errorMessage);
        message.error(errorMessage);
      } else {
        addEvent('warning', errorMessage);
      }
    } finally {
      if (source === 'manual') {
        setManualRefreshing(false);
      }
    }
  };

  const startPolling = (id: number) => {
    stopPolling();
    resetPollingMeta();
    resetCountdown();

    doFetchChartStatus(id);

    timerRef.current = setInterval(() => {
      resetCountdown();
      doFetchChartStatus(id);
    }, POLL_INTERVAL_MS);

    countdownTimerRef.current = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
  };

  const onRetryAutoPolling = () => {
    if (!chartId || isTerminalStatus || manualRefreshing) return;
    if (!pollTimeoutReached && !pollPausedByError) return;

    setPollError('');
    setPollPausedByError(false);

    const retryText = pollTimeoutReached
      ? '已重试自动追踪，请稍候查看最新状态'
      : '已恢复自动追踪，请稍候查看最新状态';
    addEvent('retry', retryText);
    startPolling(chartId);
    message.success(retryText);
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
    setPollError('');
    stopPolling();
    resetPollingMeta();

    const params: API.genChartByAiAsyncUsingPOSTParams = {
      goal: values.goal,
      name: values.name,
      chartType: values.chartType,
    };

    try {
      const originFile = getUploadFile(values.file);
      if (!originFile) {
        message.error('请上传数据文件');
        return;
      }

      const res = await genChartByAiAsyncUsingPOST(params, {}, originFile);
      const id = res?.data?.chartId;
      if (!id) {
        message.error('分析任务提交失败');
        return;
      }

      setChartId(id);
      setStatus('wait');
      addEvent('submitted', `任务 #${id} 已提交，系统正在自动追踪执行进度`);
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
      const failureSummary = getFailureReasonSummary(execMessage);
      const failureDetail = getFailureDetailText(execMessage);

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
                  failureSummary ? `失败摘要：${failureSummary}` : buildFailureHint(execMessage)
                }
              />
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
                onClick={() => chartId && doFetchChartStatus(chartId, 'manual')}
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
            <Alert showIcon type={pollError ? 'warning' : 'info'} message={hintText} />
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
            <Upload name="file" maxCount={1} accept=".xlsx,.xls,.csv" beforeUpload={beforeUpload}>
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
            message={`任务 #${chartId} · 当前状态：${statusText}`}
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
