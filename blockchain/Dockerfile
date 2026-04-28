FROM node:20-alpine

WORKDIR /blockchain

# Install dependencies as a separate layer for caching
COPY package.json package-lock.json* ./
RUN npm ci --prefer-offline

# Copy source
COPY . .

# Compile contracts so artifacts are ready before the node starts
RUN npx hardhat compile
