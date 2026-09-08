import 'server-only';
import type { SeoSettings, WebsiteSettings } from '@prisma/client';
import { absoluteUrl } from './metadata';

type Json = Record<string, unknown>;

export function organizationSchema(seo: SeoSettings, site: WebsiteSettings): Json {
  const sameAs = [site.linkedinUrl, site.twitterUrl, site.facebookUrl, site.instagramUrl, site.youtubeUrl].filter(
    Boolean,
  );
  return {
    '@context': 'https://schema.org',
    '@type': seo.organizationType || 'Organization',
    name: seo.organizationName || site.siteName,
    url: absoluteUrl('/'),
    ...(seo.organizationLogoUrl || site.logoUrl
      ? { logo: absoluteUrl(seo.organizationLogoUrl ?? site.logoUrl ?? '') }
      : {}),
    ...(site.siteDescription ? { description: site.siteDescription } : {}),
    ...(sameAs.length ? { sameAs } : {}),
    ...(site.contactEmail || site.contactPhone
      ? {
          contactPoint: [
            {
              '@type': 'ContactPoint',
              contactType: 'sales',
              ...(site.contactEmail ? { email: site.contactEmail } : {}),
              ...(site.contactPhone ? { telephone: site.contactPhone } : {}),
            },
          ],
        }
      : {}),
    ...(site.address ? { address: { '@type': 'PostalAddress', streetAddress: site.address } } : {}),
  };
}

export function websiteSchema(site: WebsiteSettings): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: site.siteName,
    url: absoluteUrl('/'),
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${absoluteUrl('/blog')}?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function breadcrumbSchema(items: Array<{ name: string; path: string }>): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function productSchema(input: {
  name: string;
  description: string | null;
  slug: string;
  imageUrl: string | null;
  price: string | null;
  currency: string;
  sku: string | null;
  brand: string;
}): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
    ...(input.imageUrl ? { image: absoluteUrl(input.imageUrl) } : {}),
    ...(input.sku ? { sku: input.sku } : {}),
    brand: { '@type': 'Brand', name: input.brand },
    url: absoluteUrl(`/products/${input.slug}`),
    ...(input.price
      ? {
          offers: {
            '@type': 'Offer',
            price: input.price,
            priceCurrency: input.currency,
            availability: 'https://schema.org/InStock',
            url: absoluteUrl(`/products/${input.slug}`),
          },
        }
      : {}),
  };
}

export function articleSchema(input: {
  title: string;
  description: string | null;
  slug: string;
  imageUrl: string | null;
  publishedAt: Date | null;
  updatedAt: Date;
  authorName: string | null;
  organizationName: string;
  logoUrl: string | null;
}): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: input.title,
    ...(input.description ? { description: input.description } : {}),
    ...(input.imageUrl ? { image: [absoluteUrl(input.imageUrl)] } : {}),
    datePublished: (input.publishedAt ?? input.updatedAt).toISOString(),
    dateModified: input.updatedAt.toISOString(),
    ...(input.authorName ? { author: { '@type': 'Person', name: input.authorName } } : {}),
    publisher: {
      '@type': 'Organization',
      name: input.organizationName,
      ...(input.logoUrl ? { logo: { '@type': 'ImageObject', url: absoluteUrl(input.logoUrl) } } : {}),
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': absoluteUrl(`/blog/${input.slug}`) },
  };
}

export function faqSchema(items: Array<{ question: string; answer: string }>): Json | null {
  const valid = items.filter((i) => i.question.trim() && i.answer.trim());
  if (valid.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: valid.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
      },
    })),
  };
}
