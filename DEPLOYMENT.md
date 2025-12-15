# Deployment Guide for gravitykit.dev

This guide explains how to deploy the unified GravityKit documentation site to `gravitykit.dev`.

## Prerequisites

1. **Domain Configuration**: Ensure `gravitykit.dev` DNS is configured to point to your hosting provider
2. **Repository**: Push the `gravitykit-docs` directory to a Git repository (GitHub recommended)
3. **Node.js**: Version 18 or higher installed

## Deployment Options

### Option 1: Vercel (Recommended)

Vercel provides excellent Docusaurus support with automatic deployments.

#### Initial Setup

1. **Connect Repository**
   - Go to [vercel.com](https://vercel.com)
   - Click "New Project"
   - Import your repository
   - Select the `Products/gravitykit-docs` directory as the root

2. **Configure Build Settings**
   ```
   Build Command: npm run build
   Output Directory: build
   Install Command: npm install
   ```

3. **Add Domain**
   - Go to Project Settings → Domains
   - Add `gravitykit.dev`
   - Follow DNS configuration instructions

4. **Environment Variables** (Optional)
   - Add Algolia search credentials if configured:
     - `ALGOLIA_APP_ID`
     - `ALGOLIA_API_KEY`
     - `ALGOLIA_INDEX_NAME`

#### Automatic Deployments

- Every push to `main` branch triggers automatic deployment
- Preview deployments for pull requests
- Rollback capability from Vercel dashboard

### Option 2: Netlify

Netlify also provides excellent Docusaurus support.

#### Initial Setup

1. **Connect Repository**
   - Go to [netlify.com](https://netlify.com)
   - Click "Add new site" → "Import an existing project"
   - Connect to your Git repository

2. **Build Settings**
   - Base directory: `Products/gravitykit-docs`
   - Build command: `npm run build`
   - Publish directory: `build`

3. **Domain Configuration**
   - Go to Domain settings
   - Add custom domain: `gravitykit.dev`
   - Configure DNS (Netlify provides nameservers)

4. **netlify.toml Configuration**
   - Already included in the repository
   - Handles redirects, headers, and build settings

### Option 3: GitHub Pages

For GitHub Pages deployment:

1. **Repository Setup**
   ```bash
   cd Products/gravitykit-docs
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <your-repo-url>
   git push -u origin main
   ```

2. **Configure GitHub Pages**
   - Repository Settings → Pages
   - Source: GitHub Actions (recommended) or Deploy from branch
   - Custom domain: `gravitykit.dev`

3. **Deploy**
   ```bash
   GIT_USER=<your-github-username> npm run deploy
   ```

4. **DNS Configuration**
   - Add CNAME record: `gravitykit.dev` → `<username>.github.io`
   - Or use A records pointing to GitHub Pages IPs

### Option 4: Self-Hosted

For self-hosted deployment on your own server:

1. **Build Site**
   ```bash
   cd Products/gravitykit-docs
   npm install
   npm run build
   ```

2. **Upload Build Directory**
   - Upload `build/` directory to your web server
   - Point `gravitykit.dev` to the server

3. **Web Server Configuration**

   **Nginx Example:**
   ```nginx
   server {
       listen 80;
       server_name gravitykit.dev;
       root /var/www/gravitykit-docs/build;

       index index.html;

       location / {
           try_files $uri $uri/ /index.html;
       }

       # Cache static assets
       location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
           expires 1y;
           add_header Cache-Control "public, immutable";
       }
   }
   ```

   **Apache Example:**
   ```apache
   <VirtualHost *:80>
       ServerName gravitykit.dev
       DocumentRoot /var/www/gravitykit-docs/build

       <Directory /var/www/gravitykit-docs/build>
           Options -Indexes +FollowSymLinks
           AllowOverride All
           Require all granted

           # Handle client-side routing
           RewriteEngine On
           RewriteBase /
           RewriteRule ^index\.html$ - [L]
           RewriteCond %{REQUEST_FILENAME} !-f
           RewriteCond %{REQUEST_FILENAME} !-d
           RewriteRule . /index.html [L]
       </Directory>
   </VirtualHost>
   ```

## DNS Configuration

### For Vercel or Netlify
Follow the platform-specific DNS instructions provided in their dashboards.

### For GitHub Pages
```
Type: CNAME
Name: gravitykit.dev
Value: <username>.github.io
```

### For Self-Hosted
```
Type: A
Name: gravitykit.dev
Value: <your-server-ip>
```

## SSL/HTTPS

- **Vercel/Netlify**: Automatic SSL via Let's Encrypt
- **GitHub Pages**: Automatic SSL support
- **Self-Hosted**: Use Certbot for Let's Encrypt certificates

```bash
# Self-hosted SSL with Certbot
sudo certbot --nginx -d gravitykit.dev
```

## Continuous Deployment

### Recommended Workflow

1. **Development Branch**
   - Create feature branches for changes
   - Test locally with `npm start`

2. **Pull Requests**
   - Submit PR for review
   - Preview deployments automatically created (Vercel/Netlify)

3. **Main Branch**
   - Merge to main triggers production deployment
   - Automatic build and deploy

### GitHub Actions (Optional)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v3

    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'

    - name: Install dependencies
      run: |
        cd Products/gravitykit-docs
        npm install

    - name: Build
      run: |
        cd Products/gravitykit-docs
        npm run build

    - name: Deploy to Vercel
      uses: amondnet/vercel-action@v20
      with:
        vercel-token: ${{ secrets.VERCEL_TOKEN }}
        vercel-org-id: ${{ secrets.ORG_ID }}
        vercel-project-id: ${{ secrets.PROJECT_ID }}
```

## Post-Deployment

### Verification Checklist

- [ ] Site loads at `https://gravitykit.dev`
- [ ] Navigation works correctly
- [ ] All product documentation accessible
- [ ] Search functionality working (if configured)
- [ ] SSL certificate valid
- [ ] Mobile responsive design working
- [ ] Links to external resources working

### Performance Optimization

1. **CDN Configuration**
   - Vercel/Netlify provide global CDN automatically
   - For self-hosted, consider Cloudflare

2. **Build Optimization**
   ```json
   // docusaurus.config.js
   {
     "future": {
       "experimental_faster": true
     }
   }
   ```

3. **Image Optimization**
   - Use WebP format for images
   - Add images to `static/img` directory
   - Optimize with tools like ImageOptim

### Monitoring

1. **Analytics** (Optional)
   - Add Google Analytics or Plausible in `docusaurus.config.js`

2. **Error Tracking** (Optional)
   - Integrate Sentry for error monitoring

3. **Uptime Monitoring**
   - Use UptimeRobot or similar service
   - Monitor `https://gravitykit.dev`

## Troubleshooting

### Build Failures

```bash
# Clear cache and rebuild
npm run clear
npm install
npm run build
```

### 404 Errors
- Check `docusaurus.config.js` baseUrl setting
- Ensure web server supports client-side routing
- Verify file paths in documentation

### Styling Issues
- Clear browser cache
- Check `src/css/custom.css` for conflicts
- Verify CSS imports in components

## Maintenance

### Regular Updates

```bash
# Update Docusaurus and dependencies
npm update
npm audit fix

# Test locally
npm start

# Rebuild and deploy
npm run build
git add .
git commit -m "Update dependencies"
git push
```

### Adding New Products

See main README.md for instructions on adding new products to the documentation.

## Support

For deployment issues:
- Check [Docusaurus deployment documentation](https://docusaurus.io/docs/deployment)
- Review hosting provider documentation
- Contact GravityKit infrastructure team