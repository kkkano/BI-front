import React, { useEffect, useState } from 'react';
import { Table, Popconfirm, message, Modal, Form, Input } from 'antd';
import { getAllUsersUsingGET, deleteUserUsingPOST, updateUserUsingPOST } from '@/services/yubi/userController';

const UserManage: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [editForm] = Form.useForm();

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
      render: (time: string) => new Date(time).toLocaleString(),
    },
    {
      title: 'Actions',
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

  return (
    <>
      <Table dataSource={users} columns={columns} rowKey="id" />

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
          {/* 添加其他字段的表单项 */}
        </Form>
      </Modal>
    </>
  );
};

export default UserManage;