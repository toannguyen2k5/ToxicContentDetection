# docker/dashboard.Dockerfile
# ---- Stage 1: build ----
FROM node:20-alpine AS build

WORKDIR /app

COPY dashboard/package*.json ./
RUN npm install

COPY dashboard/ .
RUN npm run build

# ---- Stage 2: serve bằng nginx ----
FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
# Nếu dùng React Router (client-side routing), thêm config để fallback về index.html
COPY docker/nginx.dashboard.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
