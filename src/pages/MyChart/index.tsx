import {
  deleteChartUsingPOST,
  getChartTaskStatusBatchDetailUsingPOST,
  listMyChartByPageUsingPOST,
} from '@/services/yubi/chartController';
import { getErrorMessage, parseChartOption } from '@/utils/chart';
import { useModel } from '@@/exports';
import {
  Avatar,
  Button,
  Card,
  Col,
  Collapse,
  Empty,
  Grid,
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
import type { ECharts, EChartsOption } from 'echarts';
import { history } from '@umijs/max';
import { aggregateTaskStatusSummary, getTaskStatusSummaryText } from './pollingNotice';

const { Text } = Typography;
const FAILURE_REASON_COLLAPSE_KEY = 'failure-reason';

const STATUS_CONFIG: Record<string, { color: string; label: string; shortLabel: string }> = {
  wait: { color: 'default', label: '排队中', shortLabel: '排队中' },
  running: { color: 'blue', label: '分析执行中', shortLabel: '执行中' },
  succeed: { color: 'green', label: '分析完成', shortLabel: '完成' },
  failed: { color: 'red', label: '分析失败', shortLabel: '失败' },
};

const POLLING_INTERVAL = 5000;
const POLLING_INTERVAL_SECONDS = POLLING_INTERVAL / 1000;
const TASK_STATUS_BATCH_SIZE = 20;

const formatRefreshTimestamp = (): string =>
  new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

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

const isPendingChart = (chart?: API.Chart): boolean =>
  chart?.status === 'wait' || chart?.status === 'running';

const chunkArray = <T,>(items: T[], chunkSize: number): T[][] => {
  if (chunkSize <= 0) {
    return [items];
  }
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
};

const mergeChartTaskStatus = (chart: API.Chart, taskStatus: API.ChartTaskStatusVO): API.Chart => ({
  ...chart,
  name: taskStatus.name ?? chart.name,
  goal: taskStatus.goal ?? chart.goal,
  chartType: taskStatus.chartType ?? chart.chartType,
  status: taskStatus.status ?? chart.status,
  taskPhase: taskStatus.taskPhase ?? chart.taskPhase,
  traceId: taskStatus.traceId ?? chart.traceId,
  failureCode: taskStatus.failureCode ?? chart.failureCode,
  failureReason: taskStatus.failureReason ?? chart.failureReason,
  failureTime: taskStatus.failureTime ?? chart.failureTime,
  execMessage: taskStatus.execMessage ?? chart.execMessage,
  genChart: taskStatus.genChart ?? chart.genChart,
  genResult: taskStatus.genResult ?? chart.genResult,
  updateTime: taskStatus.updateTime ?? chart.updateTime,
});

const toPreviewChartOption = (raw: string | undefined): EChartsOption | undefined => {
  const parsed = parseChartOption<EChartsOption>(raw);
  if (!parsed) {
    return undefined;
  }

  const sanitized = { ...(parsed as Record<string, unknown>) };
  delete sanitized.title;
  return sanitized as EChartsOption;
};

const truncateText = (text: string, maxLength = 120): string => {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}...`;
};

const getFailurePreviewLength = (isMobile: boolean): number => (isMobile ? 52 : 96);

const getFailureSummary = (message: string): string => {
  const normalized = message.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '错误详情为空，请稍后重试。';
  }
  const separators = ['。', '；', ';', '\n', ':', '：'];
  let best = normalized;
  separators.forEach((separator) => {
    const segment = normalized.split(separator)[0]?.trim();
    if (segment && segment.length < best.length) {
      best = segment;
    }
  });
  return truncateText(best, 44);
};

/**
 * 我的图表页面
 */
const MyChartPage: React.FC = () => {
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;

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
  const [refreshingPending, setRefreshingPending] = useState<boolean>(false);
  const [refreshCountdown, setRefreshCountdown] = useState<number>(POLLING_INTERVAL_SECONDS);
  const [lastRefreshTime, setLastRefreshTime] = useState<string>();
  const [pollingNotice, setPollingNotice] = useState<string>();
  const [previewChart, setPreviewChart] = useState<{ title: string; option: EChartsOption } | null>(
    null,
  );
  const [previewLoadingId, setPreviewLoadingId] = useState<number | undefined>();
  const [failureDetail, setFailureDetail] = useState<{ title: string; message: string } | null>(
    null,
  );
  const [expandedFailureIds, setExpandedFailureIds] = useState<Record<number, boolean>>({});
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'wait' | 'running' | 'succeed' | 'failed'
  >('all');
  const previewInstanceRef = useRef<ECharts | null>(null);
  const pollingRequestingRef = useRef(false);
  const chartListRef = useRef<API.Chart[]>([]);

  const hasPendingCharts = useMemo(
    () => chartList.some((chart) => isPendingChart(chart)),
    [chartList],
  );

  const visibleChartList = useMemo(() => {
    if (statusFilter === 'all') {
      return chartList;
    }
    return chartList.filter((chart) => chart.status === statusFilter);
  }, [chartList, statusFilter]);

  const listEmptyText = useMemo(() => {
    if (statusFilter !== 'all' && chartList.length > 0) {
      const activeStatusLabel =
        STATUS_FILTER_OPTIONS.find((option) => option.value === statusFilter)?.label || '当前状态';
      return (
        <Space direction="vertical" size={8} align="center">
          <Text type="secondary">当前页没有{activeStatusLabel}图表</Text>
          <Button size="small" onClick={() => setStatusFilter('all')}>
            查看全部状态
          </Button>
        </Space>
      );
    }

    if (searchParams.name) {
      return (
        <Space direction="vertical" size={8} align="center">
          <Text type="secondary">未找到匹配图表，试试其他关键词</Text>
          <Button
            size="small"
            onClick={() =>
              setSearchParams((prev) => ({
                ...prev,
                current: 1,
                name: undefined,
              }))
            }
          >
            清空关键词
          </Button>
        </Space>
      );
    }

    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <Space direction="vertical" size={4} align="center">
            <Text strong>还没有生成图表</Text>
            <Text type="secondary">先创建一个分析任务，结果会自动同步到这里</Text>
          </Space>
        }
      >
        <Space wrap>
          <Button type="primary" onClick={() => history.push('/add_chart_async')}>
            去创建图表
          </Button>
          <Button onClick={() => history.push('/add_chart')}>快速分析（同步）</Button>
        </Space>
      </Empty>
    );
  }, [chartList.length, searchParams.name, statusFilter]);

  useEffect(() => {
    chartListRef.current = chartList;
  }, [chartList]);

  const refreshPendingChartStatus = useCallback(async () => {
    if (pollingRequestingRef.current) {
      return;
    }

    const pendingChartIds = chartListRef.current
      .filter((chart) => isPendingChart(chart) && typeof chart.id === 'number')
      .map((chart) => chart.id as number);

    if (pendingChartIds.length === 0) {
      return;
    }

    pollingRequestingRef.current = true;
    setRefreshingPending(true);
    try {
      const pendingChartIdChunks = chunkArray(pendingChartIds, TASK_STATUS_BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        pendingChartIdChunks.map((chartIds) => getChartTaskStatusBatchDetailUsingPOST({ chartIds })),
      );

      const taskStatusList: API.ChartTaskStatusVO[] = [];
      const unavailableChartIdSet = new Set<number>();
      const successfulBatchDataList: API.ChartTaskStatusBatchVO[] = [];
      let successChunkCount = 0;
      let duplicateCount = 0;

      batchResults.forEach((result) => {
        if (result.status !== 'fulfilled') {
          return;
        }
        successChunkCount += 1;

        const batchData = result.value?.data;
        if (batchData) {
          successfulBatchDataList.push(batchData);
        }
        duplicateCount += batchData?.duplicateCount ?? 0;

        batchData?.taskStatusList?.forEach((taskStatus) => {
          taskStatusList.push(taskStatus);
        });

        batchData?.unavailableChartIds?.forEach((chartId) => {
          if (typeof chartId === 'number') {
            unavailableChartIdSet.add(chartId);
          }
        });
      });

      if (successChunkCount === 0) {
        throw new Error('all task status batch requests failed');
      }

      const pollingNotices: string[] = [];
      if (successChunkCount < pendingChartIdChunks.length) {
        pollingNotices.push(
          `部分图表状态同步失败（${successChunkCount}/${pendingChartIdChunks.length} 批次成功）`,
        );
      }

      const unavailableChartIds = Array.from(unavailableChartIdSet);
      if (unavailableChartIds.length > 0) {
        const unavailableChartIdsInCurrentList = new Set<number>(
          chartListRef.current
            .filter((chart) => typeof chart.id === 'number' && unavailableChartIdSet.has(chart.id))
            .map((chart) => chart.id as number),
        );

        if (unavailableChartIdsInCurrentList.size > 0) {
          setChartList((prev) =>
            prev.filter(
              (chart) =>
                !(typeof chart.id === 'number' && unavailableChartIdsInCurrentList.has(chart.id)),
            ),
          );
          setTotal((prev) => Math.max(prev - unavailableChartIdsInCurrentList.size, 0));
          pollingNotices.push(`已移除 ${unavailableChartIdsInCurrentList.size} 个不可用任务`);
        }
      }

      if (duplicateCount > 0) {
        pollingNotices.push(`本轮查询已自动去重 ${duplicateCount} 个重复任务`);
      }

      const taskStatusSummary = aggregateTaskStatusSummary(successfulBatchDataList);
      const taskStatusSummaryText = getTaskStatusSummaryText(taskStatusSummary);
      if (taskStatusSummaryText) {
        pollingNotices.push(taskStatusSummaryText);
      }

      setPollingNotice(pollingNotices.length > 0 ? pollingNotices.join('；') : undefined);

      const taskStatusMap = new Map<number, API.ChartTaskStatusVO>();
      taskStatusList.forEach((taskStatus) => {
        if (typeof taskStatus.chartId === 'number') {
          taskStatusMap.set(taskStatus.chartId, taskStatus);
        }
      });
      if (taskStatusMap.size > 0) {
        setChartList((prev) =>
          prev.map((chart) => {
            if (typeof chart.id !== 'number') {
              return chart;
            }
            const taskStatus = taskStatusMap.get(chart.id);
            if (!taskStatus) {
              return chart;
            }
            return mergeChartTaskStatus(chart, taskStatus);
          }),
        );
      }

      setLastRefreshTime(formatRefreshTimestamp());
    } catch (_error: unknown) {
      setPollingNotice('状态同步失败，将在下一轮自动重试');
    } finally {
      pollingRequestingRef.current = false;
      setRefreshingPending(false);
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listMyChartByPageUsingPOST(searchParams);
      if (res.data) {
        setChartList(res.data.records ?? []);
        setTotal(res.data.total ?? 0);
      } else {
        message.error('获取我的图表失败');
      }
    } catch (error: unknown) {
      message.error('获取我的图表失败，' + getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [searchParams]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!hasPendingCharts) {
      setRefreshCountdown(POLLING_INTERVAL_SECONDS);
      setLastRefreshTime(undefined);
      setPollingNotice(undefined);
      return;
    }

    setRefreshCountdown(POLLING_INTERVAL_SECONDS);
    void refreshPendingChartStatus();

    const countdownTimer = window.setInterval(() => {
      setRefreshCountdown((prev) => (prev <= 1 ? POLLING_INTERVAL_SECONDS : prev - 1));
    }, 1000);

    const pollingTimer = window.setInterval(() => {
      void refreshPendingChartStatus();
      setRefreshCountdown(POLLING_INTERVAL_SECONDS);
    }, POLLING_INTERVAL);

    return () => {
      window.clearInterval(countdownTimer);
      window.clearInterval(pollingTimer);
    };
  }, [hasPendingCharts, refreshPendingChartStatus]);

  const handleDeleteChart = async (id: number) => {
    setDeletingId(id);
    try {
      const result = await deleteChartUsingPOST({ id });
      if (result.data === false) {
        message.error('删除失败，请稍后重试');
      } else {
        const currentPage = searchParams.current ?? 1;
        const shouldBackPreviousPage = currentPage > 1 && chartList.length === 1;

        if (shouldBackPreviousPage) {
          setSearchParams((prev) => ({
            ...prev,
            current: Math.max((prev.current ?? 1) - 1, 1),
          }));
          message.success('图表已删除，已返回上一页');
        } else {
          message.success('图表已删除');
          loadData();
        }
      }
    } catch (error: unknown) {
      message.error('删除失败，' + getErrorMessage(error));
    }
    setDeletingId(undefined);
  };

  const openChartPreview = (item: API.Chart, parsedChartOption: EChartsOption) => {
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
      message: item.failureReason || item.execMessage || '暂无详细错误信息，请稍后重试',
    });
  };

  const handleFailureCollapseChange = (id: number, keys: string | string[]) => {
    const normalizedKeys = Array.isArray(keys) ? keys : [keys];
    setExpandedFailureIds((prev) => ({
      ...prev,
      [id]: normalizedKeys.includes(FAILURE_REASON_COLLAPSE_KEY),
    }));
  };

  const renderChartPreview = (item: API.Chart, parsedChartOption?: EChartsOption) => {
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
        <ReactECharts option={parsedChartOption} style={{ height: isMobile ? 220 : 280 }} />
        <Text type="secondary" style={{ fontSize: isMobile ? 11 : 12 }}>
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
            <Text strong style={{ fontSize: isMobile ? 15 : 16 }}>
              我的图表
            </Text>
            <br />
            <Text type="secondary" style={{ fontSize: isMobile ? 12 : 14 }}>
              支持按名称检索，待生成图表会自动刷新状态
            </Text>
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
              onChange={(event) => {
                if (event.target.value) {
                  return;
                }
                setSearchParams({ ...initSearchParams, name: undefined });
              }}
            />
          </Col>
          {hasPendingCharts && (
            <Col span={24}>
              <Space size={8} wrap>
                <Tag color={refreshingPending ? 'processing' : 'blue'}>
                  自动刷新：{refreshingPending ? '同步中...' : `${refreshCountdown}s 后更新`}
                </Tag>
                {lastRefreshTime && (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    最近同步：{lastRefreshTime}
                  </Text>
                )}
                {pollingNotice && <Tag color="warning">{pollingNotice}</Tag>}
                <Button
                  type="link"
                  size="small"
                  loading={refreshingPending}
                  onClick={() => {
                    setRefreshCountdown(POLLING_INTERVAL_SECONDS);
                    void refreshPendingChartStatus();
                  }}
                  style={{ padding: 0 }}
                >
                  立即同步状态
                </Button>
              </Space>
            </Col>
          )}
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
              onChange={(value) =>
                setStatusFilter(value as 'all' | 'wait' | 'running' | 'succeed' | 'failed')
              }
            />
          </Col>
        </Row>
      </Card>
      <List
        grid={{ gutter: 16, xs: 1, sm: 1, md: 1, lg: 2, xl: 2, xxl: 2 }}
        pagination={{
          onChange: (page, pageSize) =>
            setSearchParams({ ...searchParams, current: page, pageSize }),
          current: searchParams.current,
          pageSize: searchParams.pageSize,
          total,
          showTotal: (t) => `共 ${t} 条`,
          showSizeChanger: false,
        }}
        loading={loading}
        dataSource={visibleChartList}
        locale={{ emptyText: listEmptyText }}
        renderItem={(item) => {
          const statusCfg = STATUS_CONFIG[item.status ?? ''];
          const parsedChartOption =
            item.status === 'succeed' ? toPreviewChartOption(item.genChart) : undefined;
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
                          <Tag color={statusCfg.color} style={{ marginRight: 0, maxWidth: '100%' }}>
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
                    <Text type="secondary" style={{ fontSize: isMobile ? 11 : 12 }}>
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
                      title={
                        item.status === 'wait'
                          ? STATUS_CONFIG.wait.label
                          : STATUS_CONFIG.running.label
                      }
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
                    <Card type="inner" size="small" title="分析结论" style={{ marginBottom: 12 }}>
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
                        const fullMessage =
                          item.failureReason || item.execMessage || '暂无详细错误信息，请稍后重试';
                        const summary = getFailureSummary(fullMessage);
                        const previewLength = getFailurePreviewLength(isMobile);
                        const previewMessage = truncateText(fullMessage, previewLength);
                        const needsExpand = fullMessage.length > previewLength;
                        const expanded = item.id ? !!expandedFailureIds[item.id] : false;

                        return (
                          <>
                            <Card
                              size="small"
                              style={{
                                marginBottom: 10,
                                background: '#fff2f0',
                                borderColor: '#ffccc7',
                              }}
                              bodyStyle={{ padding: isMobile ? '8px 10px' : '10px 12px' }}
                            >
                              <Text strong type="danger">
                                错误摘要：
                              </Text>
                              <Text
                                type="danger"
                                style={{ marginLeft: 6, wordBreak: 'break-word' }}
                              >
                                {summary}
                              </Text>
                            </Card>
                            <Text
                              type="danger"
                              style={{
                                display: 'block',
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
                                    移动端建议使用下方“展开失败详情”，桌面端可悬停快速查看。
                                  </Text>
                                </div>
                                {!isMobile && (
                                  <div style={{ marginTop: 8 }}>
                                    <Tooltip
                                      placement="topLeft"
                                      title={
                                        <div
                                          style={{
                                            maxWidth: 420,
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
                                )}
                                <div style={{ marginTop: 8 }}>
                                  <Collapse
                                    size="small"
                                    bordered={false}
                                    activeKey={expanded ? [FAILURE_REASON_COLLAPSE_KEY] : []}
                                    onChange={(keys) =>
                                      handleFailureCollapseChange(item.id as number, keys)
                                    }
                                    items={[
                                      {
                                        key: FAILURE_REASON_COLLAPSE_KEY,
                                        label: expanded ? '收起失败详情' : '展开失败详情',
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
