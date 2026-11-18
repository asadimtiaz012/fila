# FILA Disruptor II — Store

A static, framework-free brand store with a scroll-driven 3D hero: the Disruptor II rotates as you scroll (a pre-rendered frame sequence drawn to a `<canvas>`), followed by a complete shop with cart, wishlist, quick view, search and checkout.

## Run locally

Any static server works (the site fetches `frames/manifest.json`, so opening the file directly with `file://` is not supported):

```bash
python -m http.server 8080
# or
npx serve .
```

Then open http://localhost:8080.

## Deploy to Vercel (3 lines)

```bash
npm i -g vercel
cd fila-site
vercel --prod
```

No build step and no framework preset are needed. On Netlify, drag the folder into the dashboard or run `netlify deploy --prod --dir .`.

## Structure

```
index.html            page markup
css/style.css         all styles (mobile first)
js/main.js            frame engine, hero copy timeline, store logic
data/products.js      product catalog (window.FILA_PRODUCTS)
frames/desktop/       1920x1080 WebP sequence (24 fps)
frames/mobile/        720px-wide fixed-crop WebP sequence (12 fps)
frames/manifest.json  frame counts, sizes, padding, extension (read at runtime)
images/products/      product images used by the site (WebP)
images/originals/     original JPG product photos
extract-frames.sh     regenerates frames, manifest and the Disruptor II stills
```

## Regenerating frames

```bash
./extract-frames.sh            # uses ./shoe.mp4 (or ./shoe.mp4.mp4)
./extract-frames.sh path/to/video.mp4
```

Requires ffmpeg (with libwebp) and Python 3 with Pillow + numpy (for the two product stills). Quality, fps and the mobile crop window are variables at the top of the script.

The mobile crop is one fixed window for the whole sequence. The shoe spans about 990 px of the 1280 px source width, so a 4:5, 3:4 or even 1:1 window would cut off the toe or heel in some frames. The script uses a 1120x700 window, which keeps the whole shoe in every frame with about 60 px of padding. On phones the frame is drawn full width in the upper part of the screen and its edges fade into the page, so the shoe stays whole and the copy sits below it.

## Product images and slugs

Images live in `images/products/<slug>-1.webp` (main) and optionally `<slug>-2.webp` (second view, shown on hover and in quick view). Cards use a 3:4 frame with `object-fit: cover`, so use portrait 3:4 images (about 900x1200).

| Slug | Product | Category |
|---|---|---|
| `disruptor-ii` | Disruptor II | Unisex (Women, Men) |
| `ray-tracer-tr2` | Ray Tracer TR2 | Women |
| `venom-97` | Venom 97 | Men |
| `grant-hill-2` | Grant Hill 2 | Men |
| `mindblower` | Mindblower | Men |
| `original-fitness` | Original Fitness | Men |
| `oakmont-tr` | Oakmont TR | Women, Kids |
| `renno-platform` | Renno Platform | Women |
| `tennis-88` | Tennis 88 | Kids |

- Replacing an image: drop a new `<slug>-1.webp` into `images/products/`. It shows up immediately.
- Adding a hover image: add `<slug>-2.webp` and set `images: 2` for that product in `data/products.js`.
- Adding a product: add an entry to `data/products.js` and its `<slug>-1.webp`. If an image is missing or fails to load, the card shows a styled dark tile in the product's colors instead of a broken image.

Converting a new photo to WebP:

```bash
ffmpeg -i new-shoe.jpg -vf scale=900:-2 -quality 82 images/products/new-shoe-1.webp
```

## Notes

- GSAP, ScrollTrigger, Flip and Lenis load from CDNs. If a CDN is unavailable the site still works: the hero copy falls back to a built-in scroll handler and filtering happens without animation.
- Smooth scrolling (Lenis) is used on desktop with a mouse only; touch devices keep native scrolling.
- `prefers-reduced-motion` shows a static hero image and the hero copy as plain stacked sections.
- Cart, wishlist and newsletter state are kept in `localStorage`. Checkout is frontend-only and shows an order confirmation. Connect a payment provider before taking real orders.
