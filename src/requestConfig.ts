import type { RequestOptions } from '@@/plugin-request/request';
import type { RequestConfig } from '@umijs/max';
import { message, notification } from 'antd';

// 错误处理方案： 错误类型
enum ErrorShowType {
  SILENT = 0,
  WARN_MESSAGE = 1,
  ERROR_MESSAGE = 2,
  NOTIFICATION = 3,
  REDIRECT = 9,
}

// 与后端约定的响应数据格式
interface ResponseStructure<T = unknown> {
  success: boolean;
  data?: T;
  errorCode?: number;
  errorMessage?: string;
  showType?: ErrorShowType;
}

interface BizErrorInfo {
  data?: unknown;
  errorCode?: number;
  errorMessage?: string;
  showType?: ErrorShowType;
}

interface RequestRuntimeError {
  name?: string;
  info?: BizErrorInfo;
  response?: {
    status?: number;
  };
  request?: unknown;
}

class BizError extends Error {
  name = 'BizError';
  info: BizErrorInfo;

  constructor(info: BizErrorInfo) {
    super(info.errorMessage || 'Business request failed');
    this.info = info;
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const getRuntimeError = (error: unknown): RequestRuntimeError =>
  isObject(error) ? (error as RequestRuntimeError) : {};

/**
 * @name 错误处理
 * pro 自带的错误处理， 可以在这里做自己的改动
 * @doc https://umijs.org/docs/max/request#配置
 */
export const errorConfig: RequestConfig = {
  // 错误处理： umi@3 的错误处理方案。
  errorConfig: {
    // 错误抛出
    errorThrower: (res) => {
      const { success, data, errorCode, errorMessage, showType } = res as ResponseStructure;
      if (!success) {
        throw new BizError({ data, errorCode, errorMessage, showType });
      }
    },
    // 错误接收及处理
    errorHandler: (error: unknown, opts?: { skipErrorHandler?: boolean }) => {
      if (opts?.skipErrorHandler) {
        throw error;
      }

      const runtimeError = getRuntimeError(error);
      if (runtimeError.name === 'BizError' && runtimeError.info) {
        const { errorMessage, errorCode, showType } = runtimeError.info;
        switch (showType) {
          case ErrorShowType.SILENT:
            break;
          case ErrorShowType.WARN_MESSAGE:
            message.warning(errorMessage || 'Request warning');
            break;
          case ErrorShowType.ERROR_MESSAGE:
            message.error(errorMessage || 'Request error');
            break;
          case ErrorShowType.NOTIFICATION:
            notification.open({
              description: errorMessage || 'Request failed',
              message: errorCode ? `Error ${errorCode}` : 'Error',
            });
            break;
          case ErrorShowType.REDIRECT:
            // TODO: redirect
            break;
          default:
            message.error(errorMessage || 'Request error');
        }
        return;
      }

      if (runtimeError.response?.status) {
        message.error(`Response status: ${runtimeError.response.status}`);
        return;
      }

      if (runtimeError.request) {
        message.error('No response! Please retry.');
        return;
      }

      message.error('Request error, please retry.');
    },
  },

  // 请求拦截器
  requestInterceptors: [
    (config: RequestOptions) => {
      // 拦截请求配置，进行个性化处理。
      // const url = config?.url?.concat('?token = 123');
      // return { ...config, url };
      return config;
    },
  ],

  // 响应拦截器
  responseInterceptors: [
    (response) => {
      // 拦截响应数据，进行个性化处理
      const responseData = (response as { data?: ResponseStructure }).data;

      if (responseData?.success === false) {
        message.error(responseData.errorMessage || '请求失败！');
      }
      return response;
    },
  ],
};
