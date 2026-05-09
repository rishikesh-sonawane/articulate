FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY server/package.json server/yarn.lock ./

# Install dependencies
RUN yarn install --production

# Copy source code
COPY server/src ./src
COPY server/tsconfig.json ./

# Build TypeScript
RUN yarn build

# Remove source code for production image (optional)
# RUN rm -rf src

EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

CMD ["node", "dist/server.js"]
