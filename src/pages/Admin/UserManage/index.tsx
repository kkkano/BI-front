import React, { useEffect, useState } from 'react';
import { Table, Popconfirm, message } from 'antd';
import { getAllUsersUsingGET, deleteUserUsingPOST } from '@/services/yubi/userController';

const UserManage: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await getAllUsersUsingGET();
      setUsers(response); // 将获取到的用户数据设置到 state 中
    } catch (error) {
      console.error(error);
    }
  };

  const deleteUser = async (id: number | undefined) => {
    try {
      await deleteUserUsingPOST({ id });
      message.success('删除用户成功');
      fetchUsers();
    } catch (error) {
      console.error(error);
      message.error('删除用户失败');
    }
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
    },
    {
      title: 'Avatar',
      dataIndex: 'userAvatar',
      render: (avatar: string) => <img src={avatar} alt="User Avatar" />,
    
    },
    {
      title: 'Username',
      dataIndex: 'userName',
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      // render: (time) => new Date(time).toLocaleString(),
      render: (time: string) => new Date(time).toLocaleString(),
    },
    {
      title: 'Actions',
      render: (_: any, record: any) => (
        <Popconfirm
          title="确定要删除该用户吗？"
          onConfirm={() => deleteUser(record.id)}
          okText="确定"
          cancelText="取消"
        >
          <a>删除</a>
        </Popconfirm>
      ),
    },
  ];

  return (
    <Table dataSource={users} columns={columns} rowKey="id" />
  );
};

export default UserManage;
