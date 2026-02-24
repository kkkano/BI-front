import {
  DEFAULT_FAILURE_TIP,
  buildFailureHint,
  getFailureDetailText,
  getFailureReasonSummary,
  getTaskStatusText,
} from './statusCopy';

describe('statusCopy', () => {
  it('should parse standardized backend execMessage and keep user-readable reason', () => {
    const execMessage =
      'chartId=1024 | errorType=CHART_TASK_AI_GENERATE_FAILED | timestamp=2026-02-24T10:00:00 | message=CHART_TASK_AI_GENERATE_FAILED: AI 服务响应超时，请稍后重试 | context=phase=failed;detail=ai_generate_failed';

    expect(getFailureReasonSummary(execMessage)).toBe('AI 服务响应超时，请稍后重试');
    expect(getFailureDetailText(execMessage)).toBe('AI 服务响应超时，请稍后重试');
  });

  it('should ignore stack trace lines and strip exception class prefixes', () => {
    const execMessage = [
      'java.lang.RuntimeException: 文件解析失败',
      'at com.yupi.springbootinit.ChartService.execute(ChartService.java:99)',
      'java.lang.IllegalArgumentException: 缺少月份字段 month',
      'at com.yupi.springbootinit.ChartService.parse(ChartService.java:120)',
    ].join('\n');

    expect(getFailureReasonSummary(execMessage)).toBe('文件解析失败');
    expect(getFailureDetailText(execMessage)).toBe('文件解析失败；缺少月份字段 month');
  });

  it('should return default failure tip for empty failure message', () => {
    expect(buildFailureHint('')).toBe(DEFAULT_FAILURE_TIP);
    expect(buildFailureHint(undefined)).toBe(DEFAULT_FAILURE_TIP);
  });

  it('should map known status and fallback for unknown status', () => {
    expect(getTaskStatusText('wait')).toBe('排队中');
    expect(getTaskStatusText('running')).toBe('分析执行中');
    expect(getTaskStatusText('unknown-status')).toBe('状态更新');
  });
});
