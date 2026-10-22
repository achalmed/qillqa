# Web de Qillqa (Vite) y, en el mismo contenedor, el servidor de edición simultánea de Qillqasqa (Hocuspocus,
# 127.0.0.1:8001) al que la web llega por su proxy /colab. Node 22: corre web/colab/servidor.ts sin compilar. Los paquetes
# web de la plataforma llegan como en el desarrollo (`file:../../<nombre>/web`): cada repositorio en /plataforma/<nombre>.
FROM node:22-alpine

COPY --from=tiqsi . /plataforma/tiqsi
COPY --from=rikchay . /plataforma/rikchay
COPY --from=wayra . /plataforma/wayra
COPY --from=tullpu . /plataforma/tullpu
COPY --from=kuyuy . /plataforma/kuyuy
COPY --from=awana . /plataforma/awana
COPY --from=qhawana . /plataforma/qhawana
COPY --from=yupay . /plataforma/yupay
COPY --from=minka . /plataforma/minka
COPY --from=rimay . /plataforma/rimay
COPY --from=punku . /plataforma/punku
COPY --from=qillqasqa . /plataforma/qillqasqa
# Las dependencias del servidor de colab son las de la raíz de Qillqasqa.
RUN cd /plataforma/qillqasqa && npm ci --no-audit --no-fund

WORKDIR /plataforma/qillqa/frontend
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .

EXPOSE 5173
CMD ["sh", "-c", "node /plataforma/qillqasqa/web/colab/servidor.ts & exec npm run dev -- --host 0.0.0.0"]
