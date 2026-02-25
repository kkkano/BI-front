const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export const normalizeChartNameKeyword = (keyword?: string): string | undefined => {
  const normalizedKeyword = keyword?.trim();
  if (!normalizedKeyword) {
    return undefined;
  }
  return normalizedKeyword;
};

export const formatChartCreateTime = (createTime?: string): string => {
  if (!createTime) {
    return '时间未知';
  }
  const timestamp = Date.parse(createTime);
  if (Number.isNaN(timestamp)) {
    return '时间未知';
  }
  return DATE_TIME_FORMATTER.format(new Date(timestamp));
};
