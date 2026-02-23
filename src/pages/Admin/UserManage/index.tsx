import React, { useEffect, useState } from 'react';
import { Table, Popconfirm, message, Modal, Form, Input, Button, InputNumber } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  getAllUsersUsingGET,
  deleteUserUsingPOST,
  updateUserUsingPOST,
  getLoginUserUsingGET,
  addUserUsingPOST,
  searchUsersUsingGET,
} from '@/services/yubi/userController';
import styled from 'styled-components';
import { SearchOutlined } from '@ant-design/icons';

type EditUserFormValues = Pick<API.UserUpdateRequest, 'userName' | 'userAvatar' | 'points'>;
type AddUserFormValues = Pick<API.UserAddRequest, 'userAccount' | 'userPassword' | 'userName'>;

const SmallButton = styled.button`
  font-size: 15px;
  padding: 5px 12px;
  margin-left: auto;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 5px;
  transition: background-color 0.3s, color 0.3s;
  margin-top: 10px;
  &:hover {
    background-color: lightblue;
    color: navy;
  }
  cursor: pointer;
  box-shadow: 2px 2px 4px rgba(1, 1, 1, 0.2);
`;

const formatDateTime = (time?: string): string => {
  if (!time) {
    return '--';
  }
  const date = new Date(time);
  return Number.isNaN(date.getTime()) ? '--' : date.toLocaleString();
};

const normalizeUsers = (response: API.User[] | undefined): API.User[] =>
  Array.isArray(response) ? response : [];

const UserManage: React.FC = () => {
  const [users, setUsers] = useState<API.User[]>([]);
  const [editingUser, setEditingUser] = useState<API.User | null>(null);
  const [editForm] = Form.useForm<EditUserFormValues>();
  const [addForm] = Form.useForm<AddUserFormValues>();
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    void fetchUsers();
    void fetchUserRole();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await getAllUsersUsingGET();
      setUsers(normalizeUsers(response));
    } catch (error) {
      console.error(error);
      message.error('获取用户列表失败');
    }
  };

  const onSearch = async () => {
    const keyword = searchText.trim();
    if (!keyword) {
      await fetchUsers();
      return;
    }

    try {
      const response = await searchUsersUsingGET({ userName: keyword });
      setUsers(normalizeUsers(response));
    } catch (error) {
      console.error(error);
      message.error('搜索用户失败');
    }
  };

  const fetchUserRole = async () => {
    try {
      const response = await getLoginUserUsingGET();
      setUserRole(response.data?.userRole ?? null);
    } catch (error) {
      console.error(error);
    }
  };

  const deleteUser = async (id?: number) => {
    if (id === undefined) {
      message.error('无效的用户 ID');
      return;
    }

    try {
      await deleteUserUsingPOST({ id });
      message.success('删除用户成功');
      await fetchUsers();
    } catch (error) {
      console.error(error);
      message.error('删除用户失败');
    }
  };

  const handleEdit = (record: API.User) => {
    setEditingUser(record);
    editForm.setFieldsValue({
      userName: record.userName,
      userAvatar: record.userAvatar,
      points: record.points,
    });
  };

  const handleSave = async () => {
    if (!editingUser?.id) {
      message.error('缺少用户 ID，无法保存');
      return;
    }

    try {
      const values = await editForm.validateFields();
      await updateUserUsingPOST({
        id: editingUser.id,
        ...values,
      });
      message.success('更新用户信息成功');
      await fetchUsers();
      handleCancel();
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

  const handleAddModalCancel = () => {
    setIsAddModalVisible(false);
    addForm.resetFields();
  };

  const handleAddUserSubmit = async () => {
    try {
      const values = await addForm.validateFields();
      const response = await addUserUsingPOST({ ...values, userRole: 'user' });

      if (response.code === 0) {
        message.success('新增用户成功');
        await fetchUsers();
        handleAddModalCancel();
      } else {
        message.error(response.message || '新增用户失败');
      }
    } catch (error) {
      console.error(error);
      message.error('新增用户失败');
    }
  };

  const columns: ColumnsType<API.User> = [
    {
      title: 'ID',
      dataIndex: 'id',
    },
    {
      title: '头像',
      dataIndex: 'userAvatar',
      render: (avatar?: string) =>
        avatar ? (
          <img src={avatar} alt="User Avatar" style={{ width: '120px', height: '120px' }} />
        ) : (
          '--'
        ),
    },
    {
      title: '用户名',
      dataIndex: 'userName',
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      render: (time?: string) => formatDateTime(time),
    },
    {
      title: '最后更新时间',
      dataIndex: 'updateTime',
      render: (time?: string) => formatDateTime(time),
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
      render: (time?: string) => formatDateTime(time),
    },
    {
      title: '用户权限',
      dataIndex: 'userRole',
    },
    {
      title: '操作',
      render: (_, record) => (
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

  return userRole === 'admin' ? (
    <>
      <Input.Search
        placeholder="输入用户名进行搜索"
        enterButton={<Button type="primary" icon={<SearchOutlined />} />}
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        onSearch={onSearch}
      />

      <SmallButton type="button" onClick={handleAddUser}>
        新增用户
      </SmallButton>
      <Table dataSource={users} columns={columns} rowKey="id" />

      <Modal
        visible={isAddModalVisible}
        title="添加用户"
        onCancel={handleAddModalCancel}
        onOk={handleAddUserSubmit}
      >
        <Form form={addForm}>
          <Form.Item
            name="userAccount"
            label="账号"
            rules={[
              { required: true, message: '请输入账号' },
              { min: 4, message: '用户账号过短' },
            ]}
          >
            <Input placeholder="请输入账号" />
          </Form.Item>
          <Form.Item
            name="userPassword"
            label="密码"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 8, message: '用户密码过短' },
            ]}
          >
            <Input.Password placeholder="请输入密码" />
          </Form.Item>
          <Form.Item name="userName" label="用户昵称">
            <Input placeholder="请输入用户昵称" />
          </Form.Item>

          <Form.Item label="用户角色">
            <Input value="user" disabled />
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

          <Form.Item
            name="userAvatar"
            label="Avatar"
            rules={[{ required: true, message: '请输入头像链接' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="points"
            label="points"
            rules={[
              { required: true, message: '请输入积分' },
              { type: 'number', min: 0, message: '积分不能小于 0' },
            ]}
          >
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  ) : null;
};

export default UserManage;
