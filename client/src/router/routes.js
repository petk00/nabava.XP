const routes = [
  {
    path: '/login',
    component: () => import('layouts/AuthLayout.vue'),
    children: [
      { path: '', component: () => import('pages/LoginPage.vue') },
    ],
  },

  {
    path: '/set-password',
    component: () => import('layouts/AuthLayout.vue'),
    children: [
      { path: '', component: () => import('pages/SetPasswordPage.vue') },
    ],
  },

  {
    path: '/',
    component: () => import('layouts/MainLayout.vue'),
    children: [
      { path: '', component: () => import('pages/IndexPage.vue') },
      { path: 'dashboard', redirect: '/' },
      { path: 'home', redirect: '/' },
      { path: 'nabava', redirect: '/' },

      { path: 'zahtjevi',          component: () => import('pages/RequestsPage.vue') },
      { path: 'novizahtjev',        component: () => import('pages/NewRequestPage.vue') },
      { path: 'unutarnjanabava',    component: () => import('pages/InternalProcurementPage.vue') },
      { path: 'zahtjevi/:id',      component: () => import('pages/RequestDetailsPage.vue') },
      { path: 'zahtjevi/:id/edit', component: () => import('pages/EditRequestPage.vue') },

      // backwards compat redirecti
      { path: 'requests',          redirect: '/zahtjevi' },
      { path: 'requests/:id',      redirect: to => `/zahtjevi/${to.params.id}` },
      { path: 'requests/:id/edit', redirect: to => `/zahtjevi/${to.params.id}/edit` },

      { path: 'korisnici',          component: () => import('pages/UsersPage.vue'),   meta: { requiresAdmin: true } },
      { path: 'financije',          component: () => import('pages/FinancePage.vue'), meta: { requiresAdmin: true } },
    ],
  },

  {
    path: '/:catchAll(.*)*',
    name: 'not-found',
    component: () => import('pages/ErrorNotFound.vue'),
  },
];

export default routes;
