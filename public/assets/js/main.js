(function () {
  // Early Bird Offer Timer
  function checkEarlyBirdOffer() {
    const earlyBirdElement = document.getElementById('earlyBirdOffer');
    if (!earlyBirdElement) return;

    const now = new Date();
    const deadline = new Date('2026-01-07T23:59:59');

    if (now > deadline) {
      earlyBirdElement.classList.add('hidden');
    }
  }

  // Check early bird offer on page load
  checkEarlyBirdOffer();

  const form = document.getElementById('registrationForm');
  const statusEl = document.getElementById('formStatus');

  function setStatus(msg, type) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.dataset.type = type || 'info';
    statusEl.style.borderColor = type === 'error' ? 'rgba(255,90,95,.45)' : 'rgba(56,217,150,.35)';
    statusEl.style.background = type === 'error' ? 'rgba(255,90,95,.12)' : 'rgba(56,217,150,.10)';
    statusEl.style.color = type === 'error' ? '#ffd3d5' : '#d7fff0';
    statusEl.style.display = 'block';
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const consent = document.getElementById('consent');
      if (consent && !consent.checked) {
        setStatus('Please confirm consent to continue.', 'error');
        return;
      }

      const fd = new FormData(form);

      try {
        setStatus('Submitting your registration...', 'info');

        const res = await fetch('/api/register', {
          method: 'POST',
          body: fd
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          setStatus(data.message || 'Submission failed. Please try again.', 'error');
          return;
        }

        // Redirect to thank you page with registration id
        const id = encodeURIComponent(data.registration_id || '');
        window.location.href = '/thank-you.html?id=' + id;

      } catch (err) {
        setStatus('Network error. Please try again.', 'error');
      }
    });
  }

  // Sticky CTA scroll
  const ctas = document.querySelectorAll('[data-scroll-to]');
  ctas.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = btn.getAttribute('data-scroll-to');
      if (!target) return;
      const el = document.querySelector(target);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
})();
