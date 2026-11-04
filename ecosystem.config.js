module.exports = {
  apps: [
    {
      name: 'mc-client-bot',
      script: 'server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '650M', // 650M threshold for stable multi-bot operation (1GB RAM + 2GB Swap)
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
