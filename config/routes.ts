﻿﻿﻿export default [
  { path: '/user', layout: false, routes: [{ path: '/user/login', component: './User/Login' }] },
  { path: '/user', layout: false, routes: [{ path: '/user/Register', component: './User/Register' }] },//注册路由
  { path: '/', redirect: '/add_chart' },
  { path: '/add_chart', name: '智能分析', icon: 'barChart', component: './AddChart' },
  { path: '/add_chart_async', name: '智能分析(异步 线程池实现)', icon: 'barChart', component: './AddChartAsync' },
  { path: '/add_chart_async_mq', name: '智能分析(异步 MQ实现)', icon: 'barChart', component: './AddChartAsyncmq' },
  { path: '/admin', name: '管理用户', icon: 'crown' ,component: './Admin/UserManage',access: 'canAdmin',},
  { name:'我的图表',path: '/my_chart', icon: 'pieChart', component: './MyChart' },
  { path: '/UserCheckIn', name: '每日签到', icon: 'home', component: './User/CheckIn' },
  { path: '/UseAnalysis', name: '使用分析', icon: 'pieChart', component: './User/UseAnalysis',access: 'canAdmin', },
  {
    name: 'center',
    path: 'account/settings',
    icon: 'user',
    component: './User/UpdateUser',
    hideInMenu: true
  },
  // {
  //   path: '/admin',
  //   icon: 'crown',
  //   access: 'canAdmin',
  //   routes: [
  //     { path: '/admin', name: '管理页面', redirect: '/admin/sub-page' },
  //     { path: '/admin/sub-page', name: '管理页面2', component: './Admin' },
  //   ],
  // },
  { path: '/', redirect: '/welcome' },
  { path: '*', layout: false, component: './404' },
];
