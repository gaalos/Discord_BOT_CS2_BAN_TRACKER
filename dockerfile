FROM node:20

WORKDIR /app

# Install deps
COPY package*.json ./
RUN npm install

# Copy full project
COPY . .

# Create DB folder
RUN mkdir -p /app/data

# Permissions (safe in containers)
RUN chmod -R 755 /app

# Start bot (auto deploy + run)
CMD ["sh", "-c", "node deploy-commands.js && node index.js"]