(function initializeMediaGallery() {
  const cards = Array.from(document.querySelectorAll('.media-card'));
  if (!cards.length) return;

  function loadVideo(video) {
    if (video.hasAttribute('src')) return;
    video.src = video.dataset.mediaSrc;
    video.load();
  }

  function pauseOthers(activeVideo) {
    cards.forEach(card => {
      const video = card.querySelector('video');
      if (video === activeVideo) return;
      video.pause();
      card.classList.remove('is-playing');
      card.querySelector('.media-toggle span').textContent = '▶';
    });
  }

  cards.forEach(card => {
    const video = card.querySelector('video');
    const button = card.querySelector('.media-toggle');
    const icon = button.querySelector('span');
    video.muted = true;
    video.defaultMuted = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');

    button.addEventListener('click', async () => {
      if (!video.paused) {
        video.pause();
        card.classList.remove('is-playing');
        icon.textContent = '▶';
        button.setAttribute('aria-label', button.getAttribute('aria-label').replace('Pausar', 'Reproducir'));
        return;
      }

      pauseOthers(video);
      loadVideo(video);
      try {
        await video.play();
        card.classList.add('is-playing');
        icon.textContent = 'Ⅱ';
        button.setAttribute('aria-label', button.getAttribute('aria-label').replace('Reproducir', 'Pausar'));
      } catch (_error) {
        card.classList.remove('is-playing');
      }
    });

    video.addEventListener('error', () => card.classList.remove('is-playing'));
  });

  if (!('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const video = entry.target.querySelector('video');
      video.preload = 'metadata';
      observer.unobserve(entry.target);
    });
  }, { rootMargin:'160px 80px', threshold:.15 });
  cards.forEach(card => observer.observe(card));
})();
