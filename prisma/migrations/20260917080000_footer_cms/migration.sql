-- Footer CMS control.
--
-- Adds per-column visibility and a nofollow flag to navigation, turns the five
-- fixed social URL columns into an ordered SocialLink table, and gives
-- WebsiteSettings the footer branding, newsletter and appearance fields.
--
-- Order matters here: SocialLink is created and backfilled from
-- WebsiteSettings BEFORE those columns are dropped, so no configured profile
-- URL is lost. Prisma's generated draft dropped them first.

-- AlterTable
ALTER TABLE "Navigation" ADD COLUMN     "isVisible" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "NavigationItem" ADD COLUMN     "isNoFollow" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SocialLink" (
    "id" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SocialLink_isVisible_sortOrder_idx" ON "SocialLink"("isVisible", "sortOrder");

-- Backfill: every social URL an admin had configured becomes a row, in the
-- order the old footer rendered them. A blank column produces no row.
INSERT INTO "SocialLink" ("id", "network", "label", "url", "sortOrder", "isVisible", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    source."network",
    source."label",
    source."url",
    source."sortOrder",
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "WebsiteSettings" settings
CROSS JOIN LATERAL (
    VALUES
        ('linkedin',  'LinkedIn',  settings."linkedinUrl",  10),
        ('x',         'X',         settings."twitterUrl",   20),
        ('facebook',  'Facebook',  settings."facebookUrl",  30),
        ('instagram', 'Instagram', settings."instagramUrl", 40),
        ('youtube',   'YouTube',   settings."youtubeUrl",   50)
) AS source("network", "label", "url", "sortOrder")
WHERE source."url" IS NOT NULL AND btrim(source."url") <> '';

-- AlterTable
ALTER TABLE "WebsiteSettings" DROP COLUMN "facebookUrl",
DROP COLUMN "instagramUrl",
DROP COLUMN "linkedinUrl",
DROP COLUMN "twitterUrl",
DROP COLUMN "youtubeUrl",
ADD COLUMN     "footerBackground" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "footerButtonBg" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "footerButtonText" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "footerColumnGap" TEXT NOT NULL DEFAULT '2.5rem',
ADD COLUMN     "footerDividerColor" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "footerHeadingColor" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "footerInputBg" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "footerInputBorder" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "footerLinkColor" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "footerLinkHoverColor" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "footerLogoUrl" TEXT,
ADD COLUMN     "footerLogoWidth" TEXT NOT NULL DEFAULT '9rem',
ADD COLUMN     "footerNewsletterButtonLabel" TEXT NOT NULL DEFAULT 'Send',
ADD COLUMN     "footerNewsletterDescription" TEXT,
ADD COLUMN     "footerNewsletterHeading" TEXT NOT NULL DEFAULT 'Stay updated',
ADD COLUMN     "footerNewsletterPlaceholder" TEXT NOT NULL DEFAULT 'Enter your email',
ADD COLUMN     "footerNewsletterSuccess" TEXT NOT NULL DEFAULT 'Thanks — you are on the list.',
ADD COLUMN     "footerPaddingBottom" TEXT NOT NULL DEFAULT '2.5rem',
ADD COLUMN     "footerPaddingTop" TEXT NOT NULL DEFAULT '4rem',
ADD COLUMN     "footerRowGap" TEXT NOT NULL DEFAULT '2.5rem',
ADD COLUMN     "footerShowDescription" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "footerShowLogo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "footerTextColor" TEXT NOT NULL DEFAULT '';
