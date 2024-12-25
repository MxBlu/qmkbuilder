FROM node:23-bookworm-slim

# Install deps
RUN apt update && apt install -y python3 python3-pip git rsync python3-venv sudo
RUN python3 -m pip install --break-system-packages pipx

# Install QMK CLI
ENV QMK_CLI_VERSION=1.1.6
RUN pipx install --global qmk

# Run QMK setup just to install deps, cleanup after
RUN qmk setup -y && rm -rf /root/qmk_firmware

# Setup runtime user
RUN adduser qmk
USER qmk

# Clone QMK for runtime use
ENV QMK_FIRMWARE_BAKEDPULL=20241225
RUN qmk setup -y

WORKDIR /server

# Install node deps
COPY package.json package-lock.json .
RUN npm i

ENV HOST_URL=http://localhost:8080

RUN echo $'module.exports = {
	"API": "$HOST_URL/build",
	"PRESETS": "$HOST_URL/presets"
}' > src/const/local.js

# Compile client
COPY deploy.js .
COPY static ./static
COPY src ./src
RUN npm run deploy

# Copy server
COPY server ./server

EXPOSE 80

ENV STATIC="/server/static"
ENV QMK="/home/qmk/qmk_firmware"

CMD node server/index.js