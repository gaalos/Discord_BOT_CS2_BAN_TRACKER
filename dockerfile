FROM node:20

WORKDIR /app

# deps layer (cache optimal)
COPY package*.json ./
RUN npm install

# code
COPY . .

# data folder (OK mais inutile souvent)
RUN mkdir -p /app/data


CMD ["sh", "-c", "node deploy-commands.js && node index.js"]