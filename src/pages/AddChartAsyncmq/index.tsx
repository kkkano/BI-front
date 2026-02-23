import { genChartByAiAsyncMqUsingPOST, getChartTaskStatusUsingGET } from '@/services/yubi/chartController';
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
  Upload,
} from 'antd';
import TextArea from 'antd/es/input/TextArea';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { buildFailureHint, getTaskStatusText } from '../AddChartAsync/statusCopy';
import { useForm } from 'antd/es/form/Form';
import ReactECharts from 'echarts-for-react';

type TaskEvent = {
  status: string;
  text: string;
  at: string;
};

/**
 * 添加图表(异步 MQ)页面 + Agent式进度追踪
 * 轮询策略：120秒一次，最多10次；连续失败达到10次才判定追踪失败
 */
const AddChartAsync: React.FC = () => {
  const [form] = useForm();
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [chartId, setChartId] = useState<number>();
  const [chartDetail, setChartDetail] = useState<API.ChartTaskStatusVO>();
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [countdown, setCountdown] = useState<number>(0);
  const [pollTimeoutReached, setPollTimeoutReached] = useState<boolean>(false);
  const [manualRefreshing, setManualRefreshing] = useState<boolean>(false);

  const timerRef = useRef<NodeJS.Timeout>();
  const countdownTimerRef = useRef<NodeJS.Timeout>();
  const pollCountRef = useRef<number>(0);
  const errorCountRef = useRef<number>(0);

  const POLL_INTERVAL_MS = 120 * 1000;
  const MAX_RETRY = 10;

  const statusText = useMemo(() => getTaskStatusText(chartDetail?.status), [chartDetail?.status]);

  const getStatusLabel = (status?: string) => getTaskStatusText(status);

  const isTerminalStatus = chartDetail?.status === 'succeed' || chartDetail?.status === 'failed';

  const hintText = useMemo(() => {
    if (!chartId) return '提交任务后，系统会自动追踪分析进度';
    if (pollTimeoutReached)
      return '自动追踪已超时。你可以点击“重试自动追踪”继续获取结果，或前往“我的图表”稍后查看';
    if (chartDetail?.status === 'wait') return '任务已入队，系统正在等待可用计算资源';
    if (chartDetail?.status === 'running') return '任务执行中，可随时点击“立即刷新”获取最新进度';
    if (chartDetail?.status === 'succeed') return '图表已生成完成，建议前往“我的图表”查看详情';
    if (chartDetail?.status === 'failed') return buildFailureHint(chartDetail.execMessage);
    return '系统正在处理中，请稍候';
  }, [chartDetail?.execMessage, chartDetail?.status, chartId, pollTimeoutReached]);

  const progressPercent = useMemo(() => {
    const status = chartDetail?.status;
    if (status === 'succeed') return 100;
    if (status === 'failed') return 100;
    if (status === 'running') return 60;
    if (status === 'wait') return 20;
    if (!chartId) return 0;
    const base = Math.min((pollCountRef.current / MAX_RETRY) * 80, 80);
    return Math.round(base);
  }, [chartDetail?.status, chartId]);

  const progressStatus = useMemo(() => {
    if (chartDetail?.status === 'failed') return 'exception';
    if (chartDetail?.status === 'succeed') return 'success';
    return 'active';
  }, [chartDetail?.status]);

  const nextRefreshInSec = useMemo(() => {
    if (!chartDetail || chartDetail.status === 'succeed' || chartDetail.status === 'failed') return 0;
    return POLL_INTERVAL_MS / 1000;
  }, [chartDetail, POLL_INTERVAL_MS]);

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

  const resetPollingState = () => {
    pollCountRef.current = 0;
    errorCountRef.current = 0;
    setPollTimeoutReached(false);
  };

  const addEvent = (status: string, text: string) => {
    setEvents((prev) => {
      if (prev.length > 0 && prev[prev.length - 1].status === status) {
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

  const fetchChartDetail = async (id: number, source: 'auto' | 'manual' = 'auto') => {
    if (source === 'auto' && pollCountRef.current >= MAX_RETRY) {
      stopPolling();
      setPollTimeoutReached(true);
      addEvent('timeout', '自动追踪超时：已达到最大查询次数。你可以重试自动追踪，或稍后在“我的图表”查看最终结果');
      message.warning('自动追踪超时：已达到最大查询次数。你可以重试自动追踪，或稍后在“我的图表”查看最终结果');
      return;
    }

    if (source === 'manual') {
      setManualRefreshing(true);
      setCountdown(POLL_INTERVAL_MS / 1000);
    }

    pollCountRef.current += 1;

    try {
      const res = await getChartTaskStatusUsingGET({ chartId: id });
      if (res?.data) {
        errorCountRef.current = 0;
        setChartDetail(res.data);

        if (res.data.status) {
          addEvent(res.data.status, res.data.execMessage || getStatusLabel(res.data.status));
        }

        if (res.data.status === 'succeed' || res.data.status === 'failed') {
          stopPolling();
          if (res.data.status === 'succeed') {
            message.success('图表分析完成，可前往“我的图表”查看');
          }
          return;
        }

      }
    } catch (e: any) {
      errorCountRef.current += 1;

      if (errorCountRef.current >= MAX_RETRY) {
        stopPolling();
        addEvent('error', '状态查询连续失败次数过多，已暂停自动追踪，请稍后手动刷新');
        message.error('状态查询连续失败次数过多，已暂停自动追踪，请稍后手动刷新');
      } else {
        message.warning(`状态查询失败（连续 ${errorCountRef.current}/${MAX_RETRY} 次），系统将继续自动重试`);
      }
    } finally {
      if (source === 'manual') {
        setManualRefreshing(false);
      }
    }
  };

  const startPolling = (id: number) => {
    stopPolling();
    resetPollingState();
    fetchChartDetail(id);
    setCountdown(POLL_INTERVAL_MS / 1000);
    timerRef.current = setInterval(() => {
      setCountdown(POLL_INTERVAL_MS / 1000);
      fetchChartDetail(id);
    }, POLL_INTERVAL_MS);
    countdownTimerRef.current = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
  };

  useEffect(() => {
    return () => stopPolling();
  }, []);

  const onRetryAutoPolling = () => {
    if (!chartId || isTerminalStatus || manualRefreshing) return;
    startPolling(chartId);
    message.success('已恢复自动追踪，请稍候查看最新状态');
  };

  const onFinish = async (values: any) => {
    if (submitting) return;
    setSubmitting(true);
    setChartId(undefined);
    setChartDetail(undefined);
    setEvents([]);
    stopPolling();
    resetPollingState();

    const params = {
      ...values,
      file: undefined,
    };

    try {
      const res = await genChartByAiAsyncMqUsingPOST(params, {}, values.file.file.originFileObj);
      if (!res?.data?.chartId) {
        message.error('分析任务提交失败');
        return;
      }
      const id = res.data.chartId;
      setChartId(id);
      addEvent('submitted', `任务 #${id} 已提交`);
      message.success(`分析任务提交成功（#${id}），正在自动追踪状态`);
      form.resetFields();
      startPolling(id);
    } catch (e: any) {
      message.error('分析失败，' + buildFailureHint(e.message));
    } finally {
      setSubmitting(false);
    }
  };

  const renderResult = () => {
    if (!chartDetail) {
      return <Alert type="info" showIcon message={hintText} />;
    }

    if (chartDetail.status === 'wait' || chartDetail.status === 'running') {
      return (
        <Result
          status="info"
          title={statusText}
          subTitle={chartDetail.execMessage || '系统正在努力分析中，请稍候...'}
          extra={
            <Space direction="vertical" size={8} style={{ width: 360, maxWidth: '100%' }}>
              <Progress
                percent={progressPercent}
                status={progressStatus as 'active' | 'success' | 'exception'}
                format={() => `${progressPercent}%`}
              />
              <Space wrap>
                <Button
                  onClick={() => chartId && fetchChartDetail(chartId, 'manual')}
                  loading={manualRefreshing}
                  disabled={isTerminalStatus || manualRefreshing}
                >
                  立即刷新
                </Button>
                {pollTimeoutReached ? (
                  <Button type="primary" onClick={onRetryAutoPolling} disabled={isTerminalStatus || manualRefreshing}>
                    重试自动追踪
                  </Button>
                ) : null}
                {!isTerminalStatus ? (
                  <Tag color={countdown <= 3 ? 'orange' : 'blue'}>
                    下次自动刷新：{manualRefreshing ? '同步中...' : `${countdown}s`}
                  </Tag>
                ) : null}
                <Tag color="processing">已查询：{pollCountRef.current}/{MAX_RETRY}</Tag>
              </Space>
              <Alert showIcon type={pollTimeoutReached ? 'warning' : 'info'} message={hintText} />
            </Space>
          }
        />
      );
    }

    if (chartDetail.status === 'failed') {
      return <Result status="error" title={statusText} subTitle={buildFailureHint(chartDetail.execMessage)} />;
    }

    let option: any = {};
    try {
      option = JSON.parse((chartDetail.genChart || '{}').replace(/'/g, '"'));
    } catch (e) {
      option = {};
    }

    return (
      <>
        <Descriptions bordered column={1} size="small" style={{ marginBottom: 16 }}>
          <Descriptions.Item label="任务ID">{chartDetail.chartId}</Descriptions.Item>
          {chartDetail.name && <Descriptions.Item label="图表名称">{chartDetail.name}</Descriptions.Item>}
          {chartDetail.goal && <Descriptions.Item label="分析目标">{chartDetail.goal}</Descriptions.Item>}
          {chartDetail.chartType && <Descriptions.Item label="图表类型">{chartDetail.chartType}</Descriptions.Item>}
          <Descriptions.Item label="状态">{statusText}</Descriptions.Item>
        </Descriptions>
        <Card type="inner" title="分析结论" style={{ marginBottom: 16 }}>
          {chartDetail.genResult || '暂无'}
        </Card>
        <Card type="inner" title="可视化结果">
          <ReactECharts option={option} />
        </Card>
      </>
    );
  };

  const timelineItems = events.map((event) => ({
    title: (
      <Space>
        <Tag>{event.status}</Tag>
        <span>{event.text}</span>
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
          <Form.Item name="goal" label="分析目标" rules={[{ required: true, message: '请输入分析目标!' }]}>
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
            rules={[{ required: true, message: '请上传数据文件（xlsx）' }]}
          >
            <Upload name="file" maxCount={1}>
              <Button icon={<UploadOutlined />}>上传文件（后缀 .xlsx / .xls）</Button>
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
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message={`任务 #${chartId} · 当前状态：${statusText}`}
            description={`轮询进度 ${pollCountRef.current}/${MAX_RETRY}${nextRefreshInSec ? `，预计 ${countdown}s 后自动刷新` : ''}`}
          />
        ) : null}
        {events.length === 0 ? <Alert type="info" showIcon message="任务开始后会自动记录执行轨迹" /> : <Steps direction="vertical" items={timelineItems} />}
        <Divider style={{ margin: '12px 0' }} />
        {renderResult()}
      </Card>
    </div>
  );
};

export default AddChartAsync;
