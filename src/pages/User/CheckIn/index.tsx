import React, { useEffect, useState } from 'react';
import { Button, message } from 'antd';
import { userCheckInUsingPOST } from '@/services/yubi/userController';

const UserCheckIn: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [nextCheckInTime, setNextCheckInTime] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState<string>('');

  useEffect(() => {
    // 从localStorage中获取下次签到的时间
    const storedNextCheckInTime = localStorage.getItem('nextCheckInTime');
    if (storedNextCheckInTime) {
      setNextCheckInTime(new Date(storedNextCheckInTime));
    }
  }, []);

  useEffect(() => {
    // 将下次签到的时间存储到localStorage中
    if (nextCheckInTime) {
      localStorage.setItem('nextCheckInTime', nextCheckInTime.toISOString());
    }
  }, [nextCheckInTime]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (nextCheckInTime) {
        const diff = Math.max(0, Math.floor((nextCheckInTime.getTime() - Date.now()) / 1000));
        const hours = Math.floor(diff / 3600);
        const minutes = Math.floor((diff % 3600) / 60);
        const seconds = diff % 60;
        setCountdown(`${hours}小时${minutes}分钟${seconds}秒`);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [nextCheckInTime]);

  const handleCheckIn = async () => {
    if (nextCheckInTime && Date.now() < nextCheckInTime.getTime()) {
      message.error('你已经签到过了，请在倒计时结束后再签到');
      return;
    }
    setIsLoading(true);
    try {
      const response = await userCheckInUsingPOST();
      if (response) {
        message.success('签到成功');
        // 设置下次签到的时间为明天的凌晨0点
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        setNextCheckInTime(tomorrow);
      } else {
        message.error('签到失败');
      }
    } catch (error) {
      console.error(error);
      message.error('签到失败');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Button type="primary" onClick={handleCheckIn} loading={isLoading}>
        签到
      </Button>
      {nextCheckInTime && <p>下次签到还剩：{countdown}</p>}
    </>
  );
};

export default UserCheckIn;
