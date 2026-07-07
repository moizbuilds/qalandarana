import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // The OG card route (/api/card/[id]) reads the vendored font files at runtime
  // with fs.readFile. Next's dependency tracer doesn't follow a dynamic readFile
  // path, so on Vercel the fonts would be missing from the serverless bundle and
  // the route would 500. This tells the tracer to include them explicitly.
  outputFileTracingIncludes: {
    '/api/card/[id]': ['./src/assets/**'],
  },
}

export default nextConfig
