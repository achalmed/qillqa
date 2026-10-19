# =====================================================================
#  latex/Dockerfile  --  Motor documental del SGDP
# ---------------------------------------------------------------------
#  TeX Live completo (incluye LuaLaTeX + fontspec) mas las dos unicas
#  dependencias externas de scripts/build.sh del Marco Documental:
#  bash (ya viene) y python3 (nombrado institucional del PDF).
#
#  El framework se monta en /framework de SOLO LECTURA; las
#  compilaciones trabajan sobre una copia en /data/documentos.
# =====================================================================
FROM texlive/texlive:latest

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /data/documentos

CMD ["sleep", "infinity"]
