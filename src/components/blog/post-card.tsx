import Link from 'next/link';
import Image from 'next/image';
import type { BlogListItem } from '@/lib/services/blog';
import { formatDate } from '@/lib/utils/format';

export function PostCard({ post, priority }: { post: BlogListItem; priority?: boolean }) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-hairline bg-surface shadow-sm transition-shadow hover:shadow-md">
      <Link href={`/blog/${post.slug}`} className="block aspect-[16/9] overflow-hidden bg-muted/10">
        {post.featuredImage ? (
          <Image
            src={post.featuredImage.url}
            alt={post.featuredImage.altText ?? ''}
            width={post.featuredImage.width ?? 800}
            height={post.featuredImage.height ?? 450}
            priority={priority}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div
            className="h-full w-full bg-gradient-to-br from-brand/15 via-brand/5 to-transparent"
            aria-hidden="true"
          />
        )}
      </Link>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          {post.category ? (
            <Link
              href={`/blog/category/${post.category.slug}`}
              className="rounded-full bg-brand/10 px-2 py-0.5 font-medium text-brand"
            >
              {post.category.name}
            </Link>
          ) : null}
          <time dateTime={post.publishedAt?.toISOString()}>{formatDate(post.publishedAt)}</time>
          <span aria-hidden="true">·</span>
          <span>{post.readingTime} min read</span>
        </div>

        <h3 className="mt-3 font-heading text-lg font-bold leading-snug text-content">
          <Link href={`/blog/${post.slug}`} className="hover:text-brand">
            {post.title}
          </Link>
        </h3>

        {post.excerpt ? (
          <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-muted">{post.excerpt}</p>
        ) : null}

        {post.author ? (
          <p className="mt-5 border-t border-hairline pt-4 text-xs text-muted">By {post.author.name}</p>
        ) : null}
      </div>
    </article>
  );
}
