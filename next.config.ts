import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "picsum.photos",
        port: "",
        pathname: "/**",
      },
    ],
  },
  webpack: (config, { isServer }) => {
    // Fix for PDFKit and __dirname resolution issues
    if (isServer) {
      config.node = {
        ...config.node,
        __dirname: true,
        __filename: true,
      };
    }

    // Handle font files and other assets that PDFKit might need
    config.module.rules.push({
      test: /\.(afm|ttf|otf|woff|woff2)$/,
      type: 'asset/resource',
      generator: {
        filename: 'static/fonts/[name][ext]',
      },
    });

    return config;
  },
};

export default nextConfig;
