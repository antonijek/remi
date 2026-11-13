# Remi za Android (APK)

Omotač oko sajta (Trusted Web Activity, isto kao Lora i Preferans): otvara https://remi.igrajmo.online preko
celog ekrana. Izmene na sajtu važe odmah; novi APK treba samo za ikonicu, ime, boje ili paket.

- Paket `online.igrajmo.remi`, podešavanja u `twa-manifest.json`.
- Ključ za potpis je ISTI kao za Loru, van projekta: `D:\Lora-android-kljuc\lora.keystore` (alias `lora`,
  lozinka u `lozinka.txt`, 4. red posle dvotačke).
- Server daje `/.well-known/assetlinks.json` i `/remi.apk` (server/src/androidApp.ts). APK je u
  `/var/www/remi/downloads/`, ne u git-u.
- Nova verzija: isto kao Preferans (`D:\preferans\android\README.md`): `bubblewrap update`, `bubblewrap build`
  (aab greška „jarsigner“ je nebitna), pa `sh tools/apk-upload.sh`.
