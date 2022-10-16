import { GalleryAPI } from './components/GalleryAPI';
import { PaginationAPI } from './components/PaginationAPI';
import { NotificationAPI } from './components/NotificationAPI';
import { LDStorageAPI } from './utils/LibraryDataStorageAPI';
import { TMDBAPI } from './libs/TMDBAPI';
import { BackendConfigStorage } from './libs/BackendConfigStorage.js';
import { MovieModalHandler } from './components/MovieModalHandler';

import { readFromLocalStorage } from './utils/WebStorageMethods';

const GENRES_DATA_LS_KEY = 'genres-data';
const MOVIE_INFO = {
  WATCHED: 'watched',
  QUEUED: 'queued',
  SEARCHED: 'searched',
};
let galleryAPI = null;
let activeLibMode = null;
let moviesData = null;
let libraryMoviesSearchForm = null;
let noFoundWarningMessage = null;
let librarySearchFieldInput = null;

// MAIN
(async () => {
  try {
    LDStorageAPI.init();
    NotificationAPI.init('body');
    await BackendConfigStorage.init();

    LDStorageAPI.setActiveStorage(MOVIE_INFO.WATCHED);
    activeLibMode = MOVIE_INFO.WATCHED;

    moviesData = LDStorageAPI.getMoviesByPage(PaginationAPI.currentPage);
    PaginationAPI.totalPages = LDStorageAPI.getTotalPages();

    const tmdbAPI = new TMDBAPI();
    const pathToPosterImg = (await tmdbAPI.getConfiguration()).images
      .secure_base_url;

    const genresAndIDs = readFromLocalStorage(GENRES_DATA_LS_KEY);
    galleryAPI = new GalleryAPI(
      '#movies-wrapper',
      pathToPosterImg,
      genresAndIDs
    );
    //hide spinner if there aren't movies else add listener for images loading
    moviesData?.length
      ? galleryAPI.addOnCriticalImagesLoadedCallback(
          onGalleryLoadedCriticalImages
        )
      : (document.querySelector('.loader--critical').style.display = 'none');
    galleryAPI.renderMoviesCards(moviesData);
    PaginationAPI.renderPagination();
    const mmh = new MovieModalHandler(
      galleryAPI,
      MovieModalHandler.MODE.LIBRARY_WATCHED,
      onMovieStatusChanged
    );

    // Added event listeners
    PaginationAPI.paginationWrapperDiv.addEventListener(
      'click',
      onPaginationWrapperBtnClick
    );
    const libButtonsWrapper = document.querySelector(
      '.header-library__buttons'
    );
    libButtonsWrapper.addEventListener('click', onLibraryBtnsClick);
    libraryMoviesSearchForm = document.getElementById(
      'library-movies-search-form'
    );
    libraryMoviesSearchForm.addEventListener(
      'submit',
      onLibraryMoviesSearchFormSubmit
    );

    noFoundWarningMessage = document.getElementById('library-no-movies');
    librarySearchFieldInput = document.getElementById('library-search-input');
    const resizeObserver = new ResizeObserver(PaginationAPI.onWindowResize);
    resizeObserver.observe(document.body);

    if (PaginationAPI.totalPages) {
      NotificationAPI.addNotification(
        'Showing your watched movies',
        false,
        3000
      );
      noFoundWarningMessage.setAttribute('style', 'display: none;');
      librarySearchFieldInput.removeAttribute('disabled');
    } else {
      noFoundWarningMessage.removeAttribute('style');
      librarySearchFieldInput.setAttribute('disabled', 'true');
    }
  } catch (error) {
    console.log(error.message);
    document.querySelector('.loader--critical').style.display = 'none';
    NotificationAPI.addNotification(
      'Something went wrong! Here is the log: ' + error.message,
      true
    );
  }
})();

function onGalleryLoadedCriticalImages() {
  document.querySelector('.loader--critical').style.display = 'none';
  document.body.classList.remove('body-clip-overflow');
}

function onPaginationWrapperBtnClick(e) {
  if (e.target.nodeName !== 'BUTTON') return;

  let buttonId = e.target.id;

  switch (buttonId) {
    case 'pagination-button-next':
      PaginationAPI.changePageByOne(true);
      break;
    case 'pagination-button-previous':
      PaginationAPI.changePageByOne(false);
      break;
    case 'pagination-number-btn':
      if (parseInt(e.target.textContent) === PaginationAPI.currentPage) return;
      PaginationAPI.updateCurrentPage(parseInt(e.target.textContent));
      break;
    default:
      return;
  }

  renderGalleryByPage();
  PaginationAPI.renderPagination();
}

function renderGalleryByPage() {
  moviesData = LDStorageAPI.getMoviesByPage(PaginationAPI.currentPage);
  //if there isn't movies on current page - decrease page, and try again
  if (!moviesData.length) {
    PaginationAPI.changePageByOne(false);
    if (PaginationAPI.currentPage < 1) {
      if (activeLibMode === MOVIE_INFO.SEARCHED && moviesData.length === 1) {
        PaginationAPI.currentPage = 1;
        LDStorageAPI.setActiveStorage(LDStorageAPI.lastActiveMovieInfo);
        librarySearchFieldInput.value = '';
        renderGalleryByPage();

        return;
      }

      librarySearchFieldInput.value = '';
      PaginationAPI.updateCurrentPage(1);
      galleryAPI.renderMoviesCards(moviesData);
      PaginationAPI.totalPages = 0;

      noFoundWarningMessage.removeAttribute('style');
      librarySearchFieldInput.setAttribute('disabled', 'true');
      return;
    }
    renderGalleryByPage();
  }

  if (!noFoundWarningMessage.hasAttribute('style')) {
    noFoundWarningMessage.setAttribute('style', 'display: none;');
    librarySearchFieldInput.removeAttribute('disabled');
  }
  PaginationAPI.totalPages = LDStorageAPI.getTotalPages();

  galleryAPI.renderMoviesCards(moviesData);
  return;
}

function onLibraryBtnsClick(e) {
  const clickedEl = e.target;
  if (clickedEl.nodeName !== 'BUTTON') return;

  // resetting search field input if there is anything written in there
  librarySearchFieldInput.value = '';
  LDStorageAPI.lastSearchRequest = null;

  const clickedLibMode =
    clickedEl.id === 'library-watched' ? MOVIE_INFO.WATCHED : MOVIE_INFO.QUEUED;
  if (clickedLibMode === activeLibMode) return;

  const prevButtonEl = e.currentTarget.querySelector(
    `button:not(#${clickedEl.id})`
  );
  prevButtonEl.classList.remove('btn-active');
  clickedEl.classList.add('btn-active');
  activeLibMode = clickedLibMode;
  PaginationAPI.currentPage = 1;

  switch (activeLibMode) {
    case MOVIE_INFO.WATCHED:
      LDStorageAPI.setActiveStorage(MOVIE_INFO.WATCHED);
      break;
    case MOVIE_INFO.QUEUED:
      LDStorageAPI.setActiveStorage(MOVIE_INFO.QUEUED);
      break;
  }

  moviesData = LDStorageAPI.getMoviesByPage(PaginationAPI.currentPage);
  PaginationAPI.totalPages = LDStorageAPI.getTotalPages();

  if (PaginationAPI.totalPages) {
    NotificationAPI.addNotification(
      `Showing your ${activeLibMode} movies`,
      false,
      3000
    );
    noFoundWarningMessage.setAttribute('style', 'display: none;');
    librarySearchFieldInput.removeAttribute('disabled');
  } else {
    noFoundWarningMessage.removeAttribute('style');
    librarySearchFieldInput.setAttribute('disabled', 'true');
  }

  galleryAPI.renderMoviesCards(moviesData);
  PaginationAPI.renderPagination();
}

function onLibraryMoviesSearchFormSubmit(e) {
  e.preventDefault();
  const moviesSearchRequest = e.currentTarget.elements.query.value;

  if (moviesSearchRequest === LDStorageAPI.lastSearchRequest) return;

  if (moviesSearchRequest === '') {
    if (LDStorageAPI.lastSearchRequest === null) return;
    LDStorageAPI.lastSearchRequest = '';

    LDStorageAPI.setActiveStorage(LDStorageAPI.lastActiveMovieInfo);
    activeLibMode = LDStorageAPI.lastActiveMovieInfo;
    PaginationAPI.totalPages = LDStorageAPI.getTotalPages();
    PaginationAPI.updateCurrentPage(1);

    renderGalleryByPage();
    PaginationAPI.renderPagination();
    return;
  }

  moviesData =
    LDStorageAPI.searchInLastActiveStorageMovies(moviesSearchRequest);

  if (!moviesData.length) {
    NotificationAPI.addNotification(
      `Oops, there are no results matching your search request...`,
      false,
      3000
    );
    return;
  }

  NotificationAPI.addNotification(
    `Here are the movies matching '${moviesSearchRequest}' request`,
    false,
    3000
  );

  LDStorageAPI.setActiveStorage(MOVIE_INFO.SEARCHED);
  activeLibMode = MOVIE_INFO.SEARCHED;

  PaginationAPI.totalPages = LDStorageAPI.getTotalPages();
  PaginationAPI.updateCurrentPage(1);

  galleryAPI.renderMoviesCards(moviesData);
  PaginationAPI.renderPagination();
}

function onMovieStatusChanged(action) {
  let needRerender = false;
  if (
    (action === MovieModalHandler.MOVIE_ACTIONS.REMOVED_FROM_WATCHED ||
      action === MovieModalHandler.MOVIE_ACTIONS.ADDED_TO_WATCHED) &&
    activeLibMode === MOVIE_INFO.WATCHED
  ) {
    LDStorageAPI.setActiveStorage(MOVIE_INFO.WATCHED);
    needRerender = true;
  }
  if (
    (action === MovieModalHandler.MOVIE_ACTIONS.REMOVED_FROM_QUEUED ||
      action === MovieModalHandler.MOVIE_ACTIONS.ADDED_TO_QUEUED) &&
    activeLibMode === MOVIE_INFO.QUEUED
  ) {
    LDStorageAPI.setActiveStorage(MOVIE_INFO.QUEUED);
    needRerender = true;
  }

  if (
    (action === MovieModalHandler.MOVIE_ACTIONS.REMOVED_FROM_QUEUED ||
      action === MovieModalHandler.MOVIE_ACTIONS.ADDED_TO_QUEUED ||
      action === MovieModalHandler.MOVIE_ACTIONS.REMOVED_FROM_WATCHED ||
      action === MovieModalHandler.MOVIE_ACTIONS.ADDED_TO_WATCHED) &&
    activeLibMode === MOVIE_INFO.SEARCHED
  ) {
    LDStorageAPI.searchInLastActiveStorageMovies(
      LDStorageAPI.lastSearchRequest
    );
    LDStorageAPI.setActiveStorage(MOVIE_INFO.SEARCHED);
    needRerender = true;
  }

  if (needRerender) {
    renderGalleryByPage();
    PaginationAPI.renderPagination();
  }
}
