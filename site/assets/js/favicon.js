// Preserve the original random palette favicon, using cacheable local artwork.
(() => {
  const colors = ['ff0040', '00ff80', '0080ff', 'ffff00', 'ff8000', 'ff0080', '8000ff'];
  const link = document.querySelector('link[rel="icon"]') || document.createElement('link');
  link.rel = 'icon';
  link.type = 'image/svg+xml';
  link.href = '/assets/ships/' + colors[Math.floor(Math.random() * colors.length)] + '.svg';
  if (!link.isConnected) document.head.appendChild(link);
})();
