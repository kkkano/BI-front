import React, { useEffect, useState } from 'react';
import { Table, Popconfirm, message, Modal, Form, Input, Button } from 'antd';
import { getAllUsersUsingGET, deleteUserUsingPOST, updateUserUsingPOST, getLoginUserUsingGET, addUserUsingPOST,searchUsersUsingGET } from '@/services/yubi/userController';
import styled from 'styled-components';
import { SearchOutlined } from '@ant-design/icons';

const UserManage: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [editForm] = Form.useForm();
  const [userRole, setUserRole] = useState<string | null>(null); // 新增用户角色状态
  const [isAddModalVisible, setIsAddModalVisible] = useState(false); // 控制新增用户信息框显示/隐藏
  const [searchText, setSearchText] = useState('');
  useEffect(() => {
    fetchUsers();
    fetchUserRole();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await getAllUsersUsingGET();
      setUsers(response); // 将获取到的用户数据设置到 state 中
    } catch (error) {
      console.error(error);
    }
  };
  const onSearch = async () => {
    try {
      const response = await searchUsersUsingGET({ userName: searchText });
      setUsers(response);
    } catch (error) {
      console.error(error);
      message.error('搜索用户失败');
    }
  };
  const fetchUserRole = async () => {
    try {
      const response = await getLoginUserUsingGET(); // 调用接口获取登录用户信息
      setUserRole(response.data?.userRole || null); // 将获取到的用户角色信息设置到 state 中
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

  const handleEdit = (record: any) => {
    setEditingUser(record);
    editForm.setFieldsValue(record);
  };

  const handleSave = async () => {
    try {
      const values = await editForm.validateFields();
      await updateUserUsingPOST({
        id: editingUser.id,
        ...values,
      });
      message.success('更新用户信息成功');
      fetchUsers();
      setEditingUser(null);
    } catch (error) {
      console.error(error);
      message.error('更新用户信息失败');
    }
  };

  const handleCancel = () => {
    setEditingUser(null);
    editForm.resetFields();
  };
  const handleAddUser = () => {
    setIsAddModalVisible(true);
  };
  const handleAddUserSubmit = async () => {
    try {
      const values = await editForm.validateFields();
      const response = await addUserUsingPOST(values);
      console.log(response)
      if (response.message === 'ok') {
        message.success('新增用户成功');
        fetchUsers();
        setIsAddModalVisible(false); // 关闭新增用户信息框
      } else {
        message.error('账号已存在');
      }
    } catch (error) {
      console.error(error);
      message.error('新增用户失败');
    }
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
    },
    {
      title: '头像',
      dataIndex: 'userAvatar',
      render: (avatar: string) => <img src={avatar} alt="User Avatar" style={{ width: '120px', height: '120px' }} />,
    },
    {
      title: '用户名',
      dataIndex: 'userName',
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      render: (time: string) => new Date(time).toLocaleString(),
    },
    {
      title: '最后更新时间',
      dataIndex: 'updateTime',
      render: (time: string) => new Date(time).toLocaleString(),
    },
    {
      title: '使用总次数',
      dataIndex: 'usageCount',
    },
    {
      title: '剩余积分',
      dataIndex: 'points',
    },
    {
      title: '最后签到时间',
      dataIndex: 'lastCheckIn',
      render: (time: string) => new Date(time).toLocaleString(),
    },
    {
      title: '用户权限',
      dataIndex: 'userRole',
    },
    {
      title: '操作',
      render: (_: any, record: any) => (
        <>
          <a onClick={() => handleEdit(record)}>编辑</a> |{' '}
          <Popconfirm
            title="确定要删除该用户吗？"
            onConfirm={() => deleteUser(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <a>删除</a>
          </Popconfirm>
        </>
      ),
    },
  ];
  const SmallButton = styled.button`
  font-size: 15px;
  padding: 5px 12px;
  margin-left: auto;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 5px; /* 设置圆角边框 */
  transition: background-color 0.3s, color 0.3s;
  margin-top: 10px; /* 下移10像素 */
  &:hover {
      background-color: lightblue;
      color: navy;
  }
  cursor: pointer; /* 设置光标为手指形状 */
  box-shadow: 2px 2px 4px rgba(1, 1, 1, 0.2); /* 设置阴影效果 */
`;
  return userRole === 'admin' ? (
    <>
        <Input.Search
        placeholder="输入用户名进行搜索"
        enterButton={<Button type="primary" icon={<SearchOutlined />} onClick={onSearch} />}
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
      />
      
      <SmallButton type="primary" onClick={handleAddUser}>新增用户</SmallButton>
      <Table dataSource={users} columns={columns} rowKey="id" />
      
  
      <Modal
        visible={isAddModalVisible}
        title="添加用户"
        onCancel={() => setIsAddModalVisible(false)}
        onOk={handleAddUserSubmit}
      >
        <Form form={editForm}>
          <Form.Item name="userAccount" label="账号"    rules={[{ required: true, message: '请输入账号' }, { min: 4, message: '用户账号过短' }]}>
            <Input placeholder="请输入账号" />
          </Form.Item>
          <Form.Item name="userPassword" label="密码" rules={[{ required: true, message: '请输入密码' }, { min: 8, message: '用户密码过短' }]}>
            <Input.Password placeholder="请输入密码" />
          </Form.Item>
          <Form.Item name="userName" label="用户昵称">
            <Input placeholder="请输入用户昵称" />
          </Form.Item>

          <Form.Item name="userRole" label="用户角色">
  <Input placeholder="请输入用户角色" defaultValue="user" disabled />
</Form.Item>
        </Form>
      </Modal>
 
      <Modal
      
        visible={!!editingUser}
        title="编辑用户信息"
        onCancel={handleCancel}
        onOk={handleSave}
        destroyOnClose
      >
        <Form form={editForm}>

          <Form.Item name="userName" label="Username" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input />
          </Form.Item>

          <Form.Item name="userAvatar" label="Avatar" rules={[{ required: true, message: '请输入头像链接' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="points" label="points" rules={[{ required: true, message: '请输入积分' }]}>
    <Input type="number" /> 
</Form.Item>
          {/* 添加其他字段的表单项 */}
        </Form>
      </Modal>
    </>
  ) : null;
};

export default UserManage;