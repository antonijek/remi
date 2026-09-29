#!/bin/sh
# Deploy (statički sajt) — engine/dist se pravi NA SERVERU (gitignored).
# Prvi put i nginx + sertifikat:  sh tools/deploy.sh --setup
set -e

VPS_HOST="root@213.199.32.240"
REMOTE_DIR="/var/www/remi"
DOMAIN="remi.igrajmo.online"

if ! git diff --quiet HEAD; then
  echo "!! Imate necommitovane izmene — deploy šalje samo poslednji commit (HEAD)."
fi

echo "==> Šaljem $(git rev-parse --short HEAD) na $VPS_HOST:$REMOTE_DIR"
git archive --format=tar HEAD | ssh -o ConnectTimeout=10 "$VPS_HOST" "mkdir -p $REMOTE_DIR && tar -x -C $REMOTE_DIR"

ssh -o ConnectTimeout=10 "$VPS_HOST" "
  set -e
  cd $REMOTE_DIR/engine
  npm ci --no-audit --no-fund --loglevel=error
  npm run build
  test -f dist/index.js
"

if [ "$1" = "--setup" ]; then
  echo "==> nginx + sertifikat za $DOMAIN"
  ssh -o ConnectTimeout=10 "$VPS_HOST" "
    set -e
    if [ ! -f /etc/nginx/sites-available/$DOMAIN ]; then
      cat > /etc/nginx/sites-available/$DOMAIN <<'NGINX'
server {
    server_name remi.igrajmo.online;
    listen 80;
    root /var/www/remi;
    index remi.html;
    add_header Cache-Control \"no-cache\";
    # samo ono što treba browseru
    location ~ ^/(node_modules|engine/(src|test|tools|node_modules)|tools|docs)/ { return 404; }
    location ~ /\. { return 404; }
    location / { try_files \$uri \$uri/ =404; }
}
NGINX
      ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/$DOMAIN
    fi
    nginx -t
    systemctl reload nginx
    certbot --nginx -d $DOMAIN --non-interactive --agree-tos --redirect
    nginx -t && systemctl reload nginx
  "
fi

echo "==> Gotovo: https://$DOMAIN/"
