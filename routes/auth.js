const express = require('express');
const router = express.Router();
const passport = require('../config/passport');

// @route   GET /auth/google
// @desc    Initiate Google OAuth flow
// @access  Public
router.get('/google',
  passport.authenticate('google', {
    scope: ['profile', 'email']
  })
);

// @route   GET /auth/google/callback
// @desc    Google OAuth callback
// @access  Public
router.get('/google/callback',
  passport.authenticate('google', {
    failureRedirect: '/admin/login?error=unauthorized',
    failureMessage: true
  }),
  (req, res) => {
    // Successful authentication
    res.redirect('/admin/dashboard');
  }
);

// @route   GET /auth/logout
// @desc    Logout user
// @access  Private
router.get('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) {
      return next(err);
    }
    req.session.destroy((err) => {
      if (err) {
        console.error('Session destruction error:', err);
      }
      res.redirect('/admin/login');
    });
  });
});

// @route   GET /auth/status
// @desc    Check authentication status (for API calls)
// @access  Public
router.get('/status', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({
      authenticated: true,
      user: {
        id: req.user._id,
        email: req.user.email,
        displayName: req.user.displayName,
        profilePhoto: req.user.profilePhoto
      }
    });
  } else {
    res.json({
      authenticated: false
    });
  }
});

module.exports = router;
