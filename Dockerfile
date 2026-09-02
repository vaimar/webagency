# Stage 1: Build the React app
FROM node:22-alpine AS build

WORKDIR /app

# Install from the lockfile only. `npm ci` fails loudly if package.json and
# package-lock.json have drifted, and it wipes node_modules first, so the image
# can never be built against a resolution the lockfile does not describe.
COPY package.json package-lock.json ./
RUN npm ci

COPY . ./
RUN npm run build

# Stage 2: Serve the built app using Nginx
FROM nginx:alpine

# Custom Nginx config for SPA routing + API proxy. The security-headers snippet
# is a separate file because nginx.conf `include`s it from two scopes; both land
# in conf.d, but only default.conf is a server block nginx loads directly.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY nginx-security-headers.conf /etc/nginx/conf.d/security-headers.conf

COPY --from=build /app/build /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
