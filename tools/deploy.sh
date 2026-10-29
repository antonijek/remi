#!/bin/sh
# Deploy Remija: kod → server (git archive), build engine-a i servera NA SERVERU,
# pm2 proces remi-server (port 3005). Build mora da uspe pre restarta.
# Prvi put (ili promena nginx-a):  sh tools/deploy.sh --setup
#   nginx prosleđuje sve na 127.0.0.1:3005 (server sam deli samo javne fajlove), HTTPS sertifikat.
set -e

VPS_HOST="root@213.199.32.240"
REMOTE_DIR="/var/www/remi"
DOMAIN="remi.igrajmo.online"
PORT=3005

if ! git diff --quiet HEAD; then
  echo "!! Imate necommitovane izmene — deploy šalje samo poslednji commit (HEAD)."
fi

echo "==> Šaljem $(git rev-parse --short HEAD) na $VPS_HOST:$REMOTE_DIR"
git archive --format=tar HEAD | ssh -o ConnectTimeout=10 "$VPS_HOST" "mkdir -p $REMOTE_DIR && tar -x -C $REMOTE_DIR"

ssh -o ConnectTimeout=10 "$VPS_HOST" "
  set -e
  cd $REMOTE_DIR
  if [ ! -f server/.env ]; then
    echo '==> Pravim server/.env (JWT_SECRET iz preferansa, ne ide kroz git)'
    SECRET_LINE=\$(grep '^JWT_SECRET=' /var/www/preferans/server/.env)
    printf 'PORT=$PORT\nAUTH_URL=http://127.0.0.1:3001\n%s\nDB_PATH=$REMOTE_DIR/server/remi.db\n' \"\$SECRET_LINE\" > server/.env
    chmod 600 server/.env
  fi
  echo '==> Build engine'
  cd engine && npm ci --no-audit --no-fund --loglevel=error && npm run build && cd ..
  echo '==> Build server'
  cd server && npm ci --no-audit --no-fund --loglevel=error && npm run build
  test -f dist/index.js && test -f dist/socket.js && test -f ../engine/dist/index.js
  if pm2 describe remi-server >/dev/null 2>&1; then pm2 reload remi-server; else pm2 start ecosystem.config.cjs; fi
  pm2 save >/dev/null
  sleep 2
  curl -fsS http://127.0.0.1:$PORT/api/health && echo
  pm2 logs remi-server --lines 8 --nostream
"

if [ "$1" = "--setup" ]; then
  echo "==> nginx za $DOMAIN → 127.0.0.1:$PORT"
  ssh -o ConnectTimeout=10 "$VPS_HOST" "
    set -e
    CONF=/etc/nginx/sites-available/$DOMAIN
    [ -f \$CONF ] && cp \$CONF /root/nginx-$DOMAIN-\$(date +%Y%m%d%H%M%S)
    PROXY='
    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \"upgrade\";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 90;
    }'
    if [ -f /etc/letsencrypt/live/$DOMAIN/fullchain.pem ]; then
      cat > \$CONF <<NGINX
server {
    server_name $DOMAIN;
\$PROXY
    listen 443 ssl http2;
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}
server {
    server_name $DOMAIN;
    listen 80;
    return 301 https://\\\$host\\\$request_uri;
}
NGINX
    else
      printf 'server {\n    server_name $DOMAIN;\n    listen 80;\n%s\n}\n' \"\$PROXY\" > \$CONF
    fi
    ln -sf \$CONF /etc/nginx/sites-enabled/$DOMAIN
    if ! nginx -t; then
      echo '!! nginx podešavanje nije ispravno — vraćam staro'
      LAST=\$(ls -t /root/nginx-$DOMAIN-* 2>/dev/null | head -1)
      [ -n \"\$LAST\" ] && cp \$LAST \$CONF
      nginx -t && exit 1
    fi
    systemctl reload nginx
    if [ ! -f /etc/letsencrypt/live/$DOMAIN/fullchain.pem ]; then
      certbot --nginx -d $DOMAIN --non-interactive --agree-tos --redirect
      # HTTP/2 kao na ostalim sajtovima (certbot upisuje samo 'listen 443 ssl')
      sed -i 's/listen 443 ssl; # managed by Certbot/listen 443 ssl http2; # managed by Certbot/' \$CONF
      nginx -t && systemctl reload nginx
    fi
  "
fi

echo "==> Gotovo: https://$DOMAIN/"
