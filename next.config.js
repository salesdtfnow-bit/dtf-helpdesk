/** @type {import('next').NextConfig} */
module.exports = {
  experimental: {
    serverActions: {
      bodySizeLimit: '30mb',
    },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value:
              'frame-ancestors https://admin.shopify.com https://*.myshopify.com https://dtfnow.co.uk https://www.dtfnow.co.uk https://*.dtfnow.co.uk;',
          },
        ],
      },
    ];
  },
};
