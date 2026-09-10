import Link from 'next/link';
import Image from 'next/image';
import { Check } from 'lucide-react';
import type { PublicProduct } from '@/lib/services/products';
import { formatMoney } from '@/lib/utils/money';
import { cn } from '@/lib/utils/cn';
import { ProductCta } from './product-cta';

/**
 * Product card.
 *
 * The show/hide props default to the original behaviour, so existing callers are
 * unaffected; the CMS product grid passes the admin's own toggles through.
 */
export function ProductCard({
  product,
  billing = 'monthly',
  showPrice = true,
  showFeatures = true,
  showImage = true,
  showDescription = true,
  showCta = true,
  ctaLabel,
  highlight,
  ctaLocation = 'product-card',
}: {
  product: PublicProduct;
  billing?: 'monthly' | 'annual';
  showPrice?: boolean;
  showFeatures?: boolean;
  showImage?: boolean;
  showDescription?: boolean;
  showCta?: boolean;
  ctaLabel?: string;
  highlight?: boolean;
  ctaLocation?: string;
}) {
  const price = billing === 'annual' ? product.annualPrice : product.monthlyPrice;
  const period = billing === 'annual' ? '/year' : '/month';

  return (
    <article
      className={cn(
        'flex flex-col rounded-2xl border bg-surface p-6 transition-shadow',
        highlight ? 'border-brand shadow-lg ring-1 ring-brand/20' : 'border-hairline shadow-sm hover:shadow-md',
      )}
    >
      {highlight ? (
        <span className="mb-4 self-start rounded-full bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand">
          Most popular
        </span>
      ) : null}

      {showImage && product.imageUrl ? (
        <Image
          src={product.imageUrl}
          alt={product.imageAlt ?? product.name}
          width={56}
          height={56}
          loading="lazy"
          className="mb-4 h-14 w-14 rounded-lg object-cover"
        />
      ) : null}

      <h3 className="font-heading text-lg font-bold text-content">
        <Link href={`/products/${product.slug}`} className="hover:text-brand">
          {product.name}
        </Link>
      </h3>

      {showDescription && product.shortDescription ? (
        <p className="mt-2 text-sm leading-relaxed text-muted">{product.shortDescription}</p>
      ) : null}

      {showPrice ? (
        <div className="mt-5">
          {price ? (
            <>
              <p className="flex items-baseline gap-1.5">
                <span className="font-heading text-3xl font-bold tracking-tight text-content">
                  {formatMoney(price, product.currency)}
                </span>
                <span className="text-sm text-muted">{period}</span>
              </p>
              {product.priceSuffix ? <p className="mt-1 text-xs text-muted">{product.priceSuffix}</p> : null}
              {product.compareAtPrice ? (
                <p className="mt-1 text-xs text-muted">
                  <span className="line-through">{formatMoney(product.compareAtPrice, product.currency)}</span>
                  {product.discountPercent ? (
                    <span className="ml-2 font-medium text-emerald-600">Save {product.discountPercent}%</span>
                  ) : null}
                </p>
              ) : null}
            </>
          ) : (
            <p className="font-heading text-2xl font-bold text-content">{product.priceNote || 'Custom pricing'}</p>
          )}
        </div>
      ) : null}

      {showFeatures && product.features.length > 0 ? (
        <ul className="mt-6 space-y-2.5 border-t border-hairline pt-5">
          {product.features.slice(0, 6).map((feature, index) => (
            <li key={index} className="flex items-start gap-2.5 text-sm text-muted">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-auto pt-6">
        {showCta ? (
          <ProductCta product={product} label={ctaLabel} className="w-full" ctaLocation={ctaLocation} />
        ) : null}
        <Link
          href={`/products/${product.slug}`}
          className={cn(
            'block text-center text-xs font-medium text-muted underline-offset-4 hover:text-brand hover:underline',
            showCta && 'mt-3',
          )}
        >
          View full details
        </Link>
      </div>
    </article>
  );
}
