#!/bin/sh
# Šalje potpisani APK na server: https://remi.igrajmo.online/remi.apk (fajl nije u git-u, vidi android/README.md).
set -e
APK="android/app-release-signed.apk"
test -f "$APK" || { echo "Nema $APK — prvo napravi aplikaciju (android/README.md)"; exit 1; }
ssh -o ConnectTimeout=10 root@213.199.32.240 "mkdir -p /var/www/remi/downloads"
scp -o ConnectTimeout=10 "$APK" root@213.199.32.240:/var/www/remi/downloads/remi.apk
curl -sI https://remi.igrajmo.online/remi.apk | grep -iE "^HTTP|content-length"
