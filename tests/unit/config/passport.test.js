/**
 * Unit Tests for Passport Configuration
 * Tests Google OAuth strategy, serialization, and user handling
 */

// Mock the models module at the top level
const mockAdmin = {
  findById: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  isEmailWhitelisted: jest.fn()
};

jest.mock('../../../models', () => ({
  Admin: mockAdmin
}));

// Mock passport-google-oauth20
let capturedVerifyCallback = null;
jest.mock('passport-google-oauth20', () => ({
  Strategy: jest.fn().mockImplementation((config, callback) => {
    capturedVerifyCallback = callback;
    return { name: 'google', _verify: callback };
  })
}));

describe('Passport Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
    capturedVerifyCallback = null;
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  describe('Google OAuth Strategy Configuration', () => {
    it('should not configure strategy when credentials are missing', () => {
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
      delete process.env.GOOGLE_CALLBACK_URL;

      jest.resetModules();
      require('../../../config/passport');

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Google OAuth not configured')
      );
    });

    it('should configure strategy with correct options when credentials exist', () => {
      process.env.GOOGLE_CLIENT_ID = 'test-client-id';
      process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
      process.env.GOOGLE_CALLBACK_URL = 'http://localhost:3000/auth/google/callback';

      jest.resetModules();
      const GoogleStrategy = require('passport-google-oauth20').Strategy;
      require('../../../config/passport');

      expect(GoogleStrategy).toHaveBeenCalledWith(
        expect.objectContaining({
          clientID: 'test-client-id',
          clientSecret: 'test-client-secret',
          callbackURL: 'http://localhost:3000/auth/google/callback'
        }),
        expect.any(Function)
      );
    });
  });

  describe('Google OAuth Verify Callback', () => {
    beforeEach(() => {
      process.env.GOOGLE_CLIENT_ID = 'test-id';
      process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
      process.env.GOOGLE_CALLBACK_URL = 'http://localhost/callback';
      process.env.NODE_ENV = 'test';

      jest.resetModules();
      require('../../../config/passport');
    });

    const createMockProfile = (overrides = {}) => ({
      id: 'google-123',
      displayName: 'Test User',
      emails: [{ value: 'test@example.com' }],
      name: { givenName: 'Test', familyName: 'User' },
      photos: [{ value: 'https://photo.url/image.jpg' }],
      ...overrides
    });

    it('should reject unauthorized email not in whitelist and not pre-created', async () => {
      mockAdmin.isEmailWhitelisted.mockReturnValue(false);
      mockAdmin.findOne.mockResolvedValue(null);

      const done = jest.fn();
      const profile = createMockProfile();

      await capturedVerifyCallback('accessToken', 'refreshToken', profile, done);

      expect(done).toHaveBeenCalledWith(null, false, expect.objectContaining({
        message: expect.stringContaining('Unauthorized')
      }));
    });

    it('should allow whitelisted email', async () => {
      const adminUser = {
        _id: 'admin-123',
        googleId: 'google-123',
        email: 'admin@example.com',
        role: 'admin',
        isActive: true,
        updateLastLogin: jest.fn().mockResolvedValue()
      };

      mockAdmin.isEmailWhitelisted.mockReturnValue(true);
      mockAdmin.findOne
        .mockResolvedValueOnce(adminUser)  // First call for existingUser
        .mockResolvedValueOnce(adminUser); // Second call for googleId lookup

      const done = jest.fn();
      const profile = createMockProfile({ emails: [{ value: 'admin@example.com' }] });

      await capturedVerifyCallback('accessToken', 'refreshToken', profile, done);

      expect(done).toHaveBeenCalledWith(null, adminUser);
    });

    it('should allow pre-created editor', async () => {
      const editorUser = {
        _id: 'editor-123',
        email: 'editor@example.com',
        role: 'editor',
        isActive: true,
        updateLastLogin: jest.fn().mockResolvedValue()
      };

      mockAdmin.isEmailWhitelisted.mockReturnValue(false);
      mockAdmin.findOne
        .mockResolvedValueOnce(editorUser)  // existingUser found
        .mockResolvedValueOnce(null);       // No googleId match

      const done = jest.fn();
      const profile = createMockProfile({ emails: [{ value: 'editor@example.com' }] });

      await capturedVerifyCallback('accessToken', 'refreshToken', profile, done);

      expect(editorUser.googleId).toBe('google-123');
      expect(done).toHaveBeenCalledWith(null, editorUser);
    });

    it('should update existing admin on login', async () => {
      const existingAdmin = {
        _id: 'admin-123',
        googleId: 'google-123',
        email: 'admin@example.com',
        role: 'admin',
        isActive: true,
        updateLastLogin: jest.fn().mockResolvedValue()
      };

      mockAdmin.isEmailWhitelisted.mockReturnValue(true);
      mockAdmin.findOne
        .mockResolvedValueOnce(existingAdmin)
        .mockResolvedValueOnce(existingAdmin); // Found by googleId

      const done = jest.fn();
      const profile = createMockProfile({
        displayName: 'Updated Name',
        emails: [{ value: 'admin@example.com' }]
      });

      await capturedVerifyCallback('accessToken', 'refreshToken', profile, done);

      expect(existingAdmin.displayName).toBe('Updated Name');
      expect(existingAdmin.updateLastLogin).toHaveBeenCalled();
    });

    it('should create new admin for whitelisted email', async () => {
      const newAdmin = {
        _id: 'new-admin',
        googleId: 'google-123',
        email: 'new@example.com',
        role: 'editor',
        isActive: true
      };

      mockAdmin.isEmailWhitelisted.mockReturnValue(true);
      mockAdmin.findOne
        .mockResolvedValueOnce(null)  // No existing user
        .mockResolvedValueOnce(null); // No googleId match
      mockAdmin.create.mockResolvedValue(newAdmin);

      const done = jest.fn();
      const profile = createMockProfile({
        emails: [{ value: 'new@example.com' }]
      });

      await capturedVerifyCallback('accessToken', 'refreshToken', profile, done);

      expect(mockAdmin.create).toHaveBeenCalledWith(expect.objectContaining({
        googleId: 'google-123',
        email: 'new@example.com',
        displayName: 'Test User',
        isActive: true
      }));
      expect(done).toHaveBeenCalledWith(null, newAdmin);
    });

    it('should handle OAuth errors gracefully', async () => {
      const dbError = new Error('Database connection failed');

      mockAdmin.isEmailWhitelisted.mockReturnValue(true);
      mockAdmin.findOne.mockRejectedValue(dbError);

      const done = jest.fn();
      const profile = createMockProfile();

      await capturedVerifyCallback('accessToken', 'refreshToken', profile, done);

      expect(done).toHaveBeenCalledWith(dbError, null);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Google OAuth error'),
        dbError
      );
    });

    it('should handle missing profile fields gracefully', async () => {
      const newAdmin = {
        _id: 'new-admin',
        googleId: 'google-123',
        email: 'minimal@example.com',
        isActive: true
      };

      mockAdmin.isEmailWhitelisted.mockReturnValue(true);
      mockAdmin.findOne.mockResolvedValue(null);
      mockAdmin.create.mockResolvedValue(newAdmin);

      const done = jest.fn();
      const profile = {
        id: 'google-123',
        displayName: 'Minimal User',
        emails: [{ value: 'minimal@example.com' }]
        // No name or photos
      };

      await capturedVerifyCallback('accessToken', 'refreshToken', profile, done);

      expect(mockAdmin.create).toHaveBeenCalledWith(expect.objectContaining({
        firstName: '',
        lastName: '',
        profilePhoto: ''
      }));
    });
  });
});
