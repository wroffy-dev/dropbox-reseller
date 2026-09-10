'use client';

import { CategoryTreeManager, type CategoryRow } from '@/components/admin/category-tree-manager';
import { saveBlogCategory, deleteBlogCategory } from '@/lib/actions/blog';

/** Kept for callers that imported this type before the manager was shared. */
export type BlogCategoryRow = CategoryRow;

/**
 * Blog categories, on the shared tree manager.
 *
 * Blog categories gained nesting, so they now use the same component page
 * categories do rather than a near-identical copy. They keep their SEO fields,
 * which page categories do not have.
 */
export function BlogCategoryManager({
  rows,
  canEdit,
  canDelete,
}: {
  rows: CategoryRow[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  return (
    <CategoryTreeManager
      rows={rows}
      canEdit={canEdit}
      canDelete={canDelete}
      urlPrefix="/blog/category/"
      itemLabel="post"
      withSeo
      emptyDescription="Categories create archive pages at /blog/category/…"
      onSave={(id, data) => saveBlogCategory(id, data)}
      // Blog categories have no bulk move-on-delete action; posts simply become
      // uncategorised, which is what deleteBlogCategory already does.
      onDelete={(categoryId) => deleteBlogCategory(categoryId)}
    />
  );
}
