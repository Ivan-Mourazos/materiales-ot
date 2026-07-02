module.exports = {
  apps: [
    {
      name: 'materiales-ot',
      script: 'src/server.js',
      cwd: '/webs/materiales-ot',
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production'
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      watch: false
    }
  ]
};
