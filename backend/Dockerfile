FROM node:22-alpine

WORKDIR /

COPY package*.json ./
RUN npm install

#copies rest of files
COPY . . 

EXPOSE 8080

CMD ["node", "index.js"]