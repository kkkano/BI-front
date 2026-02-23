import { genChartByAiAsyncUsingPOST, getChartTaskStatusUsingGET } from '@/services/yubi/chartController';
import { UploadOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Form, Input, message, Progress, Result, Select, Space, Tag, Upload } from 'antd';
import TextArea from 'antd/es/input/TextArea';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'antd/es/form/Form';

/**
 * 添加图表（异步 线程池）页面
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

  const timerRef = useRef<NodeJS.Timeout>();
  const countdownTimerRef = useRef<NodeJS.Timeout>();

  const POLL_INTERVAL_MS = 15 * 1000;
  const MAX_RETRY = 40;

  const statusText = useMemo(() => {
    if (status === 'wait') return '排队中';
    if (status === 'running') return '分析中';
    if (status === 'succeed') return '分析完成';
    if (status === 'failed') return '分析失败';
    return '未开始';
  }, [status]);

  const progressPercent = useMemo(() => {
    if (status === 'succeed' || status === 'failed') return 100;
    if (status === 'running') return 60;
    if (status === 'wait') return 20;
    if (!chartId) return 0;
    return Math.min(Math.round((pollCount / MAX_RETRY) * 90), 90);
  }, [chartId, pollCount, status]);

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

  useEffect(() => {
    return () => stopPolling();
  }, []);

  const fetchChartStatus = async (id: number) => {
    setPollCount((prev) => {
      const next = prev + 1;
      if (next > MAX_RETRY) {
        stopPolling();
        setPollError('自动追踪次数已达上限，请稍后在我的图表页面查看结果');
      }
      return next;
    });

    try {
      const res = await getChartTaskStatusUsingGET({ chartId: id });
      const data = res?.data;
      if (!data) return;

      setStatus(data.status || 'running');
      setExecMessage(data.execMessage || '');
      setPollError('');

      if (data.status === 'succeed') {
        stopPolling();
        message.success('图表分析完成，可前往我的图表查看');
      }
      if (data.status === 'failed') {
        stopPolling();
        setPollError(data.execMessage || '分析失败，请检查数据后重试');
      }
    } catch (e: any) {
      setPollError(`状态查询失败：${e?.message || '未知错误'}`);
    }
  };

  const startPolling = (id: number) => {
    stopPolling();
    setPollCount(0);
    setCountdown(POLL_INTERVAL_MS / 1000);
    fetchChartStatus(id);
    timerRef.current = setInterval(() => {
      setCountdown(POLL_INTERVAL_MS / 1000);
      fetchChartStatus(id);
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
              <Space direction="vertical" size={8} style={{ width: 360, maxWidth: '100%' }}>
                <Progress
                  percent={progressPercent}
                  status={status === 'failed' ? 'exception' : status === 'succeed' ? 'success' : 'active'}
                />
                <Space>
                  <Button onClick={() => chartId && fetchChartStatus(chartId)} disabled={status === 'succeed'}>
                    立即刷新
                  </Button>
                  {status !== 'succeed' && status !== 'failed' ? <Tag color="blue">下次刷新：{countdown}s</Tag> : null}
                  <Tag color="processing">已查询：{pollCount}/{MAX_RETRY}</Tag>
                </Space>
              </Space>
            }
          />
          {pollError ? <Alert type="warning" showIcon message={pollError} /> : null}
        </Card>
      ) : null}
    </div>
  );
};

export default AddChartAsync;
