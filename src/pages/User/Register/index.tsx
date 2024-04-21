
import {message, Tabs} from 'antd';
import React, {useState} from 'react';
import { history, useModel } from 'umi';

import Footer from '@/components/Footer';


import {LoginForm, ProFormText} from '@ant-design/pro-form';
import { Link } from '@umijs/max';


const registerUser = async (userData: API.UserRegisterRequest): Promise<number | null> => {
  try {
    //'http://47.100.122.205/api/user/register'
    // const response = await fetch('http://localhost:8101/api/user/register'
    const response = await fetch('http://localhost:8101/api/user/register',{
    // const response = await fetch('http://47.100.122.205/api/user/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userData),
    });

    const data = await response.json();

  // 判断后端传来的message
  if (data.message === "ok") {
    // 注册成功，显示成功消息
    message.success("注册成功！");
      // 延迟2秒后重定向到登录页
  setTimeout(function() {
    window.location.href = "/user/login";
  }, 2000);
  } else {
    // 注册失败，显示错误消息
    message.error(data.message);
    
      
  }
  
  if (response.ok) {
    // 注册成功，返回用户ID
    return data.id;
  } else {
    // 注册失败，返回空值
    return null;
  }
} catch (error) {
  console.error('注册请求出错:', error);
  throw error;
}
};

 
const Register: React.FC = () => {
  const [type, setType] = useState<string>('account');

  // 表单提交
  const handleSubmit = async (values: API.UserRegisterRequest) => {
    const {userPassword, checkPassword,userAccount} = values;

    // 校验
    if (userPassword !== checkPassword) {
      message.error('两次输入的密码不一致');
      return;
    }
     if(!userAccount || userAccount.length < 4){
      message.error("用户名不能少于4个字符")
    }
  
    try {
      // 注册
      const us= await registerUser(values);
  //     if (id) {
  //       const defaultLoginSuccessMessage = '注册成功！';
  //       message.success(defaultLoginSuccessMessage);

      
  //       return;
  //     }
  //   } catch (error: any) {
  //     const defaultLoginFailureMessage = '注册失败，请重试！';
  //     message.error(defaultLoginFailureMessage);
  //   }
  // };
   // 检查后端返回的结果
   if (us) {
    const defaultLoginSuccessMessage = '注册成功！';
    message.success(defaultLoginSuccessMessage);


    
 
  } else {
    // 后端返回账号重复错误
    // message.error('该账号已被注册，请选择其他账号');
  }
} catch (error: any) {
  const defaultLoginFailureMessage = '注册失败，请重试！';
  message.error(defaultLoginFailureMessage);
}
};

  return (

        <><LoginForm
      submitter={{
        searchConfig: {
          submitText: '注册'
        }
      }}
      logo={<img alt=""  />}
      title="欢迎注册"
      subTitle={<a href={"https://www.github.com/kkkano"} target="_blank" rel="noreferrer">智能BI项目GitHub地址</a>}
      initialValues={{
        autoLogin: true,
      }}
      onFinish={async (values) => {
        await handleSubmit(values as API.UserRegisterRequest);
      } }
    >
      <Tabs activeKey={type} onChange={setType}>
        <Tabs.TabPane key="account" tab={'账号密码注册'} />
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
            ]} />
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
            ]} />
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
            ]} />
<Link to="/user/Login">返回登录</Link>
        </>
      )}
    </LoginForm><Footer /></>

  );
};

export default Register;