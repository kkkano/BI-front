import React, { useCallback, useEffect, useState } from 'react';
import { Form, Input, message, Button, Row, Col } from 'antd';
import { getLoginUserUsingGET, updateMyUserUsingPOST } from '@/services/yubi/userController';

type UserProfileFormValues = Pick<API.UserUpdateMyRequest, 'userName' | 'userAvatar'>;

const formatDateTime = (time?: string): string => {
  if (!time) {
    return '--';
  }
  const date = new Date(time);
  return Number.isNaN(date.getTime()) ? '--' : date.toLocaleString();
};

const UserProfile: React.FC = () => {
  const [user, setUser] = useState<API.LoginUserVO | null>(null);
  const [editForm] = Form.useForm<UserProfileFormValues>();

  const fetchUser = useCallback(async () => {
    try {
      const response = await getLoginUserUsingGET();
      const currentUser = response.data;

      if (!currentUser) {
        message.error('获取用户信息失败');
        return;
      }

      setUser(currentUser);
      editForm.setFieldsValue({
        userName: currentUser.userName,
        userAvatar: currentUser.userAvatar,
      });
    } catch (error) {
      console.error(error);
      message.error('获取用户信息失败');
    }
  }, [editForm]);

  useEffect(() => {
    void fetchUser();
  }, [fetchUser]);

  const handleSave = async () => {
    try {
      const values = await editForm.validateFields();
      await updateMyUserUsingPOST(values);
      message.success('更新用户信息成功');
      await fetchUser();
    } catch (error) {
      console.error(error);
      message.error('更新用户信息失败');
    }
  };

  const handleCancel = () => {
    editForm.resetFields();
    void fetchUser();
  };

  if (!user) {
    return null;
  }

  return (
    <Row>
      <Col span={8} offset={8}>
        <img
          src={user.userAvatar}
          alt="User Avatar"
          style={{ width: '120px', height: '120px', display: 'block', margin: '0 auto' }}
        />
        <Form form={editForm}>
          <Form.Item
            name="userName"
            label="Username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="userAvatar"
            label="Avatar"
            rules={[{ required: true, message: '请输入头像链接' }]}
          >
            <Input />
          </Form.Item>
        </Form>

        <Form.Item label="创建时间">
          <Input value={formatDateTime(user.createTime)} readOnly />
        </Form.Item>
        <Form.Item label="最后更新时间">
          <Input value={formatDateTime(user.updateTime)} readOnly />
        </Form.Item>
        <Form.Item label="用户权限">
          <Input value={user.userRole || '--'} readOnly />
        </Form.Item>
        <div>
          <p>
            <strong>剩余积分: </strong>
            {user.points ?? '--'}
          </p>
        </div>
        <Button type="primary" onClick={handleSave} style={{ marginRight: '10px' }}>
          保存
        </Button>
        <Button onClick={handleCancel}>取消</Button>
      </Col>
    </Row>
  );
};

export default UserProfile;
