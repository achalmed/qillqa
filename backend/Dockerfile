# API de Qillqa con el motor de PDF: TeX Live (LuaLaTeX + Biber) y las herramientas que usa la API
# (pdftotext/pdftoppm/pdfunite, ImageMagick, ffmpeg). El marco documental se monta en /app/marco_documental.
FROM texlive/texlive:latest

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-venv make poppler-utils imagemagick ffmpeg \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH" PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
