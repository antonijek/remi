// Uređaj, pregledač i sistem iz User-Agent zaglavlja — za admin pregled poruka igrača.

export function parseAgent(ua: string): { device: string; browser: string; os: string } {
  const device = /iPad|Tablet/i.test(ua) ? 'tablet' : /Mobi|Android|iPhone/i.test(ua) ? 'telefon' : 'računar';
  const browser =
    /FBAN|FBAV|FB_IAB/.test(ua) ? 'Facebook (u aplikaciji)' :
    /Instagram/.test(ua) ? 'Instagram (u aplikaciji)' :
    /Viber/i.test(ua) ? 'Viber (u aplikaciji)' :
    /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung' :
    /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Chrome|CriOS/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : 'drugi';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' :
    /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'drugi';
  return { device, browser, os };
}
