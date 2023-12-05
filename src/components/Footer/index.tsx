import { GithubOutlined } from '@ant-design/icons';
import { DefaultFooter } from '@ant-design/pro-components';
import '@umijs/max';
import React from 'react';
const Footer: React.FC = () => {
  const defaultMessage = 'wangxian';
  const currentYear = new Date().getFullYear();
  return (
    <DefaultFooter
      style={{
        background: 'none',
      }}
      copyright={`${currentYear} ${defaultMessage}`}
      links={[
        {
          key: '前端代码',
          title: '前端代码',
          href: 'https://github.com/kkkano/BI-front',
          blankTarget: true,
        },
        {
          key: 'github',
          title: <GithubOutlined />,
          href: 'https://github.com/kkkano',
          blankTarget: true,
        },
        {
          key: '后端代码',
          title: '后端代码',
          href: 'https://github.com/kkkano/BI',
          blankTarget: true,
        },
      ]}
    />
  );
};
export default Footer;
