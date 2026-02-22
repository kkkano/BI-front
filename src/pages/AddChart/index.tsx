import { genChartByAiUsingPOST } from '@/services/yubi/chartController';
import { UploadOutlined } from '@ant-design/icons';
import {
  Button,
  Card,
  Col,
  Divider,
  Form,
  Input,
  message,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
  Upload,
} from 'antd';
import { useForm } from 'antd/es/form/Form';
import TextArea from 'antd/es/input/TextArea';
import React, { useState } from 'react';
import ReactECharts from 'echarts-for-react';

const { Text } = Typography;

const CHART_TYPE_OPTIONS = [
  { value: '折线图', label: '折线图' },
  { value: '柱状图', label: '柱状图' },
  { value: '堆叠图', label: '堆叠图' },
  { value: '饼图', label: '饼图' },
  { value: '雷达图', label: '雷达图' },
];

type SubmitMeta = {
  goal?: string;
  name?: string;
  chartType?: string;
};

const safeParseChartOption = (raw?: string): object | undefined => {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw.replace(/'/g, '"'));
  } catch {
    return undefined;
  }
};

/**
 * 添加图表页面
 */
const AddChart: React.FC = () => {
  const [form] = useForm();
  const [chart, setChart] = useState<API.BiResponse>();
  const [chartOption, setChartOption] = useState<object>();
  const [submitMeta, setSubmitMeta] = useState<SubmitMeta>();
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [previewOpen, setPreviewOpen] = useState<boolean>(false);

  const onFinish = async (values: SubmitMeta & { file?: any }) => {
    if (submitting) return;

    setSubmitting(true);
    setChart(undefined);
    setChartOption(undefined);
    setSubmitMeta({
      goal: values.goal,
      name: values.name,
      chartType: values.chartType,
    });

    const params = {
      ...values,
      file: undefined,
    };

    try {
      const originFile = values?.file?.file?.originFileObj;
      if (!originFile) {
        message.error('请上传数据文件');
        return;
      }

      const res = await genChartByAiUsingPOST(params, {}, originFile);
      if (!res?.data) {
        message.error('分析失败');
        return;
      }

      const parsedChart = safeParseChartOption(res.data.genChart);
      if (!parsedChart) {
        message.error('分析成功，但图表配置解析失败');
        setChart(res.data);
        return;
      }

      setChart(res.data);
      setChartOption(parsedChart);
      message.success('分析成功');
    } catch (e: any) {
      message.error('分析失败，' + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="add-chart">
      <Row gutter={24}>
        <Col xs={24} lg={11}>
          <Card title="智能分析">
            <Form
              form={form}
              name="addChart"
              labelAlign="left"
              labelCol={{ span: 5 }}
              wrapperCol={{ span: 17 }}
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
                <Select options={CHART_TYPE_OPTIONS} placeholder="默认由 AI 自主选择" allowClear />
              </Form.Item>

              <Form.Item
                name="file"
                label="原始数据"
                rules={[{ required: true, message: '请上传数据文件!' }]}
              >
                <Upload
                  name="file"
                  maxCount={1}
                  accept=".xlsx,.csv"
                  beforeUpload={() => false}
                >
                  <Button icon={<UploadOutlined />}>上传数据文件（.xlsx / .csv）</Button>
                </Upload>
              </Form.Item>

              <Form.Item wrapperCol={{ span: 17, offset: 5 }}>
                <Space>
                  <Button type="primary" htmlType="submit" loading={submitting} disabled={submitting}>
                    提交分析
                  </Button>
                  <Button htmlType="reset" disabled={submitting}>
                    重置
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </Card>
        </Col>

        <Col xs={24} lg={13}>
          <Card title="分析结果">
            <Spin spinning={submitting} tip="AI 正在分析数据，请稍候...">
              {!chart && !submitting && <Text type="secondary">请先在左侧提交分析任务</Text>}

              {chart && (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <div>
                    {submitMeta?.name ? <Tag color="blue">{submitMeta.name}</Tag> : <Tag>未命名图表</Tag>}
                    {submitMeta?.chartType && <Tag>{submitMeta.chartType}</Tag>}
                  </div>

                  <Card type="inner" size="small" title="分析结论">
                    <Text style={{ whiteSpace: 'pre-wrap' }}>
                      {chart.genResult || '暂无分析结论，请稍后重试'}
                    </Text>
                  </Card>

                  <Divider style={{ margin: '4px 0' }} />

                  <Card type="inner" size="small" title="可视化图表">
                    {chartOption ? (
                      <div
                        role="button"
                        tabIndex={0}
                        style={{ cursor: 'zoom-in' }}
                        onClick={() => setPreviewOpen(true)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setPreviewOpen(true);
                          }
                        }}
                      >
                        <ReactECharts option={chartOption} style={{ height: 360 }} />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          点击图表可放大查看
                        </Text>
                      </div>
                    ) : (
                      <Text type="warning">图表配置解析失败，请检查原始数据后重试</Text>
                    )}
                  </Card>
                </Space>
              )}
            </Spin>
          </Card>
        </Col>
      </Row>

      <Modal
        open={previewOpen}
        title={submitMeta?.name || '图表预览'}
        footer={null}
        width="85vw"
        onCancel={() => setPreviewOpen(false)}
        destroyOnClose
      >
        {chartOption && <ReactECharts option={chartOption} style={{ height: '65vh', minHeight: 420 }} />}
      </Modal>
    </div>
  );
};

export default AddChart;
