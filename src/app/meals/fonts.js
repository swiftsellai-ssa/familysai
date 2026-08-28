const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,600;0,9..144,700;1,9..144,500&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&display=swap';

export function ensureKitFonts() {
  if (document.getElementById('fk-kit-fonts')) return;
  const pre1 = document.createElement('link');
  pre1.rel = 'preconnect';
  pre1.href = 'https://fonts.googleapis.com';
  const pre2 = document.createElement('link');
  pre2.rel = 'preconnect';
  pre2.href = 'https://fonts.gstatic.com';
  pre2.crossOrigin = 'anonymous';
  const link = document.createElement('link');
  link.id = 'fk-kit-fonts';
  link.rel = 'stylesheet';
  link.href = FONT_HREF;
  document.head.append(pre1, pre2, link);
}
