import type { PermissionKey } from '@/lib/auth/permissions';

export type AdminNavItem = {
  label: string;
  href: string;
  icon: string;
  permission: PermissionKey;
};

export type AdminNavGroup = {
  label: string;
  items: AdminNavItem[];
};

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    label: 'Overview',
    items: [{ label: 'Dashboard', href: '/admin', icon: 'dashboard', permission: 'dashboard.view' }],
  },
  {
    label: 'Sales',
    items: [
      { label: 'Leads', href: '/admin/leads', icon: 'inbox', permission: 'leads.view' },
      { label: 'Pipeline', href: '/admin/pipeline', icon: 'kanban', permission: 'leads.view' },
      { label: 'Customers', href: '/admin/customers', icon: 'building', permission: 'customers.view' },
      { label: 'Reports', href: '/admin/reports', icon: 'chart', permission: 'leads.view' },
    ],
  },
  {
    label: 'Content',
    items: [
      { label: 'Pages', href: '/admin/pages', icon: 'layout', permission: 'pages.view' },
      { label: 'Products', href: '/admin/products', icon: 'package', permission: 'products.view' },
      { label: 'Blog', href: '/admin/blog', icon: 'file', permission: 'blog.view' },
      { label: 'Forms', href: '/admin/forms', icon: 'clipboard', permission: 'forms.view' },
      { label: 'Media', href: '/admin/media', icon: 'image', permission: 'media.view' },
    ],
  },
  {
    label: 'Marketing',
    items: [
      { label: 'Lead magnets', href: '/admin/lead-magnets', icon: 'gift', permission: 'marketing.manage' },
      { label: 'Popups', href: '/admin/popups', icon: 'megaphone', permission: 'marketing.manage' },
      { label: 'Tracking', href: '/admin/marketing', icon: 'activity', permission: 'marketing.manage' },
      { label: 'SEO', href: '/admin/seo', icon: 'search', permission: 'seo.manage' },
      { label: 'Redirects', href: '/admin/redirects', icon: 'shuffle', permission: 'seo.manage' },
    ],
  },
  {
    label: 'Configuration',
    items: [
      { label: 'Navigation', href: '/admin/navigation', icon: 'menu', permission: 'navigation.manage' },
      { label: 'Website settings', href: '/admin/settings', icon: 'settings', permission: 'settings.manage' },
      { label: 'Email', href: '/admin/settings/email', icon: 'mail', permission: 'settings.manage' },
      { label: 'Staff & roles', href: '/admin/staff', icon: 'users', permission: 'staff.manage' },
      { label: 'Audit log', href: '/admin/audit', icon: 'history', permission: 'audit.view' },
    ],
  },
];
