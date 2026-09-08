'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { X } from 'lucide-react';
import { createBlogPost, updateBlogPost } from '@/lib/actions/blog';
import { Card, CardBody } from '@/components/ui/card';
import { Field, Input, Select, Textarea, Switch } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { MediaPicker } from '@/components/admin/media-picker';
import { RichTextEditor } from '@/components/cms/rich-text-editor';
import { useToast } from '@/components/ui/toast';
import { Spinner } from '@/components/ui/icons';
import { slugify } from '@/lib/utils/slug';
import { readingTimeMinutes } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

export type PostFormValues = {
  id?: string;
  title: string;
  slug: string;
  status: string;
  publishedAt: string;
  excerpt: string;
  content: string;
  isFeatured: boolean;
  featuredImageId: string | null;
  categoryId: string;
  authorId: string;
  tags: string[];
  relatedIds: string[];
  seoTitle: string;
  seoDescription: string;
  canonicalUrl: string;
  noIndex: boolean;
  ogTitle: string;
  ogDescription: string;
  ogImageId: string | null;
};

export const EMPTY_POST: PostFormValues = {
  title: '',
  slug: '',
  status: 'DRAFT',
  publishedAt: '',
  excerpt: '',
  content: '',
  isFeatured: false,
  featuredImageId: null,
  categoryId: '',
  authorId: '',
  tags: [],
  relatedIds: [],
  seoTitle: '',
  seoDescription: '',
  canonicalUrl: '',
  noIndex: false,
  ogTitle: '',
  ogDescription: '',
  ogImageId: null,
};

const TABS = [
  { id: 'content', label: 'Content' },
  { id: 'organise', label: 'Organise' },
  { id: 'seo', label: 'SEO & sharing' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function PostForm({
  initial,
  categories,
  authors,
  posts,
  canPublish,
  canEdit,
  mode,
}: {
  initial: PostFormValues;
  categories: Array<{ id: string; name: string }>;
  authors: Array<{ id: string; name: string }>;
  posts: Array<{ id: string; title: string }>;
  canPublish: boolean;
  canEdit: boolean;
  mode: 'create' | 'edit';
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [values, setValues] = React.useState(initial);
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});
  const [pending, setPending] = React.useState(false);
  const [tab, setTab] = React.useState<TabId>('content');
  const [tagInput, setTagInput] = React.useState('');
  const [slugTouched, setSlugTouched] = React.useState(mode === 'edit');

  const set = <K extends keyof PostFormValues>(key: K, value: PostFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  function addTag(raw: string) {
    const name = raw.trim().replace(/,+$/, '');
    if (!name || values.tags.includes(name)) return;
    set('tags', [...values.tags, name]);
    setTagInput('');
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setErrors({});

    const data = new FormData();
    const simple: Array<keyof PostFormValues> = [
      'title', 'slug', 'status', 'publishedAt', 'excerpt', 'content', 'categoryId',
      'authorId', 'seoTitle', 'seoDescription', 'canonicalUrl', 'ogTitle', 'ogDescription',
    ];
    for (const key of simple) data.set(key, String(values[key] ?? ''));
    data.set('isFeatured', String(values.isFeatured));
    data.set('noIndex', String(values.noIndex));
    data.set('featuredImageId', values.featuredImageId ?? '');
    data.set('ogImageId', values.ogImageId ?? '');
    data.set('tags', JSON.stringify(values.tags));
    data.set('relatedIds', JSON.stringify(values.relatedIds));

    const result =
      mode === 'create' ? await createBlogPost(data) : await updateBlogPost(initial.id!, data);
    setPending(false);

    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      toast(result.error, 'error');
      return;
    }
    toast(result.message ?? 'Saved.');
    if (mode === 'create' && result.data && 'id' in result.data) {
      router.push(`/admin/blog/${(result.data as { id: string }).id}`);
    } else {
      router.refresh();
    }
  }

  const availableRelated = posts.filter(
    (p) => p.id !== initial.id && !values.relatedIds.includes(p.id),
  );

  return (
    <form onSubmit={onSubmit} className="grid gap-6 xl:grid-cols-[1fr_22rem]">
      <div className="min-w-0 xl:order-1">
        <Card>
          <div className="flex items-center gap-1 border-b border-hairline px-3 py-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-pressed={tab === t.id}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm transition-colors',
                  tab === t.id ? 'bg-brand/10 font-medium text-brand' : 'text-muted hover:text-content',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <CardBody className="space-y-4">
            <fieldset disabled={!canEdit || pending} className="space-y-4">
              {tab === 'content' ? (
                <>
                  <Field label="Title" htmlFor="post-title" required error={errors.title}>
                    <Input
                      id="post-title"
                      value={values.title}
                      required
                      onChange={(e) => {
                        set('title', e.target.value);
                        if (!slugTouched) set('slug', slugify(e.target.value));
                      }}
                    />
                  </Field>

                  <Field label="URL" htmlFor="post-slug" error={errors.slug} hint="/blog/…">
                    <Input
                      id="post-slug"
                      value={values.slug}
                      onChange={(e) => {
                        setSlugTouched(true);
                        set('slug', e.target.value);
                      }}
                      onBlur={(e) => set('slug', slugify(e.target.value))}
                    />
                  </Field>

                  <Field
                    label="Excerpt"
                    htmlFor="post-excerpt"
                    hint="Shown on cards and used as the meta description fallback. Generated automatically if left blank."
                  >
                    <Textarea
                      id="post-excerpt"
                      rows={3}
                      value={values.excerpt}
                      onChange={(e) => set('excerpt', e.target.value)}
                    />
                  </Field>

                  <Field
                    label="Content"
                    hint={`About ${readingTimeMinutes(values.content)} min read.`}
                  >
                    <RichTextEditor
                      value={values.content}
                      onChange={(v) => set('content', v)}
                      rows={22}
                    />
                  </Field>
                </>
              ) : null}

              {tab === 'organise' ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Category" htmlFor="post-category">
                      <Select
                        id="post-category"
                        value={values.categoryId}
                        onChange={(e) => set('categoryId', e.target.value)}
                      >
                        <option value="">Uncategorised</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Author" htmlFor="post-author">
                      <Select
                        id="post-author"
                        value={values.authorId}
                        onChange={(e) => set('authorId', e.target.value)}
                      >
                        <option value="">No author</option>
                        {authors.map((author) => (
                          <option key={author.id} value={author.id}>
                            {author.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>

                  <Field label="Tags" htmlFor="post-tags" hint="Press Enter or comma to add.">
                    <div className="space-y-2">
                      {values.tags.length > 0 ? (
                        <ul className="flex flex-wrap gap-1.5">
                          {values.tags.map((tag) => (
                            <li key={tag}>
                              <span className="inline-flex items-center gap-1 rounded-full bg-muted/10 py-1 pl-2.5 pr-1 text-xs text-content">
                                {tag}
                                <button
                                  type="button"
                                  onClick={() => set('tags', values.tags.filter((t) => t !== tag))}
                                  aria-label={`Remove tag ${tag}`}
                                  className="rounded-full p-0.5 text-muted hover:bg-muted/20 hover:text-content"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      <Input
                        id="post-tags"
                        value={tagInput}
                        placeholder="Migration, Security…"
                        onChange={(e) => {
                          if (e.target.value.endsWith(',')) addTag(e.target.value);
                          else setTagInput(e.target.value);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addTag(tagInput);
                          }
                        }}
                        onBlur={() => addTag(tagInput)}
                      />
                    </div>
                  </Field>

                  <Field label="Related posts" hint="Up to six. Shown at the end of the article.">
                    <div className="space-y-2">
                      {values.relatedIds.length > 0 ? (
                        <ul className="space-y-1.5">
                          {values.relatedIds.map((id) => (
                            <li
                              key={id}
                              className="flex items-center gap-2 rounded-lg border border-hairline px-3 py-2"
                            >
                              <span className="min-w-0 flex-1 truncate text-sm text-content">
                                {posts.find((p) => p.id === id)?.title ?? 'Removed post'}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  set('relatedIds', values.relatedIds.filter((v) => v !== id))
                                }
                                aria-label="Remove related post"
                                className="rounded p-1 text-muted hover:bg-red-50 hover:text-red-600"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-muted">
                          None chosen — posts from the same category are used instead.
                        </p>
                      )}
                      {values.relatedIds.length < 6 ? (
                        <Select
                          value=""
                          aria-label="Add a related post"
                          onChange={(e) => {
                            if (e.target.value) {
                              set('relatedIds', [...values.relatedIds, e.target.value]);
                              e.target.value = '';
                            }
                          }}
                        >
                          <option value="">Add a related post…</option>
                          {availableRelated.map((post) => (
                            <option key={post.id} value={post.id}>
                              {post.title}
                            </option>
                          ))}
                        </Select>
                      ) : null}
                    </div>
                  </Field>
                </>
              ) : null}

              {tab === 'seo' ? (
                <>
                  <Field
                    label="SEO title"
                    htmlFor="post-seo-title"
                    hint={`${values.seoTitle.length}/60 characters used.`}
                  >
                    <Input
                      id="post-seo-title"
                      value={values.seoTitle}
                      placeholder={values.title}
                      onChange={(e) => set('seoTitle', e.target.value)}
                    />
                  </Field>
                  <Field
                    label="Meta description"
                    htmlFor="post-seo-description"
                    hint={`${values.seoDescription.length} characters. Falls back to the excerpt.`}
                  >
                    <Textarea
                      id="post-seo-description"
                      rows={3}
                      value={values.seoDescription}
                      placeholder={values.excerpt}
                      onChange={(e) => set('seoDescription', e.target.value)}
                    />
                  </Field>
                  <Field label="Canonical URL" htmlFor="post-canonical">
                    <Input
                      id="post-canonical"
                      value={values.canonicalUrl}
                      onChange={(e) => set('canonicalUrl', e.target.value)}
                    />
                  </Field>
                  <Field label="Open Graph title" htmlFor="post-og-title">
                    <Input
                      id="post-og-title"
                      value={values.ogTitle}
                      placeholder={values.seoTitle || values.title}
                      onChange={(e) => set('ogTitle', e.target.value)}
                    />
                  </Field>
                  <Field label="Open Graph description" htmlFor="post-og-description">
                    <Textarea
                      id="post-og-description"
                      rows={2}
                      value={values.ogDescription}
                      onChange={(e) => set('ogDescription', e.target.value)}
                    />
                  </Field>
                  <Field label="Social share image" hint="Falls back to the featured image.">
                    <MediaPicker
                      value={values.ogImageId}
                      onChange={(id) => set('ogImageId', id)}
                      label="OG image"
                    />
                  </Field>
                  <div className="rounded-lg border border-hairline p-4">
                    <Switch
                      checked={values.noIndex}
                      onChange={(next) => set('noIndex', next)}
                      label="Hide from search engines (noindex)"
                    />
                  </div>
                </>
              ) : null}
            </fieldset>
          </CardBody>
        </Card>
      </div>

      <div className="min-w-0 space-y-6 xl:order-2">
        <Card>
          <CardBody className="space-y-4">
            <fieldset disabled={!canEdit || pending} className="space-y-4">
              <Field label="Status" htmlFor="post-status">
                <Select id="post-status" value={values.status} onChange={(e) => set('status', e.target.value)}>
                  <option value="DRAFT">Draft</option>
                  {canPublish ? <option value="PUBLISHED">Published</option> : null}
                  {canPublish ? <option value="SCHEDULED">Scheduled</option> : null}
                  <option value="ARCHIVED">Archived</option>
                </Select>
              </Field>

              <Field
                label={values.status === 'SCHEDULED' ? 'Publish at' : 'Published date'}
                htmlFor="post-published"
                error={errors.publishedAt}
                required={values.status === 'SCHEDULED'}
              >
                <Input
                  id="post-published"
                  type="datetime-local"
                  value={values.publishedAt}
                  onChange={(e) => set('publishedAt', e.target.value)}
                />
              </Field>

              <Field label="Featured image" hint="Recommended 1200×675.">
                <MediaPicker
                  value={values.featuredImageId}
                  onChange={(id) => set('featuredImageId', id)}
                  label="Featured image"
                />
              </Field>

              <div className="rounded-lg border border-hairline p-4">
                <Switch
                  checked={values.isFeatured}
                  onChange={(next) => set('isFeatured', next)}
                  label="Featured post"
                />
              </div>
            </fieldset>
          </CardBody>

          {canEdit ? (
            <div className="flex justify-end gap-2 border-t border-hairline bg-muted/[0.03] px-4 py-3 sm:px-5">
              <Link
                href="/admin/blog"
                className="rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:text-content"
              >
                Cancel
              </Link>
              <Button type="submit" disabled={pending}>
                {pending ? (
                  <>
                    <Spinner className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Saving…
                  </>
                ) : mode === 'create' ? (
                  'Create post'
                ) : (
                  'Save post'
                )}
              </Button>
            </div>
          ) : null}
        </Card>
      </div>
    </form>
  );
}
