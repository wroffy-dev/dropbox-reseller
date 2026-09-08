/**
 * End-to-end smoke test.
 *
 * Boots nothing itself — point BASE_URL at a running server. Signs in with the
 * seeded admin credentials and asserts that public pages, auth and every admin
 * route respond correctly.
 */
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3100';
const EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@example.com';
const PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe!2024';

const jar = new Map();
let failures = 0;
let checks = 0;

function cookieHeader() {
  return Array.from(jar.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function storeCookies(response) {
  const raw = response.headers.getSetCookie?.() ?? [];
  for (const cookie of raw) {
    const [pair] = cookie.split(';');
    const index = pair.indexOf('=');
    if (index > 0) jar.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    redirect: 'manual',
    ...options,
    headers: { cookie: cookieHeader(), ...(options.headers ?? {}) },
  });
  storeCookies(response);
  return response;
}

function check(name, condition, detail = '') {
  checks += 1;
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function expectStatus(path, expected, name = path) {
  const response = await request(path);
  const ok = Array.isArray(expected)
    ? expected.includes(response.status)
    : response.status === expected;
  check(name, ok, `got ${response.status}, expected ${expected}`);
  return response;
}

async function main() {
  console.log(`\nSmoke testing ${BASE}\n`);

  console.log('Public routes');
  await expectStatus('/', 200);
  await expectStatus('/pricing', 200);
  await expectStatus('/contact', 200);
  await expectStatus('/about', 200);
  await expectStatus('/blog', 200);
  await expectStatus('/blog/dropbox-admin-settings-day-one', 200);
  await expectStatus('/blog/category/guides', 200);
  await expectStatus('/products/dropbox-business-advanced', 200);
  await expectStatus('/sitemap.xml', 200);
  await expectStatus('/robots.txt', 200);
  await expectStatus('/this-page-does-not-exist', 404, '/this-page-does-not-exist returns 404');

  const home = await request('/');
  const html = await home.text();
  check('homepage returns 200', home.status === 200);
  check('homepage renders CMS hero', html.includes('Dropbox for business'));
  check('homepage renders product table', html.includes('Compare Dropbox plans'));
  check('homepage renders navigation', html.includes('Talk to Sales'));

  const sitemap = await (await request('/sitemap.xml')).text();
  check('sitemap lists products', sitemap.includes('/products/dropbox-business-advanced'));
  check('sitemap lists blog posts', sitemap.includes('/blog/dropbox-admin-settings-day-one'));

  console.log('\nAuthorisation');
  const guarded = await request('/admin');
  check('/admin redirects when signed out', guarded.status === 307 || guarded.status === 302,
    `got ${guarded.status}`);
  check(
    '/admin redirect targets /login',
    (guarded.headers.get('location') ?? '').includes('/login'),
  );

  console.log('\nSign in');
  const csrfResponse = await request('/api/auth/csrf');
  const { csrfToken } = await csrfResponse.json();
  check('csrf token issued', typeof csrfToken === 'string' && csrfToken.length > 10);

  const badLogin = await request('/api/auth/callback/credentials', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      csrfToken,
      email: EMAIL,
      password: 'definitely-the-wrong-password',
      callbackUrl: `${BASE}/admin`,
    }).toString(),
  });
  check(
    'wrong password is rejected',
    (badLogin.headers.get('location') ?? '').includes('error'),
    badLogin.headers.get('location') ?? '',
  );

  const login = await request('/api/auth/callback/credentials', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      csrfToken,
      email: EMAIL,
      password: PASSWORD,
      callbackUrl: `${BASE}/admin`,
    }).toString(),
  });
  const sessionCookie = Array.from(jar.keys()).find((k) => k.includes('session-token'));
  check('credentials sign-in succeeds', Boolean(sessionCookie), login.headers.get('location') ?? '');

  const session = await (await request('/api/auth/session')).json();
  check('session carries the user', session?.user?.email === EMAIL);
  check('session carries permissions', Array.isArray(session?.user?.permissions) &&
    session.user.permissions.length > 0);

  console.log('\nAdmin routes');
  for (const path of ADMIN_ROUTES) {
    await expectStatus(path, 200);
  }

  const dashboard = await (await request('/admin')).text();
  check('dashboard renders the admin shell', dashboard.includes('admin-main'));
  check('dashboard shows lead metrics', dashboard.includes('Total leads'));
  check('dashboard shows the pipeline funnel', dashboard.includes('Open pipeline'));

  const pagesAdmin = await (await request('/admin/pages')).text();
  check('pages list renders seeded pages', pagesAdmin.includes('Pricing'));

  const productsAdmin = await (await request('/admin/products')).text();
  check('products list renders seeded products', productsAdmin.includes('Dropbox Business Advanced'));

  const leadsAdmin = await (await request('/admin/leads')).text();
  check('leads list renders seeded leads', leadsAdmin.includes('Meridian Labs'));

  const pipeline = await (await request('/admin/pipeline')).text();
  check('pipeline renders every stage', pipeline.includes('Negotiation') && pipeline.includes('Qualified'));

  const forms = await (await request('/admin/forms')).text();
  check('forms list renders seeded forms', forms.includes('Contact Sales'));

  const reports = await (await request('/admin/reports')).text();
  check('reports render attribution breakdowns', reports.includes('Leads by source'));

  const blogAdmin = await (await request('/admin/blog')).text();
  check('blog list renders seeded posts', blogAdmin.includes('Google Drive to Dropbox'));

  const seoAdmin = await (await request('/admin/seo')).text();
  check('SEO settings render the title template', seoAdmin.includes('Title template'));

  console.log(`\n${checks - failures}/${checks} checks passed\n`);
  if (failures > 0) process.exit(1);
}

const DEFAULT_ADMIN_ROUTES = [
  '/admin',
  '/admin/pages',
  '/admin/pages/new',
  '/admin/products',
  '/admin/products/new',
  '/admin/products/categories',
  '/admin/leads',
  '/admin/leads/new',
  '/admin/pipeline',
  '/admin/customers',
  '/admin/customers/new',
  '/admin/forms',
  '/admin/forms/new',
  '/admin/reports',
  '/admin/blog',
  '/admin/blog/new',
  '/admin/blog/categories',
  '/admin/media',
  '/admin/seo',
  '/admin/redirects',
];

const ADMIN_ROUTES = (process.env.ADMIN_ROUTES || DEFAULT_ADMIN_ROUTES.join(',')).split(',');

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
