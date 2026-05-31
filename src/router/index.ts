import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue'),
    meta: { title: '登录', noAuth: true }
  },
  {
    path: '/login/callback',
    name: 'LoginCallback',
    component: () => import('../views/LoginCallback.vue'),
    meta: { title: '登录回调', noAuth: true }
  },
  {
    path: '/',
    redirect: '/new-task'
  },
  {
    path: '/new-task',
    name: 'NewTask',
    component: () => import('../views/NewTask.vue'),
    meta: { title: '新建任务' }
  },
  {
    path: '/agent-chat',
    name: 'AgentChat',
    component: () => import('../views/AgentChat.vue'),
    meta: { title: 'Agent 对话' }
  },
  {
    path: '/task-view',
    name: 'TaskView',
    component: () => import('../views/TaskView.vue'),
    meta: { title: '任务执行' }
  },
  // {
  //   path: '/agent-settings',
  //   name: 'AgentSettings',
  //   component: () => import('../views/AgentSettings.vue'),
  //   meta: { title: 'Agent 设置' }
  // },
  {
    path: '/skills',
    name: 'Skills',
    component: () => import('../views/Skills.vue'),
    meta: { title: '技能' }
  },
  {
    path: '/skill-create',
    name: 'SkillCreate',
    component: () => import('../views/SkillCreate.vue'),
    meta: { title: '创建技能' }
  },
  {
    path: '/expert-suites',
    name: 'ExpertSuites',
    component: () => import('../views/ExpertSuites.vue'),
    meta: { title: '专家套件' }
  },
  {
    path: '/connectors',
    name: 'Connectors',
    component: () => import('../views/Connectors.vue'),
    meta: { title: '连接器' }
  },
  {
    path: '/scheduled-tasks',
    name: 'ScheduledTasks',
    component: () => import('../views/ScheduledTasks.vue'),
    meta: { title: '定时任务', isNew: true }
  },
  {
    path: '/im-channels',
    name: 'IMChannels',
    component: () => import('../views/IMChannels.vue'),
    meta: { title: 'IM频道' }
  },
  {
    path: '/chat',
    name: 'ChatView',
    component: () => import('../views/AgentChat.vue'),
    meta: { title: 'Agent 对话' }
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('../views/Settings.vue'),
    meta: { title: '设置' }
  },
  {
    path: '/projects/new',
    name: 'ProjectNew',
    component: () => import('../views/ProjectNew.vue'),
    meta: { title: '新建项目' }
  },
  {
    path: '/task-management',
    name: 'TaskManagement',
    component: () => import('../views/TaskManagement.vue'),
    meta: { title: '任务管理' }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 路由守卫：未登录时重定向到登录页
router.beforeEach((to, _from, next) => {
  const auth = localStorage.getItem('aipcowork_auth')
  if (!to.meta.noAuth && !auth) {
    next('/login')
  } else if (to.path === '/login' && auth) {
    next('/new-task')
  } else {
    next()
  }
})

export default router
