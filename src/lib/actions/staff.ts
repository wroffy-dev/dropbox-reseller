'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { authorize } from '@/lib/auth/guards';
import { recordAudit } from '@/lib/services/audit';
import { hashPassword, passwordIssues } from '@/lib/auth/password';
import { sanitizeText } from '@/lib/utils/sanitize';
import { ALL_PERMISSIONS } from '@/lib/auth/permissions';
import { success, failure, toActionError, type ActionResult } from '@/lib/utils/result';

const staffSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(160),
  email: z.string().trim().email('Enter a valid email address').max(320),
  jobTitle: z.string().max(120).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  roleId: z.string().min(1, 'Choose a role'),
  status: z.enum(['ACTIVE', 'INVITED', 'SUSPENDED']).default('ACTIVE'),
  password: z.string().max(200).optional().nullable(),
});

/**
 * A member of staff may never create or edit someone at or above their own
 * privilege level — that would let an Admin promote themselves to Super Admin.
 */
async function assertCanManageRole(actorRoleSlug: string | null, targetRoleId: string) {
  const [actorRole, targetRole] = await Promise.all([
    actorRoleSlug
      ? prisma.userRole.findUnique({ where: { slug: actorRoleSlug }, select: { rank: true } })
      : null,
    prisma.userRole.findUnique({ where: { id: targetRoleId }, select: { rank: true, name: true } }),
  ]);

  if (!targetRole) return 'That role no longer exists.';
  if (actorRoleSlug === 'super-admin') return null;
  if (!actorRole) return 'Your own role could not be resolved.';
  if (targetRole.rank <= actorRole.rank) {
    return `You cannot assign the “${targetRole.name}” role — it is at or above your own level.`;
  }
  return null;
}

export async function createStaff(formData: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await authorize('staff.manage');
    const input = staffSchema.parse(Object.fromEntries(formData.entries()));

    const roleError = await assertCanManageRole(actor.role, input.roleId);
    if (roleError) return failure(roleError, { roleId: [roleError] });

    const email = input.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) return failure('Someone already uses that email address.', { email: ['Already in use'] });

    if (!input.password) {
      return failure('Set an initial password for the new account.', {
        password: ['Required for a new account'],
      });
    }
    const issues = passwordIssues(input.password);
    if (issues.length > 0) return failure(`The password ${issues.join(', ')}.`, { password: issues });

    const user = await prisma.user.create({
      data: {
        name: sanitizeText(input.name),
        email,
        jobTitle: input.jobTitle ? sanitizeText(input.jobTitle) : null,
        phone: input.phone || null,
        roleId: input.roleId,
        status: input.status,
        passwordHash: await hashPassword(input.password),
      },
    });

    await recordAudit({
      actor,
      action: 'created',
      entity: 'User',
      entityId: user.id,
      summary: `Created staff account for ${user.email}`,
      after: { email: user.email, roleId: user.roleId, status: user.status },
    });

    revalidatePath('/admin/staff');
    return success({ id: user.id }, 'Staff account created.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateStaff(userId: string, formData: FormData): Promise<ActionResult> {
  try {
    const actor = await authorize('staff.manage');
    const before = await prisma.user.findUnique({
      where: { id: userId },
      include: { roles: { select: { slug: true, rank: true, name: true } } },
    });
    if (!before || before.deletedAt) return failure('That account no longer exists.');

    const input = staffSchema.parse(Object.fromEntries(formData.entries()));

    // Guard both the role being assigned and the role the target already holds.
    const existingRoleError = await assertCanManageRole(actor.role, before.roleId);
    if (existingRoleError && before.id !== actor.id) {
      return failure(`You cannot edit an account with the “${before.roles.name}” role.`);
    }
    const roleError = await assertCanManageRole(actor.role, input.roleId);
    if (roleError) return failure(roleError, { roleId: [roleError] });

    // Nobody may lock themselves out by suspending or demoting their own account.
    if (before.id === actor.id) {
      if (input.status !== 'ACTIVE') {
        return failure('You cannot suspend your own account.', { status: ['Choose another status'] });
      }
      if (input.roleId !== before.roleId) {
        return failure('You cannot change your own role.', { roleId: ['Ask another administrator'] });
      }
    }

    const email = input.email.toLowerCase();
    if (email !== before.email) {
      const clash = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (clash) return failure('Someone already uses that email address.', { email: ['Already in use'] });
    }

    let passwordHash: string | undefined;
    if (input.password) {
      const issues = passwordIssues(input.password);
      if (issues.length > 0) return failure(`The password ${issues.join(', ')}.`, { password: issues });
      passwordHash = await hashPassword(input.password);
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        name: sanitizeText(input.name),
        email,
        jobTitle: input.jobTitle ? sanitizeText(input.jobTitle) : null,
        phone: input.phone || null,
        roleId: input.roleId,
        status: input.status,
        ...(passwordHash ? { passwordHash } : {}),
      },
    });

    await recordAudit({
      actor,
      action: 'updated',
      entity: 'User',
      entityId: userId,
      summary: `Updated staff account ${updated.email}${passwordHash ? ' (password reset)' : ''}`,
      before: { email: before.email, roleId: before.roleId, status: before.status },
      after: { email: updated.email, roleId: updated.roleId, status: updated.status },
    });

    revalidatePath('/admin/staff');
    revalidatePath(`/admin/staff/${userId}`);
    return success(undefined, 'Staff account saved.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteStaff(userId: string): Promise<ActionResult> {
  try {
    const actor = await authorize('staff.manage');
    if (userId === actor.id) return failure('You cannot delete your own account.');

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { roles: { select: { slug: true, name: true } } },
    });
    if (!user) return failure('That account no longer exists.');

    const roleError = await assertCanManageRole(actor.role, user.roleId);
    if (roleError) return failure(`You cannot delete an account with the “${user.roles.name}” role.`);

    // The last active super admin must never be removed.
    if (user.roles.slug === 'super-admin') {
      const remaining = await prisma.user.count({
        where: {
          deletedAt: null,
          status: 'ACTIVE',
          roles: { slug: 'super-admin' },
          id: { not: userId },
        },
      });
      if (remaining === 0) return failure('This is the last super admin — create another one first.');
    }

    // Soft delete keeps lead assignment history and audit attribution intact.
    await prisma.user.update({
      where: { id: userId },
      data: {
        deletedAt: new Date(),
        status: 'SUSPENDED',
        email: `${user.email}.deleted.${Date.now()}`,
        passwordHash: null,
      },
    });

    await recordAudit({
      actor,
      action: 'deleted',
      entity: 'User',
      entityId: userId,
      summary: `Deleted staff account ${user.email}`,
    });

    revalidatePath('/admin/staff');
    return success(undefined, 'Staff account deleted.');
  } catch (error) {
    return toActionError(error);
  }
}

const roleSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  description: z.string().max(300).optional().nullable(),
  permissions: z.array(z.string().max(60)).max(80).default([]),
});

export async function saveRole(roleId: string | null, input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await authorize('staff.manage');
    if (actor.role !== 'super-admin') {
      return failure('Only a super admin can change roles and permissions.');
    }

    const parsed = roleSchema.parse(input);
    const keys = parsed.permissions.filter((key) =>
      (ALL_PERMISSIONS as readonly string[]).includes(key),
    );

    if (roleId) {
      const existing = await prisma.userRole.findUnique({ where: { id: roleId } });
      if (!existing) return failure('That role no longer exists.');
      if (existing.slug === 'super-admin') {
        return failure('The Super Admin role always has every permission and cannot be changed.');
      }
    }

    const slug = parsed.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const role = roleId
      ? await prisma.userRole.update({
          where: { id: roleId },
          data: { name: sanitizeText(parsed.name), description: parsed.description || null },
        })
      : await prisma.userRole.create({
          data: {
            name: sanitizeText(parsed.name),
            slug,
            description: parsed.description || null,
            rank: 50,
          },
        });

    const permissions = await prisma.permission.findMany({
      where: { key: { in: keys } },
      select: { id: true },
    });

    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { roleId: role.id } }),
      prisma.rolePermission.createMany({
        data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
        skipDuplicates: true,
      }),
    ]);

    await recordAudit({
      actor,
      action: roleId ? 'updated' : 'created',
      entity: 'UserRole',
      entityId: role.id,
      summary: `${roleId ? 'Updated' : 'Created'} role “${role.name}” with ${keys.length} permission(s)`,
      after: { permissions: keys },
    });

    revalidatePath('/admin/staff');
    return success({ id: role.id }, 'Role saved.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteRole(roleId: string): Promise<ActionResult> {
  try {
    const actor = await authorize('staff.manage');
    if (actor.role !== 'super-admin') return failure('Only a super admin can delete roles.');

    const role = await prisma.userRole.findUnique({
      where: { id: roleId },
      include: { _count: { select: { users: true } } },
    });
    if (!role) return failure('That role no longer exists.');
    if (role.isSystem) return failure('Built-in roles cannot be deleted.');
    if (role._count.users > 0) {
      return failure(`${role._count.users} staff member(s) still use this role. Move them first.`);
    }

    await prisma.userRole.delete({ where: { id: roleId } });

    await recordAudit({
      actor,
      action: 'deleted',
      entity: 'UserRole',
      entityId: roleId,
      summary: `Deleted role “${role.name}”`,
    });

    revalidatePath('/admin/staff');
    return success(undefined, 'Role deleted.');
  } catch (error) {
    return toActionError(error);
  }
}
