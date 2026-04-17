// modules/cache.js
// Централизованное управление кэшем всех страниц

const cacheState = {
  dashboard: false,
  students: false,
  groups: false,
  schedule: false,
  finance: false,
  lessons: false,
  notes: false,
  stats: false
};

// Сбросить кэш конкретной страницы
export function resetCache(page) {
  if (cacheState.hasOwnProperty(page)) {
    cacheState[page] = false;
  }
}

// Сбросить кэш ВСЕХ страниц (например, после любого изменения данных)
export function resetAllCaches() {
  Object.keys(cacheState).forEach(key => {
    cacheState[key] = false;
  });
}

// Проверить, загружена ли страница
export function isPageCached(page) {
  return cacheState[page] === true;
}

// Отметить страницу как загруженную
export function setPageCached(page) {
  if (cacheState.hasOwnProperty(page)) {
    cacheState[page] = true;
  }
}

// Сбросить кэш ВСЕХ страниц, кроме указанной
export function resetAllCachesExcept(exceptPage) {
  Object.keys(cacheState).forEach(key => {
    if (key !== exceptPage) {
      cacheState[key] = false;
    }
  });
}

// Сбросить всё, что связано с учениками и оплатами
export function resetStudentRelatedCaches() {
  cacheState.students = false;
  cacheState.dashboard = false;
  cacheState.lessons = false;
  cacheState.finance = false;
  cacheState.stats = false;
}

// Сбросить всё, что связано с уроками
export function resetLessonRelatedCaches() {
  cacheState.lessons = false;
  cacheState.dashboard = false;
  cacheState.students = false;
  cacheState.groups = false;
  cacheState.schedule = false;
  cacheState.stats = false;
}