# Stage 1: Build the React app
FROM node:22.2.0-slim as build

# Set working directory
WORKDIR /app

# Copy package.json and yarn.lock
COPY package.json yarn.lock ./

# Install dependencies using Yarn
RUN yarn install

# Copy the rest of the application
COPY . ./

# Build the application
RUN yarn build

# Stage 2: Serve the built React app using Nginx
FROM nginx:alpine

# Copy the built React app from the previous stage to the Nginx web root directory
COPY --from=build /app/build /usr/share/nginx/html
