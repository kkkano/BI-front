import React, { createContext, useContext, useState, useEffect } from 'react';
import { getLoginUserUsingGET } from '@/services/yubi/userController';

// 创建上下文
const UserRoleContext = createContext(null);

// 创建用户角色上下文提供器
export const UserRoleProvider = ({ children }) => {
  const [userRole, setUserRole] = useState(null);

  useEffect(() => {
    fetchUserRole();
  }, []);

  const fetchUserRole = async () => {
    try {
      const response = await getLoginUserUsingGET(); // 调用接口获取登录用户信息
      setUserRole(response.data?.userRole || null); // 将获取到的用户角色信息设置到 state 中
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <UserRoleContext.Provider value={userRole}>
      {children}
    </UserRoleContext.Provider>
  );
};

// 创建自定义hook以便在其他组件中访问用户角色上下文
export const useUserRole = () => useContext(UserRoleContext);