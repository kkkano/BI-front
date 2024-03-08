import React, { useEffect, useState } from 'react';
import { Modal, Form, Input, message, Button, Row, Col } from 'antd';
import { getLoginUserUsingGET, updateMyUserUsingPOST } from '@/services/yubi/userController';

const UserProfile: React.FC = () => {
  const [user, setUser] = useState<any | null>(null);
  const [editForm] = Form.useForm();

  useEffect(() => {
    fetchUser();
  }, []);

  const fetchUser = async () => {
    try {
      const response = await getLoginUserUsingGET();
      setUser(response.data);
      editForm.setFieldsValue(response.data);
    } catch (error) {
      console.error(error);
    }
  };

  const handleSave = async () => {
    try {
      const values = await editForm.validateFields();
      await updateMyUserUsingPOST({
        id: user.id,
        ...values,
      });
      message.success('更新用户信息成功');
      fetchUser();
    } catch (error) {
      console.error(error);
      message.error('更新用户信息失败');
    }
  };

  const handleCancel = () => {
    editForm.resetFields();
    fetchUser();
  };

  return (
    user ? (
      <Row>
        <Col span={8} offset={8}>
          <img src={user.userAvatar} alt="User Avatar" style={{ width: '120px', height: '120px', display: 'block', margin: '0 auto' }} />
          <Form form={editForm}>
            <Form.Item name="userName" label="Username" rules={[{ required: true, message: '请输入用户名' }]}>
              <Input />
            </Form.Item>
            <Form.Item name="userAvatar" label="Avatar" rules={[{ required: true, message: '请输入头像链接' }]}>
              <Input />
            </Form.Item>
            {/* 添加其他字段的表单项 */}
          </Form>
          <Form.Item label="创建时间">
            <Input value={new Date(user.createTime).toLocaleString()} readOnly />
          </Form.Item>
          <Form.Item label="最后更新时间">
            <Input value={new Date(user.updateTime).toLocaleString()} readOnly />
          </Form.Item>
          <Form.Item label="用户权限">
            <Input value={user.userRole} readOnly />
          </Form.Item>
          <Button type="primary" onClick={handleSave} style={{ marginRight: '10px' }}>保存</Button>
          <Button onClick={handleCancel}>取消</Button>
        </Col>
      </Row>
    ) : null
  );
};

export default UserProfile;
