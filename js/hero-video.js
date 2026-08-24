(function initializeHeroVideo() {
  const video = document.querySelector('.hero-video');
  const playButton = document.querySelector('.hero-video-play');
  if (!video) return;

  video.muted = true;
  video.defaultMuted = true;
  video.setAttribute('muted', '');
  video.setAttribute('autoplay', '');
  video.setAttribute('playsinline', '');

  let loadedRetryUsed = false;
  let playInFlight = false;
  let frameRequested = false;
  const showVideo = () => {
    video.classList.add('is-playing');
    playButton?.classList.remove('is-visible');
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
  const keepPoster = ({ allowManual = true } = {}) => {
    video.classList.remove('is-playing');
    playButton?.classList.toggle('is-visible', allowManual);
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
  video.addEventListener('error', () => keepPoster({ allowManual:false }));
  video.addEventListener('loadeddata', () => {
    if (!video.paused || loadedRetryUsed) return;
    loadedRetryUsed = true;
    attemptPlayback();
  });
  playButton?.addEventListener('click', attemptPlayback);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && video.paused && !video.error) attemptPlayback();
  });

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    video.pause();
    keepPoster({ allowManual:false });
    return;
  }

  attemptPlayback();
})();
