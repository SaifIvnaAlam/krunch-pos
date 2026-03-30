/** Jest stub: real `jose` lives in repo root `node_modules` (hoisted). */
module.exports = {
  createRemoteJWKSet: () => ({}),
  jwtVerify: async () => ({
    payload: {
      email: 'test@example.com',
      email_verified: true,
      sub: 'google-sub-1',
    },
  }),
};
