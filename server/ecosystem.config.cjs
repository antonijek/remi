module.exports = {
  apps: [{ name: 'remi-server', script: 'dist/index.js', cwd: __dirname, env: { PORT: 3005 } }],
};
