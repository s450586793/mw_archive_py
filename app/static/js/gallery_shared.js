(function () {
  'use strict';

  function encodePathPreserveSlash(relPath) {
    return String(relPath || '')
      .split('/')
      .map((part) => encodeURIComponent(part))
      .join('/');
  }

  function buildModelFileUrl(modelDir, relPath) {
    return '/files/' + encodeURIComponent(String(modelDir || '')) + '/' + encodePathPreserveSlash(relPath);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      buildModelFileUrl,
      encodePathPreserveSlash,
    };
  }

  if (typeof window !== 'undefined') {
    window.buildModelFileUrl = buildModelFileUrl;
  }
})();
