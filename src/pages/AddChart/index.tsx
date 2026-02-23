import { genChartByAiUsingPOST } from '@/services/yubi/chartController';
import {
  CHART_UPLOAD_FILE_ACCEPT,
  getErrorMessage,
  getUploadFile,
  parseChartOption,
  validateChartUploadFile,
  type UploadFieldValue,
} from '@/utils/chart';
import { UploadOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Col,
  Divider,
  Empty,
  Form,
  Input,
  message,
  Modal,
  Row,
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
import React, { useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { history } from '@umijs/max';

const { Text } = Typography;

const CHART_TYPE_OPTIONS = [
  { value: '折线图', label: '折线图' },
  { value: '柱状图', label: '柱状图' },
  { value: '堆叠图', label: '堆叠图' },
  { value: '饼图', label: '饼图' },
  { value: '雷达图', label: '雷达图' },
];

const SUBMIT_PROGRESS_STEPS = [
  { title: '上传并校验数据', description: '检查文件格式与内容' },
  { title: 'AI 分析中', description: '解析目标与结构化数据' },
  { title: '生成图表结果', description: '输出图表配置与结论' },
];

const SUBMIT_STAGE_HINT = [
  '正在上传并校验数据文件，请稍候',
  'AI 正在分析数据与目标，通常需要 10-30 秒',
  '已完成分析，正在整理图表展示结果',
];

type SubmitMeta = {
  goal?: string;
  name?: string;
  chartType?: string;
};

type AddChartFormValues = {
  goal: string;
  name?: string;
  chartType?: string;
  file?: UploadFieldValue;
};

/**
 * 添加图表页面
 */
const AddChart: React.FC = () => {
  const [form] = useForm();
  const [chart, setChart] = useState<API.BiResponse>();
  const [chartOption, setChartOption] = useState<EChartsOption>();
  const [submitMeta, setSubmitMeta] = useState<SubmitMeta>();
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [previewOpen, setPreviewOpen] = useState<boolean>(false);
  const [loadingStageIndex, setLoadingStageIndex] = useState<number>(0);

  const beforeUpload: UploadProps['beforeUpload'] = (file) => {
    const validationMessage = validateChartUploadFile(file);
    if (validationMessage) {
      message.error(validationMessage);
      return Upload.LIST_IGNORE;
    }
    return false;
  };

  const onReset = () => {
    form.resetFields();
    setChart(undefined);
    setChartOption(undefined);
    setSubmitMeta(undefined);
    setPreviewOpen(false);
    setLoadingStageIndex(0);
  };

  const onFinish = async (values: AddChartFormValues) => {
    if (submitting) return;

    setSubmitting(true);
    setLoadingStageIndex(0);
    setChart(undefined);
    setChartOption(undefined);
    setSubmitMeta({
      goal: values.goal,
      name: values.name,
      chartType: values.chartType,
    });

    const params: API.genChartByAiUsingPOSTParams = {
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

      setLoadingStageIndex(1);
      const res = await genChartByAiUsingPOST(params, {}, originFile);
      if (!res?.data) {
        message.error('分析失败');
        return;
      }

      setLoadingStageIndex(2);
      const parsedChart = parseChartOption<EChartsOption>(res.data.genChart);
      if (!parsedChart) {
        message.error('分析成功，但图表配置解析失败');
        setChart(res.data);
        return;
      }

      setChart(res.data);
      setChartOption(parsedChart);
      message.success('分析成功');
    } catch (error: unknown) {
      message.error('分析失败，' + getErrorMessage(error));
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
                  accept={CHART_UPLOAD_FILE_ACCEPT}
                  beforeUpload={beforeUpload}
                >
                  <Button icon={<UploadOutlined />}>上传数据文件（.xlsx / .xls / .csv）</Button>
                </Upload>
              </Form.Item>

              <Form.Item wrapperCol={{ span: 17, offset: 5 }}>
                <Space>
                  <Button
                    type="primary"
                    htmlType="submit"
                    loading={submitting}
                    disabled={submitting}
                  >
                    提交分析
                  </Button>
                  <Button onClick={onReset} disabled={submitting}>
                    重置
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </Card>
        </Col>

        <Col xs={24} lg={13}>
          <Card title="分析结果">
            {submitting && (
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Alert
                  type="info"
                  showIcon
                  message="AI 正在生成图表，请保持页面开启"
                  description={SUBMIT_STAGE_HINT[loadingStageIndex]}
                />
                <Steps size="small" current={loadingStageIndex} items={SUBMIT_PROGRESS_STEPS} />
                <Text type="secondary">你也可以稍后在“我的图表”页面查看历史结果。</Text>
              </Space>
            )}

            {!chart && !submitting && (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="请先在左侧填写分析目标并上传数据文件"
              />
            )}

            {chart && !submitting && (
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <div>
                  {submitMeta?.name ? (
                    <Tag color="blue">{submitMeta.name}</Tag>
                  ) : (
                    <Tag>未命名图表</Tag>
                  )}
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

                <Space wrap>
                  {chartOption ? (
                    <Button type="primary" onClick={() => setPreviewOpen(true)}>
                      放大预览
                    </Button>
                  ) : null}
                  <Button onClick={() => history.push('/my_chart')}>去我的图表</Button>
                </Space>
              </Space>
            )}
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
        {chartOption && (
          <ReactECharts option={chartOption} style={{ height: '65vh', minHeight: 420 }} />
        )}
      </Modal>
    </div>
  );
};

export default AddChart;
