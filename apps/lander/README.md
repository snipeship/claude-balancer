# ccflare Landing Page

Static landing page for ccflare - showcasing how simple it is to never hit rate limits again.

## 🚀 Getting Started is This Simple

```bash
# Clone and run - that's it!
git clone https://github.com/snipeship/ccflare
cd ccflare
bun install
bun run ccflare
```

That single `bun run ccflare` command gives you:
- ✅ Full proxy server on port 8080
- ✅ Interactive TUI for monitoring
- ✅ Web dashboard at http://localhost:8080/dashboard
- ✅ Real-time analytics and request logs
- ✅ Automatic rate limit handling

## Landing Page Development

### Local Preview

```bash
# Preview the site locally
bun run preview
```

### Build

```bash
# Build the site (copies src to dist)
bun run build
```

## Deploy to Cloudflare Pages

### Option 1: GitHub Integration

1. Push your code to GitHub
2. Go to [Cloudflare Pages](https://pages.cloudflare.com)
3. Connect your GitHub repository
4. Use these build settings:
   - Build command: `cd apps/lander && bun run build`
   - Build output directory: `apps/lander/dist`
   - Root directory: `/`

### Option 2: Direct Upload

1. Build the site locally:
   ```bash
   cd apps/lander
   bun run build
   ```

2. Upload the `dist` folder to Cloudflare Pages

### Option 3: Wrangler CLI

1. Install Wrangler:
   ```bash
   bun add -g wrangler
   ```

2. Deploy:
   ```bash
   cd apps/lander
   bun run build
   wrangler pages deploy dist --project-name=ccflare-landing
   ```

## Features

- Dark theme matching ccflare dashboard
- Mobile responsive
- Security headers configured
- Optimized for performance
- Static HTML/CSS (no JavaScript framework)
- Real screenshots from actual ccflare usage