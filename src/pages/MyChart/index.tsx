import { deleteChartUsingPOST, listMyChartByPageUsingPOST } from '@/services/yubi/chartController';
import { useModel } from '@@/exports';
import {
  Avatar,
  Button,
  Card,
  Col,
  Collapse,
  Empty,
  List,
  message,
  Modal,
  Popconfirm,
  Result,
  Row,
  Segmented,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import ReactECharts from 'echarts-for-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Search from 'antd/es/input/Search';
import type { ECharts } from 'echarts';

const { Text } = Typography;
const FAILURE_REASON_COLLAPSE_KEY = 'failure-reason';

const STATUS_CONFIG: Record<string, { color: string; label: string; shortLabel: string }> = {
  wait: { color: 'warning', label: '排队中', shortLabel: '排队中' },
  running: { color: 'processing', label: '分析执行中', shortLabel: '执行中' },
  succeed: { color: 'success', label: '分析完成', shortLabel: '完成' },
  failed: { color: 'error', label: '分析失败', shortLabel: '失败' },
};

const POLLING_INTERVAL = 5000;

const PREVIEW_HINT_TEXT: Record<string, string> = {
  wait: '图表排队中，状态更新后可预览',
  running: '图表生成中，完成后可点击预览',
  failed: '图表生成失败，请修复后重新生成',
};

const STATUS_TOOLTIP_TEXT: Record<string, string> = {
  wait: '任务已进入队列，等待系统开始处理',
  running: '任务正在执行，页面会自动刷新状态',
  succeed: '图表与分析结论已生成完成',
  failed: '生成异常，建议查看失败原因后修复重试',
};

const STATUS_FILTER_OPTIONS = [
  { label: '全部', value: 'all' },
  { label: STATUS_CONFIG.wait.label, value: 'wait' },
  { label: STATUS_CONFIG.running.label, value: 'running' },
  { label: STATUS_CONFIG.succeed.label, value: 'succeed' },
  { label: STATUS_CONFIG.failed.label, value: 'failed' },
] as const;

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

const truncateText = (text: string, maxLength = 120): string => {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}...`;
};

const getFailurePreviewLength = (): number => {
  if (typeof window === 'undefined') {
    return 88;
  }
  return window.innerWidth <= 768 ? 56 : 88;
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
  const [failureDetail, setFailureDetail] = useState<{ title: string; message: string } | null>(null);
  const [expandedFailureIds, setExpandedFailureIds] = useState<Record<number, boolean>>({});
  const [statusFilter, setStatusFilter] = useState<'all' | 'wait' | 'running' | 'succeed' | 'failed'>(
    'all',
  );
  const previewInstanceRef = useRef<ECharts | null>(null);
  const pollingRequestingRef = useRef(false);

  const hasPendingCharts = useMemo(
    () => chartList.some((chart) => chart.status === 'wait' || chart.status === 'running'),
    [chartList],
  );

  const visibleChartList = useMemo(() => {
    if (statusFilter === 'all') {
      return chartList;
    }
    return chartList.filter((chart) => chart.status === statusFilter);
  }, [chartList, statusFilter]);

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
    setPreviewChart({
      title: item.name || '未命名图表',
      option: parsedChartOption,
    });
    setPreviewLoadingId(undefined);
  };

  const openFailureDetail = (item: API.Chart) => {
    setFailureDetail({
      title: item.name || '未命名图表',
      message: item.execMessage || '暂无详细错误信息，请稍后重试',
    });
  };

  const handleFailureCollapseChange = (id: number, keys: string | string[]) => {
    const normalizedKeys = Array.isArray(keys) ? keys : [keys];
    setExpandedFailureIds((prev) => ({
      ...prev,
      [id]: normalizedKeys.includes(FAILURE_REASON_COLLAPSE_KEY),
    }));
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
          <Col span={24}>
            <Segmented
              size="small"
              value={statusFilter}
              options={STATUS_FILTER_OPTIONS.map((option) => {
                const count =
                  option.value === 'all'
                    ? chartList.length
                    : chartList.filter((chart) => chart.status === option.value).length;
                return {
                  label: `${option.label} (${count})`,
                  value: option.value,
                };
              })}
              onChange={(value) => setStatusFilter(value as 'all' | 'wait' | 'running' | 'succeed' | 'failed')}
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
        dataSource={visibleChartList}
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
                bodyStyle={{ padding: 12 }}
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
                        <Tooltip title={STATUS_TOOLTIP_TEXT[item.status ?? '']}>
                          <Tag
                            color={statusCfg.color}
                            style={{ marginRight: 0, maxWidth: '100%' }}
                          >
                            <Text
                              style={{ color: 'inherit', maxWidth: '100%' }}
                              ellipsis={{ tooltip: statusCfg.label }}
                            >
                              {statusCfg.label}
                            </Text>
                          </Tag>
                        </Tooltip>
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
                      title={item.status === 'wait' ? STATUS_CONFIG.wait.label : STATUS_CONFIG.running.label}
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
                      {(() => {
                        const fullMessage = item.execMessage || '暂无详细错误信息，请稍后重试';
                        const previewLength = getFailurePreviewLength();
                        const previewMessage = truncateText(fullMessage, previewLength);
                        const needsExpand = fullMessage.length > previewLength;
                        const expanded = item.id ? !!expandedFailureIds[item.id] : false;

                        return (
                          <>
                            <Text
                              type="danger"
                              style={{
                                whiteSpace: expanded ? 'pre-wrap' : 'normal',
                                wordBreak: 'break-word',
                                lineHeight: 1.7,
                              }}
                            >
                              {expanded ? fullMessage : previewMessage}
                            </Text>
                            {needsExpand && item.id && (
                              <>
                                <div style={{ marginTop: 8 }}>
                                  <Text type="secondary" style={{ fontSize: 12 }}>
                                    鼠标悬停可快速查看完整错误，点击可展开固定。
                                  </Text>
                                </div>
                                <div style={{ marginTop: 8 }}>
                                  <Tooltip
                                    placement="topLeft"
                                    title={
                                      <div
                                        style={{
                                          maxWidth: 360,
                                          whiteSpace: 'pre-wrap',
                                          wordBreak: 'break-word',
                                          lineHeight: 1.6,
                                        }}
                                      >
                                        {fullMessage}
                                      </div>
                                    }
                                  >
                                    <Button
                                      type="link"
                                      size="small"
                                      style={{ padding: 0 }}
                                      onClick={() => openFailureDetail(item)}
                                    >
                                      悬停查看完整错误
                                    </Button>
                                  </Tooltip>
                                </div>
                                <div style={{ marginTop: 8 }}>
                                  <Collapse
                                    size="small"
                                    bordered={false}
                                    activeKey={expanded ? [FAILURE_REASON_COLLAPSE_KEY] : []}
                                    onChange={(keys) => handleFailureCollapseChange(item.id as number, keys)}
                                    items={[
                                      {
                                        key: FAILURE_REASON_COLLAPSE_KEY,
                                        label: expanded ? '收起失败原因' : '展开失败原因（移动端推荐）',
                                        children: (
                                          <Text
                                            type="danger"
                                            style={{
                                              display: 'block',
                                              whiteSpace: 'pre-wrap',
                                              wordBreak: 'break-word',
                                              lineHeight: 1.8,
                                            }}
                                          >
                                            {fullMessage}
                                          </Text>
                                        ),
                                      },
                                    ]}
                                  />
                                </div>
                              </>
                            )}
                          </>
                        );
                      })()}
                    </Card>
                    <Space size={6} wrap>
                      <Tag color="error" bordered={false}>
                        无法预览
                      </Tag>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {PREVIEW_HINT_TEXT.failed}
                      </Text>
                    </Space>
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
        afterOpenChange={(open) => {
          if (open) {
            window.setTimeout(() => {
              previewInstanceRef.current?.resize();
            }, 0);
          }
        }}
        destroyOnClose
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          支持滚轮缩放页面；按 ESC 可快速关闭预览
        </Text>
        {previewChart && (
          <ReactECharts
            option={previewChart.option}
            onChartReady={(instance) => {
              previewInstanceRef.current = instance;
            }}
            style={{ height: '60vh', minHeight: 420 }}
          />
        )}
      </Modal>

      <Modal
        open={!!failureDetail}
        title={`${failureDetail?.title || ''} · 失败详情`}
        footer={null}
        onCancel={() => setFailureDetail(null)}
        destroyOnClose
      >
        <Card type="inner" size="small" title="失败原因">
          <Text
            type="danger"
            style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.8 }}
          >
            {failureDetail?.message}
          </Text>
        </Card>
        <Text type="secondary" style={{ display: 'block', marginTop: 12 }}>
          建议先检查数据字段完整性、分析目标描述和图表类型后再重试。
        </Text>
      </Modal>
    </div>
  );
};

export default MyChartPage;
