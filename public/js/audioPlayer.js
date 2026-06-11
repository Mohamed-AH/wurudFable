/**
 * Sticky Audio Player
 * Manages global audio playback across the site
 */

// Debug mode - only log in development (localhost)
const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const log = isDev ? console.log.bind(console) : function() {};

class AudioPlayer {
  constructor() {
    this.audio = document.getElementById('audio');
    this.player = document.getElementById('audioPlayer');
    this.currentLecture = null;
    this.isPlaying = false;
    this.isDragging = false;
    this.isTouchDragging = false;

    // Initialize elements
    this.initElements();

    // Load saved preferences
    this.loadPreferences();

    // Set up event listeners
    this.setupEventListeners();

    // Make globally accessible
    window.audioPlayer = this;
  }

  initElements() {
    // Info elements
    this.titleEl = document.getElementById('playerLectureTitle');
    this.sheikhEl = document.getElementById('playerSheikhName');

    // Control buttons
    this.playPauseBtn = document.getElementById('playPauseBtn');
    this.playPauseIcon = document.getElementById('playPauseIcon');
    this.skipBackwardBtn = document.getElementById('skipBackward');
    this.skipForwardBtn = document.getElementById('skipForward');
    this.closePlayerBtn = document.getElementById('closePlayerBtn');

    // Progress elements
    this.progressContainer = document.getElementById('progressContainer');
    this.progressBar = document.getElementById('progressBar');
    this.progressHandle = document.getElementById('progressHandle');
    this.currentTimeEl = document.getElementById('currentTime');
    this.durationEl = document.getElementById('duration');

    // Speed control
    this.speedBtn = document.getElementById('speedBtn');
    this.speedMenu = document.getElementById('speedMenu');
    this.speedLabel = document.getElementById('speedLabel');

    // Volume control
    this.muteBtn = document.getElementById('muteBtn');
    this.volumeIcon = document.getElementById('volumeIcon');
    this.volumeSlider = document.getElementById('volumeSlider');

    // Download button
    this.downloadBtn = document.getElementById('downloadBtn');
  }

  setupEventListeners() {
    // Audio events
    this.audio.addEventListener('loadedmetadata', () => this.onLoadedMetadata());
    this.audio.addEventListener('timeupdate', () => this.onTimeUpdate());
    this.audio.addEventListener('ended', () => this.onEnded());
    this.audio.addEventListener('play', () => this.onPlay());
    this.audio.addEventListener('pause', () => this.onPause());
    this.audio.addEventListener('error', (e) => this.onError(e));

    // Control buttons
    this.playPauseBtn.addEventListener('click', () => this.togglePlayPause());
    this.skipBackwardBtn.addEventListener('click', () => this.skip(-15));
    this.skipForwardBtn.addEventListener('click', () => this.skip(15));
    this.closePlayerBtn.addEventListener('click', () => this.close());

    // Progress bar - mouse events
    this.progressContainer.addEventListener('mousedown', (e) => this.startDrag(e));

    // Progress bar - touch events (for mobile)
    this.progressContainer.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
    this.progressContainer.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
    this.progressContainer.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });

    // Prevent background scroll when touching the player
    this.player.addEventListener('touchmove', (e) => {
      if (e.target.closest('.progress-container')) {
        e.preventDefault();
      }
    }, { passive: false });

    // Speed control
    this.speedBtn.addEventListener('click', () => this.toggleSpeedMenu());
    document.querySelectorAll('.speed-option').forEach(btn => {
      btn.addEventListener('click', (e) => this.setSpeed(parseFloat(e.target.dataset.speed)));
    });

    // Volume control
    this.muteBtn.addEventListener('click', () => this.toggleMute());
    this.volumeSlider.addEventListener('input', (e) => this.setVolume(e.target.value));

    // Close speed menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.speed-control')) {
        this.speedMenu.classList.add('hidden');
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => this.handleKeyboard(e));
  }

  /**
   * Play a lecture
   * @param {string} lectureId - Lecture MongoDB ID
   * @param {object} lectureData - Lecture metadata (title, sheikh, etc.)
   */
  play(lectureId, lectureData) {
    log('▶️ Playing lecture:', lectureId, lectureData);

    this.currentLecture = {
      id: lectureId,
      ...lectureData
    };

    // Update UI
    this.titleEl.textContent = lectureData.title || lectureData.titleArabic || 'Unknown';
    this.sheikhEl.textContent = lectureData.sheikh || '';

    // Set audio source
    const streamUrl = `/stream/${lectureId}`;
    this.audio.src = streamUrl;

    // Set download link
    this.downloadBtn.href = `/download/${lectureId}`;
    this.downloadBtn.style.display = 'block';

    // Show player
    this.show();

    // Load saved position for this lecture
    const savedPosition = this.getSavedPosition(lectureId);
    if (savedPosition > 0) {
      this.audio.currentTime = savedPosition;
    }

    // Play
    this.audio.play().catch(err => {
      console.error('❌ Playback error:', err);
      alert('Could not play audio. Please check if the file exists.');
    });
  }

  togglePlayPause() {
    if (this.audio.paused) {
      this.audio.play();
    } else {
      this.audio.pause();
    }
  }

  skip(seconds) {
    this.audio.currentTime = Math.max(0, Math.min(this.audio.duration, this.audio.currentTime + seconds));
  }

  /**
   * Seek to a specific time in seconds
   * @param {number} seconds - Time to seek to
   */
  seekToTime(seconds) {
    // Validate input - must be a finite number
    if (typeof seconds !== 'number' || !isFinite(seconds)) {
      console.warn('Invalid seek time:', seconds);
      return;
    }

    // Wait for audio to be ready
    if (!this.audio.duration || isNaN(this.audio.duration)) {
      // If not ready, wait for loadedmetadata
      this.audio.addEventListener('loadedmetadata', () => {
        this.audio.currentTime = Math.max(0, Math.min(this.audio.duration, seconds));
      }, { once: true });
      return;
    }

    this.audio.currentTime = Math.max(0, Math.min(this.audio.duration, seconds));
  }

  seek(e) {
    if (!this.audio.duration || isNaN(this.audio.duration)) return;

    const rect = this.progressContainer.getBoundingClientRect();
    const isRTL = document.documentElement.dir === 'rtl';

    // Calculate percent - invert for RTL
    let percent;
    if (isRTL) {
      percent = Math.max(0, Math.min(1, (rect.right - e.clientX) / rect.width));
    } else {
      percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    }

    const newTime = percent * this.audio.duration;

    // Update visual immediately for smooth feedback
    this.progressBar.style.width = `${percent * 100}%`;
    this.currentTimeEl.textContent = this.formatTime(newTime);

    this.audio.currentTime = newTime;
  }

  startDrag(e) {
    e.preventDefault();
    this.isDragging = true;

    // Add dragging class for visual feedback
    this.progressContainer.classList.add('dragging');
    document.body.classList.add('audio-seeking');

    // Seek to initial click position
    this.seek(e);

    const onMouseMove = (e) => {
      if (this.isDragging) {
        this.seek(e);
      }
    };

    const onMouseUp = () => {
      this.isDragging = false;
      this.progressContainer.classList.remove('dragging');
      document.body.classList.remove('audio-seeking');
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  // Touch event handlers for mobile
  handleTouchStart(e) {
    e.preventDefault();
    this.isTouchDragging = true;

    // Add dragging class for visual feedback
    this.progressContainer.classList.add('dragging');
    document.body.classList.add('audio-seeking');

    this.seekFromTouch(e);
  }

  handleTouchMove(e) {
    if (this.isTouchDragging) {
      e.preventDefault();
      this.seekFromTouch(e);
    }
  }

  handleTouchEnd(e) {
    this.isTouchDragging = false;
    this.progressContainer.classList.remove('dragging');
    document.body.classList.remove('audio-seeking');
  }

  seekFromTouch(e) {
    if (!this.audio.duration || isNaN(this.audio.duration)) return;

    const touch = e.touches[0] || e.changedTouches[0];
    if (!touch) return;

    const rect = this.progressContainer.getBoundingClientRect();
    const isRTL = document.documentElement.dir === 'rtl';

    // Calculate percent - invert for RTL
    let percent;
    if (isRTL) {
      percent = Math.max(0, Math.min(1, (rect.right - touch.clientX) / rect.width));
    } else {
      percent = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
    }

    const newTime = percent * this.audio.duration;

    // Update visual immediately for smooth feedback
    this.progressBar.style.width = `${percent * 100}%`;
    this.currentTimeEl.textContent = this.formatTime(newTime);

    this.audio.currentTime = newTime;
  }

  toggleSpeedMenu() {
    this.speedMenu.classList.toggle('hidden');
  }

  setSpeed(speed) {
    this.audio.playbackRate = speed;
    this.speedLabel.textContent = `${speed}x`;

    // Update active state
    document.querySelectorAll('.speed-option').forEach(btn => {
      btn.classList.toggle('active', parseFloat(btn.dataset.speed) === speed);
    });

    // Save preference
    localStorage.setItem('audioPlayerSpeed', speed);

    this.speedMenu.classList.add('hidden');
  }

  toggleMute() {
    this.audio.muted = !this.audio.muted;
    this.updateVolumeIcon();
  }

  setVolume(value) {
    this.audio.volume = value / 100;
    this.audio.muted = false;
    this.updateVolumeIcon();

    // Save preference
    localStorage.setItem('audioPlayerVolume', value);
  }

  updateVolumeIcon() {
    if (this.audio.muted || this.audio.volume === 0) {
      this.volumeIcon.textContent = '🔇';
    } else if (this.audio.volume < 0.5) {
      this.volumeIcon.textContent = '🔉';
    } else {
      this.volumeIcon.textContent = '🔊';
    }
  }

  show() {
    this.player.classList.remove('hidden');
    document.body.style.paddingBottom = '140px'; // Make space for player
  }

  close() {
    this.audio.pause();
    this.player.classList.add('hidden');
    document.body.style.paddingBottom = '0';

    // Save position before closing
    if (this.currentLecture) {
      this.savePosition(this.currentLecture.id, this.audio.currentTime);
    }
  }

  // Event handlers
  onLoadedMetadata() {
    this.durationEl.textContent = this.formatTime(this.audio.duration);

    // Verify duration with server (self-correcting duration sync)
    if (this.currentLecture && this.audio.duration > 0) {
      this.verifyDuration(this.currentLecture.id, this.audio.duration);
    }
  }

  /**
   * Verify and report duration to server for automatic correction
   * Uses localStorage to avoid duplicate reports for verified lectures
   */
  async verifyDuration(lectureId, actualDuration) {
    // Check if already verified locally
    const verifiedKey = `duration_verified_${lectureId}`;
    if (localStorage.getItem(verifiedKey)) {
      return; // Already verified, skip
    }

    try {
      const response = await fetch(`/api/lectures/${lectureId}/verify-duration`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ duration: actualDuration })
      });

      const data = await response.json();

      if (data.success) {
        // Mark as verified locally to avoid future checks
        localStorage.setItem(verifiedKey, 'true');

        if (data.updated) {
          log(`✅ Duration corrected: ${data.oldDuration}s → ${data.newDuration}s`);
        } else if (data.verified) {
          log(`✅ Duration verified: ${Math.round(actualDuration)}s`);
        }
      }
    } catch (error) {
      // Silently fail - non-critical operation
      console.warn('Duration verification failed:', error.message);
    }
  }

  onTimeUpdate() {
    // Skip visual updates during drag to prevent jumping
    if (this.isDragging || this.isTouchDragging) return;

    // Update progress bar
    const percent = (this.audio.currentTime / this.audio.duration) * 100;
    this.progressBar.style.width = `${percent}%`;

    // Update current time
    this.currentTimeEl.textContent = this.formatTime(this.audio.currentTime);

    // Auto-save position every 5 seconds
    if (this.currentLecture && this.audio.currentTime % 5 < 0.5) {
      this.savePosition(this.currentLecture.id, this.audio.currentTime);
    }
  }

  onEnded() {
    this.playPauseIcon.textContent = '▶';
    this.isPlaying = false;

    // Clear saved position
    if (this.currentLecture) {
      this.savePosition(this.currentLecture.id, 0);
    }
  }

  onPlay() {
    this.playPauseIcon.textContent = '⏸';
    this.isPlaying = true;
  }

  onPause() {
    this.playPauseIcon.textContent = '▶';
    this.isPlaying = false;
  }

  onError(e) {
    console.error('❌ Audio error:', e);
    alert('Error playing audio. The file may not exist or is not accessible.');
  }

  // Keyboard shortcuts
  handleKeyboard(e) {
    // Only handle if player is visible and not typing in input
    if (this.player.classList.contains('hidden') || e.target.tagName === 'INPUT') {
      return;
    }

    switch(e.key) {
      case ' ':
        e.preventDefault();
        this.togglePlayPause();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        this.skip(-15);
        break;
      case 'ArrowRight':
        e.preventDefault();
        this.skip(15);
        break;
      case 'm':
      case 'M':
        this.toggleMute();
        break;
    }
  }

  // Utility functions
  formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';

    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  savePosition(lectureId, position) {
    try {
      localStorage.setItem(`audioPlayer_pos_${lectureId}`, position);
    } catch (e) {
      console.warn('Could not save position:', e);
    }
  }

  getSavedPosition(lectureId) {
    try {
      return parseFloat(localStorage.getItem(`audioPlayer_pos_${lectureId}`)) || 0;
    } catch (e) {
      return 0;
    }
  }

  loadPreferences() {
    // Load volume
    const savedVolume = localStorage.getItem('audioPlayerVolume');
    if (savedVolume !== null) {
      this.audio.volume = savedVolume / 100;
      this.volumeSlider.value = savedVolume;
    }

    // Load playback speed
    const savedSpeed = localStorage.getItem('audioPlayerSpeed');
    if (savedSpeed !== null) {
      this.setSpeed(parseFloat(savedSpeed));
    }
  }
}

// Initialize when DOM is ready
log('🎵 Audio Player script loaded');
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    log('🎵 Initializing Audio Player...');
    window.audioPlayer = new AudioPlayer();
    log('✅ Audio Player initialized:', window.audioPlayer);
  });
} else {
  log('🎵 Initializing Audio Player (already loaded)...');
  window.audioPlayer = new AudioPlayer();
  log('✅ Audio Player initialized:', window.audioPlayer);
}
