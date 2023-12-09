import React, { useEffect, useState } from 'react';
import { Table, Popconfirm, message, Modal, Form, Input } from 'antd';
import { getAllUsersUsingGET, deleteUserUsingPOST, updateUserUsingPOST, getLoginUserUsingGET } from '@/services/yubi/userController';

const UserManage: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [editForm] = Form.useForm();
  const [userRole, setUserRole] = useState<string | null>(null); // 新增用户角色状态
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

  return userRole === 'admin' ?(
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
  ):null;
};

export default UserManage;
/**import React, { useEffect, useState } from 'react';
import { Table, Popconfirm, message, Modal, Form, Input, Upload, Button } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import {
  getAllUsersUsingGET,
  deleteUserUsingPOST,
  updateUserUsingPOST,
} from '@/services/yubi/userController';

const UserManage: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [editForm] = Form.useForm();
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

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
    editForm.setFieldsValue({
      ...record,
      userAvatar: '', // 清空头像链接，以便显示上传组件
    });
  };

  const handleSave = async () => {
    try {
      const values = await editForm.validateFields();
      if (avatarFile) {
        // 如果有上传的头像文件，则进行文件上传
        const formData = new FormData();
        formData.append('avatar', avatarFile);
        // 发送请求将头像文件上传到服务器，并获取返回的链接
        const response = await uploadAvatar(formData);
        values.userAvatar = response.avatarUrl;
      }
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

  const uploadAvatar = async (formData: FormData) => {
    try {
      const response = await fetch('/api/upload-avatar', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      return data;
    } catch (error) {
      console.error(error);
      throw error;
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
      render: (avatar: string) => <img src={avatar} alt="User Avatar" />,
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
          <Form.Item name="userAvatar" label="Avatar">
            {avatarFile ? (
              <img src={URL.createObjectURL(avatarFile)} alt="Avatar Preview" style={{ maxWidth: '100%' }} />
            ) : (
              <Upload
                accept="image/*"
                beforeUpload={(file) => {
                  setAvatarFile(file);
                  return false; // 阻止默认的上传行为
                }}
              >
                <Button icon={<UploadOutlined />} size="small">
                  选择图片
                </Button>
              </Upload>
            )}
          </Form.Item>
          {/* 添加其他字段的表单项 */
    //       </Form>
    //       </Modal>
    //     </>
    //   );
    // };
    
    // export default UserManage;
    //  */