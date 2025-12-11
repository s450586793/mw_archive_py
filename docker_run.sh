docker rm -f mw-archiver
docker run -d \
-p 8000:8000 \
-v $PWD/data:/app/data \
-v $PWD/logs:/app/logs \
-v $PWD/cookie.txt:/app/cookie.txt \
--name mw-archiver mw-archiver
