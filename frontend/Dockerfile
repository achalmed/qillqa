# Web de Qillqa (Vite) y, en el mismo contenedor, el servidor de edición simultánea (Hocuspocus, 127.0.0.1:8001)
# al que la web llega por su proxy /colab. Node 22: corre colab/servidor.ts sin compilar.
FROM node:22-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

EXPOSE 5173
CMD ["sh", "-c", "node colab/servidor.ts & exec npm run dev -- --host 0.0.0.0"]
