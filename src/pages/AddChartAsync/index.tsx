import { genChartByAiAsyncUsingPOST } from '@/services/yubi/chartController';
import { UploadOutlined } from '@ant-design/icons';
import { Button, Card, Form, Input, message, Select, Space, Upload } from 'antd';
import TextArea from 'antd/es/input/TextArea';
import React, { useState } from 'react';
import { useForm } from 'antd/es/form/Form';

/**
 * 添加图表（异步 线程池）页面
 */
const AddChartAsync: React.FC = () => {
  const [form] = useForm();
  const [submitting, setSubmitting] = useState<boolean>(false);

  const onFinish = async (values: any) => {
    if (submitting) return;
    setSubmitting(true);
    const params = { ...values, file: undefined };
    try {
      const originFile = values?.file?.file?.originFileObj;
      if (!originFile) {
        message.error('请上传数据文件');
        setSubmitting(false);
        return;
      }
      // 修复：调用异步线程池接口，而非同步接口
      const res = await genChartByAiAsyncUsingPOST(params, {}, originFile);
      if (!res?.data) {
        message.error('分析失败');
      } else {
        message.success('分析任务提交成功，稍后请在我的图表页面查看');
        form.resetFields();
      }
    } catch (e: any) {
      message.error('分析失败，' + e.message);
    }
    setSubmitting(false);
  };

  return (
    <div className="add-chart-async">
      <Card title="智能分析（异步 线程池）">
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
    </div>
  );
};

export default AddChartAsync;
