module.exports = {
  apps: [
    {
      name: 'materiales-ot',
      script: 'src/server.js',
      cwd: '/webs/materiales-ot',
      node_args: '--env-file=.env',
      env: {
        NODE_ENV: 'production'
      },
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      watch: false
    }
  ]
};
