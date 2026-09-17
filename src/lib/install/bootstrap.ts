import type { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { PERMISSIONS, SYSTEM_ROLES, ALL_PERMISSIONS } from '@/lib/auth/permissions';

/**
 * The rows an empty database needs before anybody can sign in.
 *
 * Permissions, the system roles that grant them, and the markets the site is
 * served from. None of it is content — it is the structure the application
 * assumes exists, and every one of these writes is an upsert, so running it
 * against a database that already has them changes nothing.
 *
 * ## Why this is not in prisma/seed.ts
 *
 * It *was*, and only there — which meant the only way to get a usable database
 * was to run the seed, and the only way to get an administrator out of it was
 * to put `SEED_ADMIN_PASSWORD` into the deployment's environment. The setup
 * wizard needs the same rows without that, so this moved to where both can
 * reach it and `prisma/seed.ts` now calls it. One implementation, so the
 * wizard and the seed cannot drift into disagreeing about what a working
 * database contains.
 *
 * Deliberately no `server-only` and no module-level Prisma client: the seed
 * bundle is compiled by esbuild for plain Node and brings its own client, so
 * this takes one as an argument rather than importing the app's.
 */

/** The markets a new installation starts with. */
export const INITIAL_COUNTRIES = [
  {
    id: 'country_in',
    name: 'India',
    code: 'IN',
    slug: '',
    locale: 'en-IN',
    currency: 'INR',
    currencySymbol: '₹',
    phoneCode: '+91',
    timezone: 'Asia/Kolkata',
    isDefault: true,
    sortOrder: 0,
  },
  {
    id: 'country_ae',
    name: 'United Arab Emirates',
    code: 'AE',
    slug: 'ae',
    locale: 'en-AE',
    currency: 'AED',
    currencySymbol: 'AED',
    phoneCode: '+971',
    timezone: 'Asia/Dubai',
    isDefault: false,
    sortOrder: 1,
  },
] as const;

export type FoundationCounts = { countries: number; permissions: number; roles: number };

/**
 * Creates the permissions, roles and markets, and leaves anything already there
 * exactly as it is.
 *
 * An existing market is never renamed, re-slugged or reactivated — an operator
 * may have changed any of it on purpose, and this runs on every seed.
 */
export async function seedFoundation(db: PrismaClient): Promise<FoundationCounts> {
  for (const country of INITIAL_COUNTRIES) {
    await db.country.upsert({
      where: { code: country.code },
      update: {},
      create: { ...country, isActive: true },
    });
  }

  for (const [key, meta] of Object.entries(PERMISSIONS)) {
    await db.permission.upsert({
      where: { key },
      update: { group: meta.group, label: meta.label },
      create: { key, group: meta.group, label: meta.label },
    });
  }

  const all = await db.permission.findMany();
  const byKey = new Map(all.map((permission) => [permission.key, permission.id]));

  for (const role of SYSTEM_ROLES) {
    const record = await db.userRole.upsert({
      where: { slug: role.slug },
      update: { name: role.name, description: role.description, rank: role.rank, isSystem: true },
      create: {
        slug: role.slug,
        name: role.name,
        description: role.description,
        rank: role.rank,
        isSystem: true,
      },
    });

    const keys = role.permissions === 'all' ? ALL_PERMISSIONS : role.permissions;
    await db.rolePermission.deleteMany({ where: { roleId: record.id } });
    await db.rolePermission.createMany({
      data: keys
        .map((key) => byKey.get(key))
        .filter((id): id is string => Boolean(id))
        .map((permissionId) => ({ roleId: record.id, permissionId })),
      skipDuplicates: true,
    });
  }

  return {
    countries: INITIAL_COUNTRIES.length,
    permissions: ALL_PERMISSIONS.length,
    roles: SYSTEM_ROLES.length,
  };
}

/** What a first administrator's password has to be, and why it is not the app's own policy. */
export function passwordWeaknesses(password: string): string[] {
  /*
   * Stricter than the policy applied to staff accounts created later, on
   * purpose: this is the super admin of a brand-new deployment, it is the only
   * account in it, and it is chosen once by somebody who will not be prompted
   * to reconsider.
   */
  const missing: string[] = [];
  if (password.length < 14) missing.push('at least 14 characters');
  if (!/[a-z]/.test(password)) missing.push('a lowercase letter');
  if (!/[A-Z]/.test(password)) missing.push('an uppercase letter');
  if (!/[0-9]/.test(password)) missing.push('a number');
  if (!/[^A-Za-z0-9]/.test(password)) missing.push('a symbol');
  return missing;
}

/**
 * Creates the first super administrator.
 *
 * Refuses if any account already exists. That is the whole security model of
 * the installer's admin step: "there are no users" is the condition that makes
 * creating an unauthenticated super admin safe, and it is checked here, against
 * the database, rather than inferred from which page the request came from.
 *
 * The password is hashed and discarded. It is never written to the config file,
 * never logged, and never returned.
 */
export async function createFirstAdministrator(
  db: PrismaClient,
  input: { name: string; email: string; password: string },
): Promise<{ id: string; email: string }> {
  const existing = await db.user.findFirst({ select: { id: true } });
  if (existing) {
    throw new Error('This installation already has an account. The setup wizard is closed.');
  }

  const role = await db.userRole.findUnique({ where: { slug: 'super-admin' } });
  if (!role) {
    throw new Error('The super-admin role is missing — the database was not fully prepared.');
  }

  const user = await db.user.create({
    data: {
      email: input.email.toLowerCase().trim(),
      name: input.name.trim(),
      passwordHash: await bcrypt.hash(input.password, 12),
      roleId: role.id,
      status: 'ACTIVE',
    },
    select: { id: true, email: true },
  });

  return user;
}
