(function initializeHeroVideo() {
  const video = document.querySelector('.hero-video');
  if (!video) return;

  video.muted = true;
  video.defaultMuted = true;
  video.setAttribute('muted', '');
  video.setAttribute('autoplay', '');
  video.setAttribute('playsinline', '');

  const showVideo = () => video.classList.add('is-playing');
  const keepPoster = () => video.classList.remove('is-playing');

  video.addEventListener('playing', showVideo);
  video.addEventListener('error', keepPoster);

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    video.pause();
    keepPoster();
    return;
  }

  const playback = video.play();
  if (playback && typeof playback.catch === 'function') playback.catch(keepPoster);
})();
