import { genChartByAiAsyncUsingPOST, getChartTaskStatusUsingGET } from '@/services/yubi/chartController';
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
  Result,
  Select,
  Space,
  Steps,
  Tag,
  Upload,
} from 'antd';
import TextArea from 'antd/es/input/TextArea';
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useForm } from 'antd/es/form/Form';
import ReactECharts from 'echarts-for-react';

type TaskEvent = {
  status: string;
  text: string;
  at: string;
};

const STATUS_TEXT: Record<string, string> = {
  wait: '排队中',
  running: '分析中',
  succeed: '分析完成',
  failed: '分析失败',
};

/**
 * 添加图表(异步线程池)页面 + Agent式进度追踪
 * 轮询策略：30 秒一次，最多 20 次；连续失败 10 次停止追踪
 */
const AddChartAsync: React.FC = () => {
  const [form] = useForm();
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [chartId, setChartId] = useState<number>();
  const [chartDetail, setChartDetail] = useState<API.ChartTaskStatusVO>();
  const [events, setEvents] = useState<TaskEvent[]>([]);

  const timerRef = useRef<NodeJS.Timeout>();
  const pollCountRef = useRef<number>(0);
  const errorCountRef = useRef<number>(0);

  const POLL_INTERVAL_MS = 30 * 1000;
  const MAX_RETRY = 20;

  const statusText = useMemo(
    () => STATUS_TEXT[chartDetail?.status ?? ''] ?? '未开始',
    [chartDetail?.status],
  );

  const stopPolling = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = undefined;
    }
  };

  const resetPollingState = () => {
    pollCountRef.current = 0;
    errorCountRef.current = 0;
  };

  const addEvent = (status: string, text: string) => {
    setEvents((prev) => {
      if (prev.length > 0 && prev[prev.length - 1].status === status) return prev;
      return [
        ...prev,
        { status, text, at: new Date().toLocaleString('zh-CN', { hour12: false }) },
      ];
    });
  };

  const fetchChartDetail = async (id: number) => {
    pollCountRef.current += 1;
    try {
      const res = await getChartTaskStatusUsingGET({ chartId: id });
      if (res?.data) {
        errorCountRef.current = 0;
        setChartDetail(res.data);
        if (res.data.status) {
          addEvent(res.data.status, res.data.execMessage || STATUS_TEXT[res.data.status] || '状态更新');
        }
        if (res.data.status === 'succeed' || res.data.status === 'failed') {
          stopPolling();
          if (res.data.status === 'succeed') message.success('图表生成完成！');
          return;
        }
        if (pollCountRef.current >= MAX_RETRY) {
          stopPolling();
          addEvent('timeout', '轮询次数耗尽，建议稍后手动刷新');
          message.warning('已轮询 20 次仍未完成，稍后可在「我的图表」继续查看');
        }
      }
    } catch (e: any) {
      errorCountRef.current += 1;
      if (errorCountRef.current >= 10) {
        stopPolling();
        addEvent('error', '状态查询连续失败 10 次，自动追踪已停止');
        message.error('状态查询连续失败，已停止自动追踪');
      }
    }
  };

  const startPolling = (id: number) => {
    stopPolling();
    resetPollingState();
    fetchChartDetail(id);
    timerRef.current = setInterval(() => fetchChartDetail(id), POLL_INTERVAL_MS);
  };

  useEffect(() => () => stopPolling(), []);

  const onFinish = async (values: any) => {
    if (submitting) return;
    setSubmitting(true);
    setChartId(undefined);
    setChartDetail(undefined);
    setEvents([]);
    stopPolling();
    resetPollingState();

    const params = { ...values, file: undefined };
    try {
      const res = await genChartByAiAsyncUsingPOST(params, {}, values.file.file.originFileObj);
      if (!res?.data) {
        message.error('分析失败，未获取到任务信息');
        return;
      }
      const id: number = (res.data as any)?.chartId ?? (res.data as any);
      if (!id) {
        message.success('分析任务提交成功，稍后请在我的图表页面查看');
        form.resetFields();
        return;
      }
      setChartId(id);
      addEvent('submitted', `任务 #${id} 已提交`);
      message.success(`任务已提交（#${id}），开始追踪：每 30 秒查询一次`);
      form.resetFields();
      startPolling(id);
    } catch (e: any) {
      message.error('分析失败,' + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const renderResult = () => {
    if (!chartDetail) {
      return (
        <Alert
          type="info"
          showIcon
          message="提交任务后，这里会展示排队/执行状态和结果（每 30 秒自动刷新）"
        />
      );
    }
    if (chartDetail.status === 'wait' || chartDetail.status === 'running') {
      return (
        <Result
          status="info"
          title={statusText}
          subTitle={chartDetail.execMessage || '系统正在努力分析中，请稍候...'}
          extra={<Button onClick={() => chartId && fetchChartDetail(chartId)}>立即刷新</Button>}
        />
      );
    }
    if (chartDetail.status === 'failed') {
      return (
        <Result status="error" title="分析失败" subTitle={chartDetail.execMessage || '请更换数据后重试'} />
      );
    }
    let option: any = {};
    try {
      option = JSON.parse((chartDetail.genChart || '{}').replace(/'/g, '"'));
    } catch (_) {}
    return (
      <>
        <Descriptions bordered column={2} size="small" style={{ marginBottom: 16 }}>
          <Descriptions.Item label="任务ID">{chartDetail.chartId}</Descriptions.Item>
          <Descriptions.Item label="状态">{statusText}</Descriptions.Item>
          {chartDetail.name && (
            <Descriptions.Item label="图表名称">{chartDetail.name}</Descriptions.Item>
          )}
          {chartDetail.chartType && (
            <Descriptions.Item label="图表类型">{chartDetail.chartType}</Descriptions.Item>
          )}
          {chartDetail.goal && (
            <Descriptions.Item label="分析目标" span={2}>
              {chartDetail.goal}
            </Descriptions.Item>
          )}
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
      <Card title="智能分析（异步线程池）" extra={chartId ? `当前任务 #${chartId}` : undefined}>
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
              placeholder="请选择图表类型（可选）"
              allowClear
              options={[
                { value: '折线图', label: '折线图' },
                { value: '柱状图', label: '柱状图' },
                { value: '堆叠图', label: '堆叠图' },
                { value: '饼图', label: '饼图' },
                { value: '雷达图', label: '雷达图' },
              ]}
            />
          </Form.Item>
          <Form.Item name="file" label="原始数据" rules={[{ required: true, message: '请上传数据文件' }]}>
            <Upload name="file" maxCount={1} accept=".xlsx,.xls,.csv">
              <Button icon={<UploadOutlined />}>上传文件（.xlsx / .xls / .csv）</Button>
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
