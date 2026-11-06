# The music visualizer app as one container, for the online test version on a rented GPU
# machine (RunPod). Built and smoke-tested by GitHub (.github/workflows/image.yml).
#
# Settings come from the machine's environment, never from this file:
#   ACCOUNTS, SESSION_SECRET (logins), STORAGE_DIR (the kept disk), RENDER_GPU=1 (use the GPU).
#
# The CUDA base image lets the NVIDIA driver libraries that the host injects (graphics and
# Vulkan) work inside the container, so Chrome can draw with the GPU.
FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    NVIDIA_DRIVER_CAPABILITIES=all \
    NEXT_TELEMETRY_DISABLED=1 \
    HYPERFRAMES_TELEMETRY_DISABLED=1

# FFmpeg, Python for the analyzer, the libraries Chrome needs, Vulkan/EGL for the GPU, fonts,
# then Node 22.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg \
      ffmpeg python3 python3-venv python3-pip \
      libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 \
      libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 libpango-1.0-0 libcairo2 \
      libxshmfence1 libx11-xcb1 libxss1 libgtk-3-0 \
      libvulkan1 libegl1 libgles2 libgl1 \
      fonts-liberation fonts-noto-color-emoji \
 && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies first, so code changes don't reinstall them.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# The analyzer's Python environment, the templates' sample assets, HyperFrames' Chrome, and the
# production build.
RUN npm run setup:py \
 && npm run template:assets \
 && npx hyperframes browser ensure \
 && npm run build

# REQUIRE_LOGIN=1: this image never runs without logins; a blank ACCOUNTS stops it instead.
ENV PORT=3000 \
    HOSTNAME=0.0.0.0 \
    STORAGE_DIR=/workspace/storage \
    REQUIRE_LOGIN=1
EXPOSE 3000
CMD ["npm", "start"]
