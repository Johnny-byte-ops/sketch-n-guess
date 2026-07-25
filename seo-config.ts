import type { Metadata } from 'next';

// SEO settings for your site — the source of truth for how it appears in search
// results and when shared. Edit these values here or from the SEO tab in Coddy;
// the title/description below flow into every page via app/layout.tsx.
export const seo = {
  title: "My App",
  description: "A web app built with Coddy.",
  // Absolute URL of a social-share image (ideally 1200×630), or '' for none.
  ogImage: "",
};

export const metadata: Metadata = {
  title: seo.title,
  description: seo.description,
  ...(seo.ogImage
    ? {
        openGraph: { title: seo.title, description: seo.description, images: [seo.ogImage] },
        twitter: { card: 'summary_large_image', title: seo.title, description: seo.description, images: [seo.ogImage] },
      }
    : {}),
};
