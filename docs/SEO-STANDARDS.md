# SEO Standards — LuteBox

Reference guide for maintaining and extending the landing page at `docs/index.html`.

---

## Meta Tags

Every page must have all of the following in `<head>`:

```html
<title>Page Title — 50–60 chars, primary keyword near front</title>
<meta name="description" content="140–160 chars. Include primary keyword naturally." />
<meta name="keywords" content="comma, separated, terms" />
<meta name="author" content="CallMeKakashi" />
<meta name="robots" content="index, follow" />
<meta name="theme-color" content="#06020f" />
<meta name="format-detection" content="telephone=no" />
<link rel="canonical" href="https://callmekakashi.github.io/lutebox/[path]/" />
<link rel="sitemap" type="application/xml" href="/lutebox/sitemap.xml" />
<link rel="icon" type="image/svg+xml" href="favicon.svg" />
```

**Rules:**
- Title: 50–60 characters. Never truncated in SERPs. Brand name at the end after a dash.
- Description: 140–160 characters. Written as a sentence, not a keyword list.
- Canonical: Always absolute URL. Must match the actual serving URL exactly.

---

## Open Graph

Required on every page. Controls how the page appears when shared on social platforms.

```html
<meta property="og:type" content="website" />
<meta property="og:url" content="https://callmekakashi.github.io/lutebox/" />
<meta property="og:title" content="50–60 char title" />
<meta property="og:description" content="2–3 sentence description" />
<meta property="og:site_name" content="LuteBox" />
<meta property="og:image" content="https://callmekakashi.github.io/lutebox/og-image.svg" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="Descriptive alt text for the image" />
```

**OG Image requirements:**
- Dimensions: 1200×630 px
- Current file: `docs/og-image.svg`
- For maximum compatibility (Facebook, LinkedIn): also provide a `og-image.png` at the same dimensions and update the `og:image` tag to point to it
- Always include `og:image:alt` — required for accessibility on social platforms

---

## Twitter Card

```html
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:site" content="@CallMeKakashi" />
<meta name="twitter:creator" content="@CallMeKakashi" />
<meta name="twitter:title" content="50–60 char title" />
<meta name="twitter:description" content="Under 200 chars" />
<meta name="twitter:image" content="https://callmekakashi.github.io/lutebox/og-image.svg" />
<meta name="twitter:image:alt" content="Descriptive alt text" />
```

Use `summary_large_image` for landing pages. Use `summary` only for blog posts or small images.

---

## Structured Data (JSON-LD)

Current schema: `SoftwareApplication`. Update the `screenshot` field if a PNG OG image is added.

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "LuteBox",
  "applicationCategory": "MultimediaApplication",
  "operatingSystem": "Windows, macOS, Linux",
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
  "description": "...",
  "url": "https://callmekakashi.github.io/lutebox/",
  "downloadUrl": "https://github.com/CallMeKakashi/lutebox",
  "author": { "@type": "Person", "name": "CallMeKakashi", "url": "https://github.com/CallMeKakashi" },
  "license": "https://opensource.org/licenses/MIT",
  "keywords": "...",
  "screenshot": "https://callmekakashi.github.io/lutebox/og-image.svg"
}
```

Validate at: https://search.google.com/test/rich-results

---

## Heading Hierarchy

One `<h1>` per page. Never skip levels.

```
h1  — Page hero title (one per page, above the fold)
  h2  — Major section headings (How it works, Features, Tech Stack, CTA)
    h3  — Sub-items (step titles, feature card titles)
```

- `<p class="section-label">` decorative caps labels are **not** headings — mark them `aria-hidden="true"`
- Do not use headings for styling purposes; use CSS classes instead

---

## Performance (Core Web Vitals)

### Fonts
Load Google Fonts asynchronously to avoid render-blocking:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" crossorigin />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="preload" as="style" href="[google-fonts-url]" />
<link rel="stylesheet" href="[google-fonts-url]" media="print" onload="this.media='all'" />
<noscript><link rel="stylesheet" href="[google-fonts-url]" /></noscript>
```

Never use a bare `<link rel="stylesheet" href="fonts.googleapis.com/...">` — it blocks rendering.

### CSS
- Main stylesheet (`styles.css`) loads synchronously — keep it small
- Inline critical above-the-fold CSS if the stylesheet exceeds ~14 KB

### Images
- Prefer SVG for icons, logos, and the OG image
- For raster images: use WebP with AVIF fallback via `<picture>`
- Always declare `width` and `height` attributes to prevent layout shift (CLS)
- Use `loading="lazy"` on below-the-fold images

---

## Links

All external links must have:

```html
<a href="https://example.com" rel="noopener noreferrer">...</a>
```

- `noopener` — prevents the new tab from accessing `window.opener` (security)
- `noreferrer` — suppresses the `Referer` header (privacy + implied `noopener`)
- Internal anchor links (`#section-id`) do not need `rel`

---

## Accessibility (affects SEO ranking)

| Element | Requirement |
|---------|-------------|
| `<img>` | Always has `alt` attribute. Empty `alt=""` for purely decorative images. |
| Decorative SVG | `aria-hidden="true"` and `focusable="false"` |
| Informative SVG | `role="img"` + `<title>` child element |
| Icon-only `<a>` or `<button>` | `aria-label` describing the action |
| Form inputs | `<label>` associated via `for`/`id` or `aria-label` |
| Sections | `aria-labelledby` pointing to the section's heading id |
| Landmark roles | `<header role="banner">`, `<main id="main-content">`, `<footer role="contentinfo">` |
| Skip link | Add `<a href="#main-content" class="skip-link">Skip to content</a>` if nav is complex |

---

## Sitemap

File: `docs/sitemap.xml`. Update `<lastmod>` whenever page content changes significantly.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://callmekakashi.github.io/lutebox/</loc>
    <lastmod>YYYY-MM-DD</lastmod>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
```

Submit the sitemap URL to Google Search Console after significant updates:
`https://callmekakashi.github.io/lutebox/sitemap.xml`

---

## robots.txt

File: `docs/robots.txt`. Current content allows all crawlers and points to the sitemap.

```
User-agent: *
Allow: /

Sitemap: https://callmekakashi.github.io/lutebox/sitemap.xml
```

Do not add `Disallow` rules unless there are private pages to hide from indexing.

---

## Checklist for New Pages

- [ ] Title 50–60 chars, primary keyword near front
- [ ] Meta description 140–160 chars
- [ ] `<link rel="canonical">` with absolute URL
- [ ] OG tags: type, url, title, description, site_name, image (1200×630), image:alt
- [ ] Twitter Card tags: card, site, creator, title, description, image, image:alt
- [ ] JSON-LD structured data block
- [ ] Favicon linked (`favicon.svg`)
- [ ] Single `<h1>` above the fold
- [ ] No skipped heading levels
- [ ] All external links have `rel="noopener noreferrer"`
- [ ] Decorative SVGs: `aria-hidden="true"` + `focusable="false"`
- [ ] Informative SVGs: `role="img"` + `<title>`
- [ ] Google Fonts loaded async (media=print/onload pattern)
- [ ] Sitemap `<lastmod>` updated
- [ ] Validated with Google Rich Results Test
- [ ] Validated with Seobility or equivalent crawler
