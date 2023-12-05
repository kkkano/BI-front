import React from 'react';
;
import { ProTable } from '@ant-design/pro-components';
const Admin: React.FC = ({
                          children
                    })                      => {


  
  return (
    <PageHeaderWrapper >
      {children}
    </PageHeaderWrapper>
  );
};
export default Admin;
