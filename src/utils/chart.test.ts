import { getErrorMessage } from './chart';

describe('chart utils - getErrorMessage', () => {
  it('should read umi BizError info.errorMessage first', () => {
    const error = {
      name: 'BizError',
      message: 'Business request failed',
      info: {
        errorMessage: '积分不足，请先签到',
      },
    };

    expect(getErrorMessage(error)).toBe('积分不足，请先签到');
  });

  it('should prefer response.data message for axios-like errors', () => {
    const error = {
      message: 'Request failed with status code 500',
      response: {
        status: 500,
        data: {
          errorMessage: '图表任务不存在',
        },
      },
    };

    expect(getErrorMessage(error)).toBe('图表任务不存在');
  });

  it('should fallback to HTTP status text when payload message is missing', () => {
    const error = {
      response: {
        status: 503,
      },
    };

    expect(getErrorMessage(error)).toBe('请求失败（HTTP 503）');
  });

  it('should keep plain Error message', () => {
    expect(getErrorMessage(new Error('网络连接失败'))).toBe('网络连接失败');
  });

  it('should use custom fallback for unknown errors', () => {
    expect(getErrorMessage(null, '操作失败')).toBe('操作失败');
  });
});
