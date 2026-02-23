import { message, Tabs } from 'antd';
import React, { useState } from 'react';

import Footer from '@/components/Footer';

import { LoginForm, ProFormText } from '@ant-design/pro-form';
import { Link } from '@umijs/max';

type RegisterResponse = {
  message?: string;
  id?: number;
};

const registerUser = async (userData: API.UserRegisterRequest): Promise<number | null> => {
  try {
    const response = await fetch('http://localhost:8101/api/user/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userData),
    });

    const data: RegisterResponse = await response.json();

    if (data.message === 'ok') {
      message.success('注册成功！');
      setTimeout(() => {
        window.location.href = '/user/login';
      }, 2000);
    } else if (data.message) {
      message.error(data.message);
    }

    return response.ok ? data.id ?? null : null;
  } catch (error: unknown) {
    console.error('注册请求出错:', error);
    throw error;
  }
};

const Register: React.FC = () => {
  const [type, setType] = useState<string>('account');

  const handleSubmit = async (values: API.UserRegisterRequest) => {
    const { userPassword, checkPassword, userAccount } = values;

    if (userPassword !== checkPassword) {
      message.error('两次输入的密码不一致');
      return;
    }

    if (!userAccount || userAccount.length < 4) {
      message.error('用户名不能少于4个字符');
      return;
    }

    try {
      const userId = await registerUser(values);
      if (userId) {
        message.success('注册成功！');
      }
    } catch (error: unknown) {
      message.error('注册失败，请重试！');
    }
  };

  return (
    <>
      <LoginForm<API.UserRegisterRequest>
        submitter={{
          searchConfig: {
            submitText: '注册',
          },
        }}
        logo={<img alt="" />}
        title="欢迎注册"
        subTitle={
          <a href="https://www.github.com/kkkano" target="_blank" rel="noreferrer">
            智能BI项目GitHub地址
          </a>
        }
        initialValues={{
          autoLogin: true,
        }}
        onFinish={handleSubmit}
      >
        <Tabs activeKey={type} onChange={setType}>
          <Tabs.TabPane key="account" tab="账号密码注册" />
        </Tabs>
        {type === 'account' && (
          <>
            <ProFormText
              name="userAccount"
              fieldProps={{
                size: 'large',
              }}
              placeholder="请输入账号"
              rules={[
                {
                  required: true,
                  message: '账号是必填项！',
                },
                {
                  min: 4,
                  type: 'string',
                  message: '长度不能小于4',
                },
              ]}
            />
            <ProFormText.Password
              name="userPassword"
              fieldProps={{
                size: 'large',
              }}
              placeholder="请输入密码"
              rules={[
                {
                  required: true,
                  message: '密码是必填项！',
                },
                {
                  min: 8,
                  type: 'string',
                  message: '长度不能小于 8',
                },
              ]}
            />
            <ProFormText.Password
              name="checkPassword"
              fieldProps={{
                size: 'large',
              }}
              placeholder="请再次输入密码"
              rules={[
                {
                  required: true,
                  message: '确认密码是必填项！',
                },
                {
                  min: 8,
                  type: 'string',
                  message: '长度不能小于 8',
                },
              ]}
            />
            <Link to="/user/Login">返回登录</Link>
          </>
        )}
      </LoginForm>
      <Footer />
    </>
  );
};

export default Register;
