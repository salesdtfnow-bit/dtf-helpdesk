/** @type {import('next').NextConfig} */
module.exports = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value:
              'frame-ancestors https://admin.shopify.com https://*.myshopify.com;',
          },
        ],
      },
    ];
  },
};
