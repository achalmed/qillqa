# API de Qillqa con el motor de PDF: TeX Live (LuaLaTeX + Biber) y las herramientas que usa la API
# (pdftotext/pdftoppm/pdfunite, ImageMagick, ffmpeg). Arma la misma disposición del desarrollo: cada repositorio de la
# plataforma en /plataforma/<nombre> (los trae docker-compose.yml por `additional_contexts`), instalado en modo editable
# sin dependencias (sus versiones son las de Qillqa); el marco documental es el de Qillqasqa.
FROM texlive/texlive:latest

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-venv make poppler-utils imagemagick ffmpeg \
 && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH" PYTHONUNBUFFERED=1

WORKDIR /plataforma/qillqa/backend
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY --from=tiqsi . /plataforma/tiqsi
COPY --from=rikchay . /plataforma/rikchay
COPY --from=wayra . /plataforma/wayra
COPY --from=ruray . /plataforma/ruray
COPY --from=tullpu . /plataforma/tullpu
COPY --from=kuyuy . /plataforma/kuyuy
COPY --from=awana . /plataforma/awana
COPY --from=qhawana . /plataforma/qhawana
COPY --from=yupay . /plataforma/yupay
COPY --from=minka . /plataforma/minka
COPY --from=rimay . /plataforma/rimay
COPY --from=punku . /plataforma/punku
COPY --from=qillqasqa . /plataforma/qillqasqa
RUN pip install --no-cache-dir --no-deps -e /plataforma/tiqsi -e /plataforma/rikchay -e /plataforma/wayra -e /plataforma/ruray -e /plataforma/tullpu -e /plataforma/kuyuy -e /plataforma/awana -e /plataforma/qhawana -e /plataforma/yupay -e /plataforma/minka -e /plataforma/rimay -e /plataforma/punku -e /plataforma/qillqasqa

COPY app ./app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
