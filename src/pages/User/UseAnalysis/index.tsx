import { PageContainer } from '@ant-design/pro-components';
import React, { useEffect, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { getAllUsersUsingGET } from '@/services/yubi/userController';

const UsageCountAnalysis: React.FC = () => {
  const [usageCountData, setUsageCountData] = useState<API.User[]>([]);

  useEffect(() => {
    // 从远程获取 usageCount 数据
    fetchUsageCountData();
  }, []);

  const fetchUsageCountData = async () => {
    try {
      const response = await getAllUsersUsingGET(); // 从后端获取所有用户数据
      console.log('User Data:', response); // 打印返回的用户数据
      
      // 假设 response 已经是期望的数组格式
      setUsageCountData(response);
    } catch (error) {
      console.error('Failed to fetch usageCount data:', error);
    }
  };

  // 首先根据 usageCount 对数据进行降序排序，然后选取前五名
  const sortedAndTopFiveData = usageCountData
    .sort((a, b) => b.usageCount - a.usageCount)
    .slice(0, 5);

  // 使用 sortedAndTopFiveData 来创建图表数据
  const chartData = sortedAndTopFiveData.map((item) => ({
    value: item.usageCount, 
    name: item.userName, 
  }));

  const option = {
    title: {
      text: '使用次数Top5的用户',
      left: 'center',
    },
    tooltip: {
      trigger: 'item',
    },
    legend: {
      orient: 'vertical',
      left: 'left',
    },
    series: [
      {
        name: 'Usage Count',
        type: 'pie',
        radius: '50%',
        data: chartData,
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)',
          },
        },
      },
    ],
  };

  return (
    <PageContainer>
      <ReactECharts option={option} />
    </PageContainer>
  );
};

export default UsageCountAnalysis;
