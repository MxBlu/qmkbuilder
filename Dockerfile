FROM node:23-bookworm-slim

# Install deps
RUN apt update && apt install -y python3 python3-pip git rsync python3-venv sudo
RUN python3 -m pip install --break-system-packages pipx

# Install QMK CLI
ENV QMK_CLI_VERSION=1.1.6
RUN pipx install --global qmk

# Setup runtime user
RUN adduser qmk
USER qmk

# Clone QMK for runtime use
ENV QMK_FIRMWARE_BAKEDPULL=20241225
RUN qmk setup -y

# Switch back to root to install compilation tools
USER root
RUN QMK_HOME=/home/qmk/qmk_firmware qmk setup -y
USER qmk

# Make an empty git repo
RUN mkdir /home/qmk/empty_repo && cd /home/qmk/empty_repo && git init

WORKDIR /server

# Install node deps
COPY --chown=qmk:qmk package.json package-lock.json .
RUN npm i

# Copy client source/build tools
COPY --chown=qmk:qmk deploy.js .
COPY --chown=qmk:qmk static ./static
COPY --chown=qmk:qmk src ./src

# Compile client
RUN npm run deploy

# Copy server
COPY server ./server

EXPOSE 80

ENV STATIC="/server/static"
ENV QMK="/home/qmk/qmk_firmware"
ENV EMPTY_REPO="/home/qmk/empty_repo"

CMD node server/index.js