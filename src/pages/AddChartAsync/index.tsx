import { genChartByAiAsyncUsingPOST, getChartTaskStatusUsingGET } from '@/services/yubi/chartController';
import { UploadOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Form, Input, message, Progress, Result, Select, Space, Tag, Upload } from 'antd';
import TextArea from 'antd/es/input/TextArea';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'antd/es/form/Form';

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
  const [status, setStatus] = useState<string>('idle');
  const [execMessage, setExecMessage] = useState<string>('');
  const [countdown, setCountdown] = useState<number>(0);
  const [pollCount, setPollCount] = useState<number>(0);
  const [pollError, setPollError] = useState<string>('');
  const [lastPolledAt, setLastPolledAt] = useState<string>('');
  const [manualRefreshing, setManualRefreshing] = useState<boolean>(false);

  const timerRef = useRef<NodeJS.Timeout>();
  const countdownTimerRef = useRef<NodeJS.Timeout>();
  const pollCountRef = useRef<number>(0);
  const consecutiveErrorRef = useRef<number>(0);

  const POLL_INTERVAL_MS = 15 * 1000;
  const MAX_RETRY = 40;
  const MAX_CONSECUTIVE_ERRORS = 5;

  const statusText = useMemo(() => {
    if (status === 'wait') return '排队中';
    if (status === 'running') return '分析执行中';
    if (status === 'succeed') return '分析完成';
    if (status === 'failed') return '分析失败';
    return '未开始';
  }, [status]);

  const isTerminalStatus = status === 'succeed' || status === 'failed';

  const progressPercent = useMemo(() => {
    if (status === 'succeed' || status === 'failed') return 100;
    if (status === 'running') return 65;
    if (status === 'wait') return 25;
    if (!chartId) return 0;
    return Math.min(Math.round((pollCount / MAX_RETRY) * 90), 90);
  }, [chartId, pollCount, status]);

  const hintText = useMemo(() => {
    if (!chartId) return '提交任务后，系统会自动追踪分析进度';
    if (pollError) return pollError;
    if (status === 'wait') return '任务已入队，系统正在等待可用计算资源';
    if (status === 'running') return '任务执行中，可随时点击“立即刷新”获取最新进度';
    if (status === 'succeed') return '图表已生成完成，建议前往“我的图表”查看详情';
    if (status === 'failed')
      return execMessage || '任务执行失败，建议检查数据字段完整性、分析目标描述和图表类型后重试';
    return '系统正在处理中，请稍候';
  }, [chartId, execMessage, pollError, status]);

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
  };

  const resetCountdown = () => {
    setCountdown(POLL_INTERVAL_MS / 1000);
  };

  useEffect(() => {
    return () => stopPolling();
  }, []);

  const doFetchChartStatus = async (id: number, source: 'auto' | 'manual' = 'auto') => {
    if (source === 'auto' && pollCountRef.current >= MAX_RETRY) {
      stopPolling();
      setPollError('自动追踪次数已达上限，请稍后在“我的图表”页面查看结果');
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
      setLastPolledAt(new Date().toLocaleTimeString('zh-CN', { hour12: false }));

      if (!data) {
        setPollError('状态查询成功，但未返回任务详情，请稍后重试');
        return;
      }

      consecutiveErrorRef.current = 0;
      setStatus(data.status || 'running');
      setExecMessage(data.execMessage || '');
      setPollError('');

      if (data.status === 'succeed') {
        stopPolling();
        message.success('图表分析完成，可前往“我的图表”查看');
        return;
      }

      if (data.status === 'failed') {
        stopPolling();
        setPollError(data.execMessage || '分析失败，请检查数据后重试');
      }
    } catch (e: any) {
      consecutiveErrorRef.current += 1;
      const errMsg = e?.message || '未知错误';
      setPollError(
        `状态查询失败（连续 ${consecutiveErrorRef.current}/${MAX_CONSECUTIVE_ERRORS} 次）：${errMsg}`,
      );

      if (consecutiveErrorRef.current >= MAX_CONSECUTIVE_ERRORS) {
        stopPolling();
        setPollError('状态查询连续失败次数过多，已暂停自动追踪，请稍后手动刷新');
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

  const onFinish = async (values: any) => {
    if (submitting) return;
    setSubmitting(true);
    setChartId(undefined);
    setStatus('idle');
    setExecMessage('');
    setPollError('');
    stopPolling();
    resetPollingMeta();

    const params = { ...values, file: undefined };
    try {
      const originFile = values?.file?.file?.originFileObj;
      if (!originFile) {
        message.error('请上传数据文件');
        setSubmitting(false);
        return;
      }
      const res = await genChartByAiAsyncUsingPOST(params, {}, originFile);
      const id = res?.data?.chartId;
      if (!id) {
        message.error('分析任务提交失败');
      } else {
        setChartId(id);
        setStatus('wait');
        message.success(`分析任务提交成功（#${id}），正在自动追踪状态`);
        form.resetFields();
        startPolling(id);
      }
    } catch (e: any) {
      message.error('分析失败，' + e.message);
    }
    setSubmitting(false);
  };

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
          <Form.Item name="file" label="原始数据" rules={[{ required: true, message: '请上传数据文件!' }]}>
            <Upload name="file" maxCount={1} accept=".xlsx,.csv">
              <Button icon={<UploadOutlined />}>上传数据文件（.xlsx）</Button>
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
        <Card style={{ marginTop: 16 }} title="任务状态追踪">
          <Result
            status={status === 'failed' ? 'error' : status === 'succeed' ? 'success' : 'info'}
            title={statusText}
            subTitle={execMessage || '系统正在处理中，请稍候'}
            extra={
              <Space direction="vertical" size={8} style={{ width: 420, maxWidth: '100%' }}>
                <Progress
                  percent={progressPercent}
                  status={status === 'failed' ? 'exception' : status === 'succeed' ? 'success' : 'active'}
                />
                <Space wrap>
                  <Button
                    onClick={() => chartId && doFetchChartStatus(chartId, 'manual')}
                    loading={manualRefreshing}
                    disabled={isTerminalStatus || manualRefreshing}
                  >
                    立即刷新
                  </Button>
                  {!isTerminalStatus ? (
                    <Tag color={countdown <= 3 ? 'orange' : 'blue'}>
                      下次自动刷新：{manualRefreshing ? '同步中...' : `${countdown}s`}
                    </Tag>
                  ) : null}
                  <Tag color="processing">已查询：{pollCount}/{MAX_RETRY}</Tag>
                  {lastPolledAt ? <Tag>最近查询：{lastPolledAt}</Tag> : null}
                </Space>
                <Alert
                  showIcon
                  type={pollError ? 'warning' : status === 'succeed' ? 'success' : 'info'}
                  message={hintText}
                />
              </Space>
            }
          />
        </Card>
      ) : null}
    </div>
  );
};

export default AddChartAsync;
