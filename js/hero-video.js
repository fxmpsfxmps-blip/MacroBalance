(function initializeHeroVideo() {
  const video = document.querySelector('.hero-video');
  if (!video) return;

  video.muted = true;
  video.defaultMuted = true;
  video.setAttribute('muted', '');
  video.setAttribute('autoplay', '');
  video.setAttribute('playsinline', '');

  let readinessRetryUsed = false;
  let resumeRetryUsed = false;
  let playInFlight = false;
  let frameRequested = false;
  const showVideo = () => {
    video.classList.add('is-playing');
  };
  const revealAfterFirstFrame = () => {
    if (frameRequested) return;
    frameRequested = true;
    if (typeof video.requestVideoFrameCallback === 'function') {
      video.requestVideoFrameCallback(showVideo);
      return;
    }
    video.addEventListener('timeupdate', showVideo, { once:true });
  };
  const keepPoster = () => {
    video.classList.remove('is-playing');
  };

  const attemptPlayback = async () => {
    if (playInFlight || document.hidden) return;
    playInFlight = true;
    try {
      await video.play();
    } catch (_error) {
      keepPoster();
    } finally {
      playInFlight = false;
    }
  };

  video.addEventListener('playing', revealAfterFirstFrame);
  video.addEventListener('error', keepPoster);
  const retryWhenReady = () => {
    if (!video.paused || readinessRetryUsed) return;
    readinessRetryUsed = true;
    attemptPlayback();
  };
  video.addEventListener('loadeddata', retryWhenReady);
  video.addEventListener('canplay', retryWhenReady);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && video.paused && !video.error && !resumeRetryUsed) {
      resumeRetryUsed = true;
      attemptPlayback();
    }
  });
  window.addEventListener('pageshow', event => {
    if (!event.persisted || !video.paused || video.error) return;
    resumeRetryUsed = false;
    attemptPlayback();
  });

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    video.pause();
    keepPoster();
    return;
  }

  attemptPlayback();
})();
