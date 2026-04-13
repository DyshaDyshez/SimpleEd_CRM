// modules/cache.js
// Простой кэш в памяти для страниц

const pageCache = {
    dashboard: false,
    groups: false,
    students: false,
    schedule: false,
    finance: false
  };
  
  export function isPageCached(page) {
    return pageCache[page] === true;
  }
  
  export function setPageCached(page, value = true) {
    if (pageCache.hasOwnProperty(page)) {
      pageCache[page] = value;
    }
  }
  
  export function resetPageCache(page) {
    setPageCached(page, false);
  }
  
  export function resetAllCache() {
    for (let key in pageCache) {
      pageCache[key] = false;
    }
  }