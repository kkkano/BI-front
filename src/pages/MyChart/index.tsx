import { deleteChartUsingPOST, listMyChartByPageUsingPOST } from '@/services/yubi/chartController';
import { useModel } from '@@/exports';
import {
  Avatar,
  Button,
  Card,
  Col,
  Empty,
  List,
  message,
  Modal,
  Popconfirm,
  Result,
  Row,
  Space,
  Tag,
  Typography,
} from 'antd';
import ReactECharts from 'echarts-for-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Search from 'antd/es/input/Search';

const { Text } = Typography;

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  wait: { color: 'warning', label: '待生成' },
  running: { color: 'processing', label: '生成中' },
  succeed: { color: 'success', label: '已完成' },
  failed: { color: 'error', label: '生成失败' },
};

const POLLING_INTERVAL = 5000;

const PREVIEW_HINT_TEXT: Record<string, string> = {
  wait: '图表排队中，状态更新后可预览',
  running: '图表生成中，完成后可点击预览',
  failed: '图表生成失败，请修复后重新生成',
};

const statusToResultStatus = (status?: string): 'warning' | 'info' | 'success' | 'error' => {
  if (status === 'wait') {
    return 'warning';
  }
  if (status === 'running') {
    return 'info';
  }
  if (status === 'succeed') {
    return 'success';
  }
  return 'error';
};

const isValidJson = (str: string): boolean => {
  try {
    JSON.parse(str.replace(/'/g, '"'));
    return true;
  } catch {
    return false;
  }
};

const safeParseChart = (raw: string | undefined): object => {
  try {
    const obj = JSON.parse((raw ?? '{}').replace(/'/g, '"'));
    obj.title = undefined;
    return obj;
  } catch {
    return {};
  }
};

/**
 * 我的图表页面
 */
const MyChartPage: React.FC = () => {
  const initSearchParams: API.ChartQueryRequest = {
    current: 1,
    pageSize: 4,
    sortField: 'createTime',
    sortOrder: 'desc',
  };

  const [searchParams, setSearchParams] = useState<API.ChartQueryRequest>({ ...initSearchParams });
  const { initialState } = useModel('@@initialState');
  const { currentUser } = initialState ?? {};
  const [chartList, setChartList] = useState<API.Chart[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [deletingId, setDeletingId] = useState<number | undefined>();
  const [previewChart, setPreviewChart] = useState<{ title: string; option: object } | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<number | undefined>();
  const pollingRequestingRef = useRef(false);

  const hasPendingCharts = useMemo(
    () => chartList.some((chart) => chart.status === 'wait' || chart.status === 'running'),
    [chartList],
  );

  const loadData = useCallback(
    async (silent = false) => {
      if (silent && pollingRequestingRef.current) {
        return;
      }
      if (silent) {
        pollingRequestingRef.current = true;
      } else {
        setLoading(true);
      }
      try {
        const res = await listMyChartByPageUsingPOST(searchParams);
        if (res.data) {
          setChartList(res.data.records ?? []);
          setTotal(res.data.total ?? 0);
        } else if (!silent) {
          message.error('获取我的图表失败');
        }
      } catch (e: any) {
        if (!silent) {
          message.error('获取我的图表失败，' + e.message);
        }
      } finally {
        if (silent) {
          pollingRequestingRef.current = false;
        } else {
          setLoading(false);
        }
      }
    },
    [searchParams],
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!hasPendingCharts) {
      return;
    }
    const timer = window.setInterval(() => {
      loadData(true);
    }, POLLING_INTERVAL);
    return () => window.clearInterval(timer);
  }, [hasPendingCharts, loadData]);

  const handleDeleteChart = async (id: number) => {
    setDeletingId(id);
    try {
      const result = await deleteChartUsingPOST({ id });
      if (result.data === false) {
        message.error('删除失败，请稍后重试');
      } else {
        message.success('图表已删除');
        loadData();
      }
    } catch (e: any) {
      message.error('删除失败，' + e.message);
    }
    setDeletingId(undefined);
  };

  const openChartPreview = (item: API.Chart, parsedChartOption: object) => {
    setPreviewLoadingId(item.id);
    window.setTimeout(() => {
      setPreviewChart({
        title: item.name || '未命名图表',
        option: parsedChartOption,
      });
      setPreviewLoadingId(undefined);
    }, 80);
  };

  const renderChartPreview = (item: API.Chart, parsedChartOption?: object) => {
    if (!parsedChartOption) {
      return (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="图表配置有误，暂无法预览"
          style={{ margin: '12px 0 8px' }}
        />
      );
    }

    return (
      <div
        role="button"
        tabIndex={0}
        style={{ cursor: 'zoom-in' }}
        onClick={() => openChartPreview(item, parsedChartOption)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openChartPreview(item, parsedChartOption);
          }
        }}
      >
        <ReactECharts option={parsedChartOption} style={{ height: 280 }} />
        <Text type="secondary" style={{ fontSize: 12 }}>
          点击图表可放大查看
        </Text>
      </div>
    );
  };

  return (
    <div className="my-chart-page">
      <Card bordered={false} style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]} align="middle" justify="space-between">
          <Col xs={24} md={14}>
            <Text strong style={{ fontSize: 16 }}>
              我的图表
            </Text>
            <br />
            <Text type="secondary">支持按名称检索，待生成图表会自动刷新状态</Text>
          </Col>
          <Col xs={24} md={10}>
            <Search
              placeholder="请输入图表名称"
              enterButton="搜索"
              allowClear
              loading={loading}
              onSearch={(value) =>
                setSearchParams({
                  ...initSearchParams,
                  name: value || undefined,
                })
              }
            />
          </Col>
        </Row>
      </Card>
      <List
        grid={{ gutter: 16, xs: 1, sm: 1, md: 1, lg: 2, xl: 2, xxl: 2 }}
        pagination={{
          onChange: (page, pageSize) => setSearchParams({ ...searchParams, current: page, pageSize }),
          current: searchParams.current,
          pageSize: searchParams.pageSize,
          total,
          showTotal: (t) => `共 ${t} 条`,
          showSizeChanger: false,
        }}
        loading={loading}
        dataSource={chartList}
        locale={{ emptyText: '暂无图表，快去生成一个吧！' }}
        renderItem={(item) => {
          const statusCfg = STATUS_CONFIG[item.status ?? ''];
          const parsedChartOption =
            item.status === 'succeed' && item.genChart && isValidJson(item.genChart)
              ? safeParseChart(item.genChart)
              : undefined;
          return (
            <List.Item key={item.id}>
              <Card
                style={{ width: '100%' }}
                size="small"
                title={
                  <Row align="middle" gutter={8} wrap={false}>
                    <Col flex="none">
                      <Avatar
                        src={currentUser?.userAvatar}
                        size="small"
                        style={{ background: '#1677ff' }}
                      >
                        {currentUser?.userName?.[0] ?? 'U'}
                      </Avatar>
                    </Col>
                    <Col flex="auto" style={{ overflow: 'hidden' }}>
                      <Text ellipsis style={{ maxWidth: '100%' }}>
                        {item.name || '未命名图表'}
                      </Text>
                    </Col>
                    {statusCfg && (
                      <Col flex="none">
                        <Tag color={statusCfg.color}>{statusCfg.label}</Tag>
                      </Col>
                    )}
                  </Row>
                }
                extra={
                  <Space size="small">
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {new Date(item.createTime as string).toLocaleString('zh-CN', {
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                    {item.status === 'succeed' && parsedChartOption && (
                      <Button
                        type="link"
                        size="small"
                        onClick={() => openChartPreview(item, parsedChartOption)}
                        loading={previewLoadingId === item.id}
                        style={{ padding: 0 }}
                      >
                        预览
                      </Button>
                    )}
                    <Popconfirm
                      title="确定要删除这张图表吗？"
                      okText="删除"
                      cancelText="取消"
                      okButtonProps={{ danger: true }}
                      onConfirm={() => item.id && handleDeleteChart(item.id)}
                    >
                      <Button
                        type="link"
                        danger
                        size="small"
                        loading={deletingId === item.id}
                        style={{ padding: 0 }}
                      >
                        删除
                      </Button>
                    </Popconfirm>
                  </Space>
                }
              >
                {item.chartType && (
                  <div style={{ marginBottom: 8 }}>
                    <Tag>{item.chartType}</Tag>
                    {item.goal && (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {item.goal}
                      </Text>
                    )}
                  </div>
                )}

                {(item.status === 'wait' || item.status === 'running') && (
                  <>
                    <Result
                      status={statusToResultStatus(item.status)}
                      title={item.status === 'wait' ? '待生成' : '图表生成中'}
                      subTitle={
                        item.execMessage ??
                        (item.status === 'wait'
                          ? '当前图表生成队列繁忙，请耐心等候'
                          : '正在分析数据，请稍候...')
                      }
                      style={{ padding: '16px 0 8px' }}
                    />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {PREVIEW_HINT_TEXT[item.status ?? '']}
                    </Text>
                  </>
                )}
                {item.status === 'succeed' && (
                  <>
                    <Card
                      type="inner"
                      size="small"
                      title="分析结论"
                      style={{ marginBottom: 12 }}
                    >
                      <Text>
                        {item.genResult ?? '暂无分析结论，建议返回 AddChart 重新生成以补充内容'}
                      </Text>
                    </Card>
                    {renderChartPreview(item, parsedChartOption)}
                  </>
                )}
                {item.status === 'failed' && (
                  <>
                    <Result
                      status={statusToResultStatus(item.status)}
                      title="图表生成失败"
                      subTitle="请根据失败原因调整后重试"
                      style={{ padding: '16px 0 8px' }}
                    />
                    <Card type="inner" size="small" title="失败原因" style={{ marginBottom: 8 }}>
                      <Text type="danger" style={{ whiteSpace: 'pre-wrap' }}>
                        {item.execMessage ?? '暂无详细错误信息，请稍后重试'}
                      </Text>
                    </Card>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {PREVIEW_HINT_TEXT.failed}
                    </Text>
                  </>
                )}
              </Card>
            </List.Item>
          );
        }}
      />

      <Modal
        open={!!previewChart}
        title={previewChart?.title}
        footer={null}
        width="80vw"
        onCancel={() => setPreviewChart(null)}
        destroyOnClose
      >
        {previewChart && (
          <ReactECharts
            option={previewChart.option}
            style={{ height: '60vh', minHeight: 420 }}
          />
        )}
      </Modal>
    </div>
  );
};

export default MyChartPage;
