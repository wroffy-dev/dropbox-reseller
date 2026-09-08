import { Check, Minus } from 'lucide-react';
import type { ProductCardsContent, ProductTableContent } from '@/lib/cms/blocks';
import { selectProducts } from '@/lib/services/products';
import { formatMoney } from '@/lib/utils/money';
import { cn } from '@/lib/utils/cn';
import { ProductCard } from '@/components/products/product-card';
import { ProductCta } from '@/components/products/product-cta';
import { SectionHeading, gridColsClass } from './shared';

export async function ProductCardsBlock({
  content,
  inverted,
}: {
  content: ProductCardsContent;
  inverted: boolean;
}) {
  const products = await selectProducts({
    source: content.source,
    productIds: content.productIds,
    categoryId: content.categoryId,
    limit: content.limit,
  });

  if (products.length === 0) {
    return (
      <SectionHeading
        heading={content.heading}
        description="No published products are available yet."
        inverted={inverted}
      />
    );
  }

  return (
    <>
      <SectionHeading
        heading={content.heading}
        description={content.description}
        inverted={inverted}
        className="mb-12"
      />
      <div className={cn('grid items-stretch gap-6', gridColsClass(content.columns))}>
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            billing={content.billing}
            showPrice={content.showPrice}
            showFeatures={content.showFeatures}
            highlight={products.length > 1 && product.isFeatured && products.indexOf(product) === 1}
            ctaLocation="product-cards"
          />
        ))}
      </div>
    </>
  );
}

/**
 * Comparison table.
 *
 * Desktop renders a real <table> with products as columns. Below `lg` it
 * switches to stacked per-product cards — a horizontally scrolling table with
 * five columns is unusable on a phone.
 */
export async function ProductTableBlock({
  content,
  inverted,
}: {
  content: ProductTableContent;
  inverted: boolean;
}) {
  const products = await selectProducts({
    source: content.source,
    productIds: content.productIds,
    categoryId: content.categoryId,
    limit: content.limit,
  });

  if (products.length === 0) {
    return (
      <SectionHeading
        heading={content.heading}
        description="No published products are available yet."
        inverted={inverted}
      />
    );
  }

  const rows: Array<{ label: string; render: (p: (typeof products)[number]) => React.ReactNode }> = [];

  if (content.showStorage) {
    rows.push({ label: 'Storage', render: (p) => p.storage ?? <Minus className="h-4 w-4 text-muted" /> });
  }
  if (content.showUsers) {
    rows.push({
      label: 'Users',
      render: (p) => {
        if (p.minUsers && p.maxUsers) return `${p.minUsers}–${p.maxUsers}`;
        if (p.minUsers) return `${p.minUsers}+`;
        if (p.maxUsers) return `Up to ${p.maxUsers}`;
        return <Minus className="h-4 w-4 text-muted" aria-label="Not applicable" />;
      },
    });
  }
  if (content.showMonthly) {
    rows.push({
      label: 'Monthly',
      render: (p) =>
        p.monthlyPrice ? (
          <span className="font-semibold text-content">{formatMoney(p.monthlyPrice, p.currency)}</span>
        ) : (
          <span className="text-muted">{p.priceNote || 'On request'}</span>
        ),
    });
  }
  if (content.showAnnual) {
    rows.push({
      label: 'Annual',
      render: (p) =>
        p.annualPrice ? (
          <span className="font-semibold text-content">{formatMoney(p.annualPrice, p.currency)}</span>
        ) : (
          <span className="text-muted">{p.priceNote || 'On request'}</span>
        ),
    });
  }

  return (
    <>
      <SectionHeading
        heading={content.heading}
        description={content.description}
        inverted={inverted}
        className="mb-12"
      />

      {/* Desktop: comparison table */}
      <div className="hidden overflow-hidden rounded-2xl border border-hairline bg-surface shadow-sm lg:block">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{content.heading || 'Product comparison'}</caption>
          <thead>
            <tr>
              <th scope="col" className="w-52 border-b border-hairline bg-muted/[0.04] px-5 py-4 text-left">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">Plan</span>
              </th>
              {products.map((product) => (
                <th
                  key={product.id}
                  scope="col"
                  className="border-b border-l border-hairline bg-muted/[0.04] px-5 py-4 text-left align-top"
                >
                  <span className="block font-heading text-base font-bold text-content">{product.name}</span>
                  {product.shortDescription ? (
                    <span className="mt-1 block text-xs font-normal leading-relaxed text-muted">
                      {product.shortDescription}
                    </span>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row" className="border-b border-hairline px-5 py-3.5 text-left font-medium text-muted">
                  {row.label}
                </th>
                {products.map((product) => (
                  <td key={product.id} className="border-b border-l border-hairline px-5 py-3.5 text-content">
                    {row.render(product)}
                  </td>
                ))}
              </tr>
            ))}

            {content.showFeatures ? (
              <tr>
                <th scope="row" className="border-b border-hairline px-5 py-4 text-left align-top font-medium text-muted">
                  Features
                </th>
                {products.map((product) => (
                  <td key={product.id} className="border-b border-l border-hairline px-5 py-4 align-top">
                    <ul className="space-y-2">
                      {product.features.slice(0, 6).map((feature, index) => (
                        <li key={index} className="flex items-start gap-2 text-xs text-muted">
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" aria-hidden="true" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </td>
                ))}
              </tr>
            ) : null}

            <tr>
              <th scope="row" className="px-5 py-4 text-left">
                <span className="sr-only">Actions</span>
              </th>
              {products.map((product) => (
                <td key={product.id} className="border-l border-hairline px-5 py-4">
                  <ProductCta
                    product={product}
                    label={content.ctaLabel}
                    size="sm"
                    className="w-full"
                    ctaLocation="product-table"
                  />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Mobile & tablet: stacked cards */}
      <div className="grid gap-5 sm:grid-cols-2 lg:hidden">
        {products.map((product) => (
          <article
            key={product.id}
            className="rounded-xl border border-hairline bg-surface p-5 shadow-sm"
          >
            <h3 className="font-heading text-base font-bold text-content">{product.name}</h3>
            {product.shortDescription ? (
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{product.shortDescription}</p>
            ) : null}

            <dl className="mt-4 divide-y divide-hairline border-y border-hairline text-sm">
              {rows.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-4 py-2.5">
                  <dt className="text-muted">{row.label}</dt>
                  <dd className="text-right text-content">{row.render(product)}</dd>
                </div>
              ))}
            </dl>

            {content.showFeatures && product.features.length > 0 ? (
              <ul className="mt-4 space-y-2">
                {product.features.slice(0, 5).map((feature, index) => (
                  <li key={index} className="flex items-start gap-2 text-xs text-muted">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" aria-hidden="true" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            <ProductCta
              product={product}
              label={content.ctaLabel}
              className="mt-5 w-full"
              ctaLocation="product-table"
            />
          </article>
        ))}
      </div>
    </>
  );
}
